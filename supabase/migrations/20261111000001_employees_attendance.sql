-- ============================================================================
-- MIGRACIÓN: EMPLEADOS, HORARIOS Y ASISTENCIA
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
--
-- El personal de la empresa (puede o no tener usuario en la app: un obrero de obra
-- normalmente no lo tiene), sus horarios semanales y el registro de entrada y salida.
--   * Solo el Master Admin gestiona y consulta todo.
--   * employees: no se borran, se marcan inactivos.
--   * employee_schedules: bloques horarios por día de la semana (1 = lunes ... 7 = domingo).
--     Un día puede tener varios bloques (turno cortado). No hay turnos que crucen la
--     medianoche: cada bloque empieza y termina el mismo día.
--   * attendance_records: cada registro es una entrada y, cuando corresponde, su salida.
--     - Un empleado no puede tener dos entradas abiertas ni registros superpuestos.
--     - Marcar usa la hora del servidor (no se puede inventar la hora al marcar).
--     - Para corregir o cargar a mano, el admin indica la hora y un motivo obligatorio.
--     - Nada se borra: un registro equivocado se anula con motivo.
--   * attendance_report: días trabajados, horas, horas previstas por horario y llegadas
--     tarde (más de 10 minutos después del primer bloque del día).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TABLAS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  full_name TEXT NOT NULL CHECK (pg_catalog.btrim(full_name) <> '' AND pg_catalog.length(full_name) <= 120),
  document_number TEXT CHECK (document_number IS NULL OR pg_catalog.length(document_number) <= 20),
  job_title TEXT CHECK (job_title IS NULL OR pg_catalog.length(job_title) <= 80),
  phone TEXT CHECK (phone IS NULL OR pg_catalog.length(phone) <= 40),
  hire_date DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  notes TEXT CHECK (notes IS NULL OR pg_catalog.length(notes) <= 500),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_employees_company_id UNIQUE (company_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS employees_company_document_unique
  ON public.employees (company_id, document_number) WHERE document_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.employee_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  employee_id UUID NOT NULL,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  CONSTRAINT fk_schedules_employee FOREIGN KEY (company_id, employee_id)
    REFERENCES public.employees(company_id, id) ON DELETE RESTRICT,
  CONSTRAINT chk_schedule_order CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS employee_schedules_employee_idx ON public.employee_schedules (company_id, employee_id, weekday);

CREATE TABLE IF NOT EXISTS public.attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  employee_id UUID NOT NULL,
  check_in TIMESTAMPTZ NOT NULL,
  check_out TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'clock' CHECK (source IN ('clock', 'manual')),
  reason TEXT CHECK (reason IS NULL OR pg_catalog.length(reason) <= 500),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'voided')),
  voided_at TIMESTAMPTZ,
  voided_by UUID REFERENCES auth.users(id),
  void_reason TEXT CHECK (void_reason IS NULL OR pg_catalog.length(void_reason) <= 500),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_attendance_employee FOREIGN KEY (company_id, employee_id)
    REFERENCES public.employees(company_id, id) ON DELETE RESTRICT,
  CONSTRAINT chk_attendance_order CHECK (check_out IS NULL OR check_out > check_in),
  CONSTRAINT chk_attendance_void_state CHECK (
    (status = 'active' AND voided_at IS NULL AND voided_by IS NULL AND void_reason IS NULL)
    OR (status = 'voided' AND voided_at IS NOT NULL AND voided_by IS NOT NULL AND void_reason IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS attendance_company_in_idx ON public.attendance_records (company_id, check_in DESC);
CREATE INDEX IF NOT EXISTS attendance_employee_in_idx ON public.attendance_records (company_id, employee_id, check_in DESC);
-- Una sola entrada abierta por empleado, aunque dos personas marquen a la vez
CREATE UNIQUE INDEX IF NOT EXISTS attendance_one_open_per_employee
  ON public.attendance_records (employee_id) WHERE check_out IS NULL AND status = 'active';

-- ----------------------------------------------------------------------------
-- 2. PROTECCIONES, AUDITORÍA, RLS Y REALTIME
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_hr_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Estos registros no se pueden borrar: se marcan como inactivos o se anulan con motivo.';
END;
$$;

REVOKE ALL ON FUNCTION public.guard_hr_delete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tr_employees_no_delete ON public.employees;
CREATE TRIGGER tr_employees_no_delete BEFORE DELETE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.guard_hr_delete();
DROP TRIGGER IF EXISTS tr_attendance_no_delete ON public.attendance_records;
CREATE TRIGGER tr_attendance_no_delete BEFORE DELETE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.guard_hr_delete();

DROP TRIGGER IF EXISTS tr_audit_employees ON public.employees;
CREATE TRIGGER tr_audit_employees AFTER INSERT OR UPDATE OR DELETE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger('id');
DROP TRIGGER IF EXISTS tr_audit_employee_schedules ON public.employee_schedules;
CREATE TRIGGER tr_audit_employee_schedules AFTER INSERT OR UPDATE OR DELETE ON public.employee_schedules
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger('id');
DROP TRIGGER IF EXISTS tr_audit_attendance ON public.attendance_records;
CREATE TRIGGER tr_audit_attendance AFTER INSERT OR UPDATE OR DELETE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger('id');

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['employees', 'employee_schedules', 'attendance_records'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select_admin', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (
         company_id IN (SELECT private.my_active_company_ids())
         AND private.has_company_role(company_id, ''master_admin''))',
      t || '_select_admin', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM authenticated', t);
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END
$$;

-- ----------------------------------------------------------------------------
-- 3. EMPLEADOS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_employee(
  p_company_id UUID,
  p_employee_id UUID,
  p_full_name TEXT,
  p_document_number TEXT,
  p_job_title TEXT,
  p_phone TEXT,
  p_hire_date DATE,
  p_status TEXT,
  p_notes TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_name TEXT := pg_catalog.btrim(COALESCE(p_full_name, ''));
  v_doc TEXT := NULLIF(pg_catalog.btrim(COALESCE(p_document_number, '')), '');
  v_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  PERFORM private.assert_company_role(p_company_id, 'master_admin');

  IF v_name = '' THEN
    RAISE EXCEPTION 'Indicá el nombre del empleado.';
  END IF;
  IF p_status NOT IN ('active', 'inactive') THEN
    RAISE EXCEPTION 'Estado de empleado inválido.';
  END IF;
  IF v_doc IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.company_id = p_company_id AND e.document_number = v_doc AND e.id IS DISTINCT FROM p_employee_id
  ) THEN
    RAISE EXCEPTION 'Ya hay un empleado con ese documento.';
  END IF;

  IF p_employee_id IS NULL THEN
    INSERT INTO public.employees (company_id, full_name, document_number, job_title, phone, hire_date, status, notes, created_by)
    VALUES (
      p_company_id, v_name, v_doc, NULLIF(pg_catalog.btrim(COALESCE(p_job_title, '')), ''),
      NULLIF(pg_catalog.btrim(COALESCE(p_phone, '')), ''), p_hire_date, p_status,
      NULLIF(pg_catalog.btrim(COALESCE(p_notes, '')), ''), auth.uid()
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE public.employees SET
      full_name = v_name, document_number = v_doc,
      job_title = NULLIF(pg_catalog.btrim(COALESCE(p_job_title, '')), ''),
      phone = NULLIF(pg_catalog.btrim(COALESCE(p_phone, '')), ''),
      hire_date = p_hire_date, status = p_status,
      notes = NULLIF(pg_catalog.btrim(COALESCE(p_notes, '')), ''), updated_at = now()
    WHERE id = p_employee_id AND company_id = p_company_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Empleado no encontrado en esta empresa.';
    END IF;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_employee(UUID, UUID, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_employee(UUID, UUID, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. HORARIO SEMANAL (reemplaza todos los bloques del empleado de una vez)
-- p_blocks: [{"weekday": 1, "start": "08:00", "end": "12:00"}, ...]
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_employee_schedule(p_company_id UUID, p_employee_id UUID, p_blocks JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_block RECORD;
  v_count INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  PERFORM private.assert_company_role(p_company_id, 'master_admin');

  IF p_blocks IS NULL OR pg_catalog.jsonb_typeof(p_blocks) <> 'array' THEN
    RAISE EXCEPTION 'El horario debe ser una lista de bloques.';
  END IF;
  IF pg_catalog.jsonb_array_length(p_blocks) > 70 THEN
    RAISE EXCEPTION 'Demasiados bloques horarios.';
  END IF;

  PERFORM 1 FROM public.employees e WHERE e.id = p_employee_id AND e.company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Empleado no encontrado en esta empresa.';
  END IF;

  FOR v_block IN
    SELECT (b.value ->> 'weekday')::SMALLINT AS weekday, (b.value ->> 'start')::TIME AS start_time, (b.value ->> 'end')::TIME AS end_time
    FROM pg_catalog.jsonb_array_elements(p_blocks) AS b(value)
  LOOP
    IF v_block.weekday IS NULL OR v_block.weekday NOT BETWEEN 1 AND 7 THEN
      RAISE EXCEPTION 'Día de la semana inválido en el horario.';
    END IF;
    IF v_block.start_time IS NULL OR v_block.end_time IS NULL OR v_block.end_time <= v_block.start_time THEN
      RAISE EXCEPTION 'Cada bloque horario debe terminar después de empezar (dentro del mismo día).';
    END IF;
    v_count := v_count + 1;
  END LOOP;

  -- Los bloques de un mismo día no pueden superponerse ni repetirse
  IF EXISTS (
    WITH blocks AS (
      SELECT (x.value ->> 'weekday')::SMALLINT AS weekday, (x.value ->> 'start')::TIME AS start_time, (x.value ->> 'end')::TIME AS end_time
      FROM pg_catalog.jsonb_array_elements(p_blocks) AS x(value)
    )
    SELECT 1 FROM blocks a JOIN blocks b
      ON a.weekday = b.weekday AND a.start_time <> b.start_time
     AND a.start_time < b.end_time AND b.start_time < a.end_time
    UNION ALL
    SELECT 1 FROM blocks GROUP BY weekday, start_time, end_time HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Hay bloques horarios que se superponen en un mismo día.';
  END IF;

  DELETE FROM public.employee_schedules WHERE company_id = p_company_id AND employee_id = p_employee_id;
  INSERT INTO public.employee_schedules (company_id, employee_id, weekday, start_time, end_time)
  SELECT p_company_id, p_employee_id, (x.value ->> 'weekday')::SMALLINT, (x.value ->> 'start')::TIME, (x.value ->> 'end')::TIME
  FROM pg_catalog.jsonb_array_elements(p_blocks) AS x(value);

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.set_employee_schedule(UUID, UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_employee_schedule(UUID, UUID, JSONB) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. MARCAR ENTRADA Y SALIDA (hora del servidor)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.lock_active_employee(p_company_id UUID, p_employee_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT e.status INTO v_status
  FROM public.employees e
  WHERE e.id = p_employee_id AND e.company_id = p_company_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Empleado no encontrado en esta empresa.';
  END IF;
  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'El empleado está inactivo.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.lock_active_employee(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- No puede haber dos períodos de trabajo del mismo empleado que se pisen
CREATE OR REPLACE FUNCTION private.assert_no_attendance_overlap(
  p_company_id UUID, p_employee_id UUID, p_record_id UUID, p_in TIMESTAMPTZ, p_out TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.attendance_records r
    WHERE r.company_id = p_company_id AND r.employee_id = p_employee_id AND r.status = 'active'
      AND r.id IS DISTINCT FROM p_record_id
      AND r.check_in < COALESCE(p_out, 'infinity'::TIMESTAMPTZ)
      AND COALESCE(r.check_out, 'infinity'::TIMESTAMPTZ) > p_in
  ) THEN
    RAISE EXCEPTION 'Ese horario se superpone con otro registro del mismo empleado.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.assert_no_attendance_overlap(UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.clock_in(p_company_id UUID, p_employee_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_open TIMESTAMPTZ;
  v_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  PERFORM private.assert_company_role(p_company_id, 'master_admin');
  PERFORM private.lock_active_employee(p_company_id, p_employee_id);

  SELECT r.check_in INTO v_open
  FROM public.attendance_records r
  WHERE r.company_id = p_company_id AND r.employee_id = p_employee_id AND r.status = 'active' AND r.check_out IS NULL;
  IF FOUND THEN
    RAISE EXCEPTION 'El empleado ya tiene una entrada abierta: primero marcá su salida.';
  END IF;

  INSERT INTO public.attendance_records (company_id, employee_id, check_in, source, created_by)
  VALUES (p_company_id, p_employee_id, clock_timestamp(), 'clock', auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.clock_in(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clock_in(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.clock_out(p_company_id UUID, p_employee_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id UUID;
  v_in TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  PERFORM private.assert_company_role(p_company_id, 'master_admin');
  PERFORM private.lock_active_employee(p_company_id, p_employee_id);

  SELECT r.id, r.check_in INTO v_id, v_in
  FROM public.attendance_records r
  WHERE r.company_id = p_company_id AND r.employee_id = p_employee_id AND r.status = 'active' AND r.check_out IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El empleado no tiene una entrada abierta: primero marcá su entrada.';
  END IF;
  IF clock_timestamp() <= v_in THEN
    RAISE EXCEPTION 'La salida tiene que ser posterior a la entrada.';
  END IF;

  UPDATE public.attendance_records SET check_out = clock_timestamp(), updated_at = now() WHERE id = v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.clock_out(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clock_out(UUID, UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 6. CARGA MANUAL / CORRECCIÓN (con motivo) Y ANULACIÓN
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_attendance(
  p_company_id UUID,
  p_employee_id UUID,
  p_record_id UUID,
  p_check_in TIMESTAMPTZ,
  p_check_out TIMESTAMPTZ,
  p_reason TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reason TEXT := pg_catalog.btrim(COALESCE(p_reason, ''));
  v_id UUID;
  v_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  PERFORM private.assert_company_role(p_company_id, 'master_admin');
  PERFORM private.lock_active_employee(p_company_id, p_employee_id);

  IF v_reason = '' THEN
    RAISE EXCEPTION 'Indicá el motivo de la carga o corrección.';
  END IF;
  IF pg_catalog.length(v_reason) > 500 THEN
    RAISE EXCEPTION 'El motivo no puede superar los 500 caracteres.';
  END IF;
  IF p_check_in IS NULL THEN
    RAISE EXCEPTION 'Indicá la hora de entrada.';
  END IF;
  IF p_check_in > now() OR (p_check_out IS NOT NULL AND p_check_out > now()) THEN
    RAISE EXCEPTION 'Las horas no pueden ser futuras.';
  END IF;
  IF p_check_out IS NOT NULL AND p_check_out <= p_check_in THEN
    RAISE EXCEPTION 'La salida tiene que ser posterior a la entrada.';
  END IF;
  IF p_check_out IS NOT NULL AND p_check_out - p_check_in > interval '24 hours' THEN
    RAISE EXCEPTION 'Un registro no puede durar más de 24 horas.';
  END IF;

  PERFORM private.assert_no_attendance_overlap(p_company_id, p_employee_id, p_record_id, p_check_in, p_check_out);

  IF p_record_id IS NULL THEN
    INSERT INTO public.attendance_records (company_id, employee_id, check_in, check_out, source, reason, created_by)
    VALUES (p_company_id, p_employee_id, p_check_in, p_check_out, 'manual', v_reason, auth.uid())
    RETURNING id INTO v_id;
  ELSE
    SELECT r.status INTO v_status FROM public.attendance_records r
    WHERE r.id = p_record_id AND r.company_id = p_company_id AND r.employee_id = p_employee_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Registro no encontrado.';
    END IF;
    IF v_status = 'voided' THEN
      RAISE EXCEPTION 'Un registro anulado no se puede corregir.';
    END IF;
    UPDATE public.attendance_records
    SET check_in = p_check_in, check_out = p_check_out, source = 'manual', reason = v_reason, updated_at = now()
    WHERE id = p_record_id
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_attendance(UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_attendance(UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.void_attendance(p_company_id UUID, p_record_id UUID, p_reason TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reason TEXT := pg_catalog.btrim(COALESCE(p_reason, ''));
  v_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  PERFORM private.assert_company_role(p_company_id, 'master_admin');
  IF v_reason = '' THEN
    RAISE EXCEPTION 'Indicá el motivo de la anulación.';
  END IF;
  IF pg_catalog.length(v_reason) > 500 THEN
    RAISE EXCEPTION 'El motivo no puede superar los 500 caracteres.';
  END IF;

  SELECT r.status INTO v_status FROM public.attendance_records r
  WHERE r.id = p_record_id AND r.company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro no encontrado.';
  END IF;
  IF v_status = 'voided' THEN
    RAISE EXCEPTION 'Este registro ya está anulado.';
  END IF;

  UPDATE public.attendance_records
  SET status = 'voided', voided_at = now(), voided_by = auth.uid(), void_reason = v_reason, updated_at = now()
  WHERE id = p_record_id;
  RETURN p_record_id;
END;
$$;

REVOKE ALL ON FUNCTION public.void_attendance(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_attendance(UUID, UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. INFORME DE ASISTENCIA DEL PERÍODO
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.attendance_report(p_company_id UUID, p_from DATE, p_to DATE)
RETURNS TABLE (
  employee_id UUID,
  employee_name TEXT,
  days_worked BIGINT,
  worked_minutes BIGINT,
  scheduled_minutes BIGINT,
  late_count BIGINT,
  open_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tz TEXT;
  v_today DATE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  PERFORM private.assert_company_role(p_company_id, 'master_admin');
  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
    RAISE EXCEPTION 'El período indicado no es válido.';
  END IF;
  IF p_to - p_from > 366 THEN
    RAISE EXCEPTION 'El período no puede superar 1 año.';
  END IF;

  SELECT c.timezone INTO v_tz FROM public.companies c WHERE c.id = p_company_id;
  v_today := (now() AT TIME ZONE v_tz)::DATE;

  RETURN QUERY
    WITH recs AS (
      SELECT r.employee_id, (r.check_in AT TIME ZONE v_tz) AS local_in, r.check_in, r.check_out
      FROM public.attendance_records r
      WHERE r.company_id = p_company_id AND r.status = 'active'
        AND (r.check_in AT TIME ZONE v_tz)::DATE BETWEEN p_from AND p_to
    ),
    first_in AS (
      SELECT x.employee_id, x.local_in::DATE AS d, MIN(x.local_in)::TIME AS first_time
      FROM recs x GROUP BY x.employee_id, x.local_in::DATE
    ),
    late AS (
      SELECT f.employee_id, COUNT(*) AS n
      FROM first_in f
      JOIN LATERAL (
        SELECT MIN(s.start_time) AS start_time FROM public.employee_schedules s
        WHERE s.company_id = p_company_id AND s.employee_id = f.employee_id AND s.weekday = EXTRACT(ISODOW FROM f.d)::INT
      ) sch ON sch.start_time IS NOT NULL
      WHERE f.first_time > sch.start_time + interval '10 minutes'
      GROUP BY f.employee_id
    ),
    planned AS (
      SELECT s.employee_id, SUM(EXTRACT(EPOCH FROM (s.end_time - s.start_time)) / 60)::BIGINT AS minutes
      FROM public.employee_schedules s
      JOIN generate_series(p_from, LEAST(p_to, v_today), interval '1 day') AS g(d)
        ON EXTRACT(ISODOW FROM g.d)::INT = s.weekday
      WHERE s.company_id = p_company_id
      GROUP BY s.employee_id
    ),
    worked AS (
      SELECT x.employee_id,
             COUNT(DISTINCT x.local_in::DATE) AS days,
             COALESCE(SUM(EXTRACT(EPOCH FROM (x.check_out - x.check_in)) / 60) FILTER (WHERE x.check_out IS NOT NULL), 0)::BIGINT AS minutes,
             COUNT(*) FILTER (WHERE x.check_out IS NULL) AS open_n
      FROM recs x GROUP BY x.employee_id
    )
    SELECT e.id, e.full_name,
           COALESCE(w.days, 0)::BIGINT, COALESCE(w.minutes, 0)::BIGINT, COALESCE(p.minutes, 0)::BIGINT,
           COALESCE(l.n, 0)::BIGINT, COALESCE(w.open_n, 0)::BIGINT
    FROM public.employees e
    LEFT JOIN worked w ON w.employee_id = e.id
    LEFT JOIN planned p ON p.employee_id = e.id
    LEFT JOIN late l ON l.employee_id = e.id
    WHERE e.company_id = p_company_id AND (e.status = 'active' OR w.days IS NOT NULL)
    ORDER BY e.full_name;
END;
$$;

REVOKE ALL ON FUNCTION public.attendance_report(UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attendance_report(UUID, DATE, DATE) TO authenticated;
