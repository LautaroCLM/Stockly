-- ============================================================================
-- MIGRACIÓN: FICHAJE DESDE UNA CUENTA DE EMPLEADO
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
--
-- Un empleado de la empresa (rol 'employee') puede marcar la entrada y la salida de sus
-- compañeros, sin ver datos personales ni poder corregir nada.
--   * clock_in / clock_out: ahora los puede usar cualquier miembro activo de la empresa.
--     La hora la sigue poniendo el servidor y cada entrada guarda quién la marcó (created_by).
--   * clock_roster: lista mínima para fichar (nombre, puesto, horario de HOY y los registros
--     de hoy). No devuelve documento, teléfono, notas ni los horarios de otros días.
--   * Cargar a mano, corregir y anular registros siguen siendo solo del Master Admin.
--   * Las tablas siguen sin ser legibles por el rol empleado (RLS sin cambios).
-- ============================================================================

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
  -- Cualquier miembro activo de la empresa (administrador o empleado)
  PERFORM private.assert_company_role(p_company_id, NULL);
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
  -- Cualquier miembro activo de la empresa (administrador o empleado)
  PERFORM private.assert_company_role(p_company_id, NULL);
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
-- Lista mínima para fichar
--   p_weekday: día de la semana de hoy (1 = lunes ... 7 = domingo), según el dispositivo.
--   p_since: inicio del día de hoy. Se limita a las últimas 36 horas para que esta consulta
--   no sirva para recorrer el historial de asistencia.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clock_roster(p_company_id UUID, p_weekday INTEGER, p_since TIMESTAMPTZ)
RETURNS TABLE (employee_id UUID, full_name TEXT, job_title TEXT, schedule JSONB, records JSONB)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_since TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  PERFORM private.assert_company_role(p_company_id, NULL);
  IF p_weekday IS NULL OR p_weekday NOT BETWEEN 1 AND 7 THEN
    RAISE EXCEPTION 'Día de la semana inválido.';
  END IF;
  v_since := GREATEST(COALESCE(p_since, now() - interval '36 hours'), now() - interval '36 hours');

  RETURN QUERY
  SELECT
    e.id,
    e.full_name,
    e.job_title,
    COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'start', pg_catalog.to_char(s.start_time, 'HH24:MI'),
          'end', pg_catalog.to_char(s.end_time, 'HH24:MI')
        ) ORDER BY s.start_time)
      FROM public.employee_schedules s
      WHERE s.company_id = e.company_id AND s.employee_id = e.id AND s.weekday = p_weekday
    ), '[]'::JSONB),
    COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('id', r.id, 'checkIn', r.check_in, 'checkOut', r.check_out)
        ORDER BY r.check_in)
      FROM public.attendance_records r
      WHERE r.company_id = e.company_id AND r.employee_id = e.id AND r.status = 'active'
        AND (r.check_in >= v_since OR r.check_out IS NULL)
    ), '[]'::JSONB)
  FROM public.employees e
  WHERE e.company_id = p_company_id AND e.status = 'active'
  ORDER BY e.full_name;
END;
$$;

REVOKE ALL ON FUNCTION public.clock_roster(UUID, INTEGER, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clock_roster(UUID, INTEGER, TIMESTAMPTZ) TO authenticated;
