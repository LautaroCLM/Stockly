-- ============================================================================
-- MIGRACIÓN: MÁQUINAS
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
--
-- Registro de las máquinas y vehículos de la empresa (retroexcavadora, camión,
-- atmosférico, etc.) para saber cuánto cuesta mantenerlas.
--   * Solo el Master Admin las ve y las gestiona.
--   * Una máquina no se borra: se marca como inactiva (queda su historial de gastos).
--   * Un gasto puede asociarse a una máquina (combustible, repuestos, mantenimiento).
--     No se pueden cargar gastos nuevos a una máquina inactiva.
--   * machine_costs resume lo gastado por máquina en un período.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TABLA
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.machines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (pg_catalog.btrim(name) <> '' AND pg_catalog.length(name) <= 100),
  machine_type TEXT NOT NULL CHECK (machine_type IN (
    'retroexcavadora', 'excavadora', 'pala_cargadora', 'camion', 'atmosferico',
    'motoniveladora', 'topadora', 'compactadora', 'grua', 'vehiculo', 'herramienta', 'otro'
  )),
  identifier TEXT CHECK (identifier IS NULL OR pg_catalog.length(identifier) <= 50),
  brand TEXT CHECK (brand IS NULL OR pg_catalog.length(brand) <= 60),
  model TEXT CHECK (model IS NULL OR pg_catalog.length(model) <= 60),
  model_year INTEGER CHECK (model_year IS NULL OR model_year BETWEEN 1950 AND 2100),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'in_repair', 'inactive')),
  notes TEXT CHECK (notes IS NULL OR pg_catalog.length(notes) <= 500),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_machines_company_id UNIQUE (company_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS machines_company_name_unique
  ON public.machines (company_id, pg_catalog.lower(name));

DROP TRIGGER IF EXISTS tr_audit_machines ON public.machines;
CREATE TRIGGER tr_audit_machines
  AFTER INSERT OR UPDATE OR DELETE ON public.machines
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger('id');

CREATE OR REPLACE FUNCTION public.guard_machine_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Las máquinas no se pueden borrar: marcalas como inactivas.';
END;
$$;

REVOKE ALL ON FUNCTION public.guard_machine_delete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tr_machines_no_delete ON public.machines;
CREATE TRIGGER tr_machines_no_delete
  BEFORE DELETE ON public.machines
  FOR EACH ROW EXECUTE FUNCTION public.guard_machine_delete();

ALTER TABLE public.machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machines FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "machines_select_admin" ON public.machines;
CREATE POLICY "machines_select_admin"
  ON public.machines FOR SELECT TO authenticated
  USING (
    company_id IN (SELECT private.my_active_company_ids())
    AND private.has_company_role(company_id, 'master_admin')
  );

REVOKE ALL ON public.machines FROM PUBLIC, anon;
GRANT SELECT ON public.machines TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.machines FROM authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'machines'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.machines;
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- 2. ALTA Y EDICIÓN
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_machine(
  p_company_id UUID,
  p_machine_id UUID,
  p_name TEXT,
  p_machine_type TEXT,
  p_identifier TEXT,
  p_brand TEXT,
  p_model TEXT,
  p_model_year INTEGER,
  p_status TEXT,
  p_notes TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_name TEXT := pg_catalog.btrim(COALESCE(p_name, ''));
  v_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  PERFORM private.assert_company_role(p_company_id, 'master_admin');

  IF v_name = '' THEN
    RAISE EXCEPTION 'Indicá el nombre de la máquina.';
  END IF;
  IF pg_catalog.length(v_name) > 100 THEN
    RAISE EXCEPTION 'El nombre no puede superar los 100 caracteres.';
  END IF;
  IF p_status NOT IN ('active', 'in_repair', 'inactive') THEN
    RAISE EXCEPTION 'Estado de máquina inválido.';
  END IF;
  IF p_model_year IS NOT NULL AND p_model_year NOT BETWEEN 1950 AND 2100 THEN
    RAISE EXCEPTION 'El año del modelo no es válido.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.machines m
    WHERE m.company_id = p_company_id AND pg_catalog.lower(m.name) = pg_catalog.lower(v_name)
      AND m.id IS DISTINCT FROM p_machine_id
  ) THEN
    RAISE EXCEPTION 'Ya existe una máquina con ese nombre.';
  END IF;

  IF p_machine_id IS NULL THEN
    INSERT INTO public.machines (
      company_id, name, machine_type, identifier, brand, model, model_year, status, notes, created_by
    ) VALUES (
      p_company_id, v_name, p_machine_type, NULLIF(pg_catalog.btrim(COALESCE(p_identifier, '')), ''),
      NULLIF(pg_catalog.btrim(COALESCE(p_brand, '')), ''), NULLIF(pg_catalog.btrim(COALESCE(p_model, '')), ''),
      p_model_year, p_status, NULLIF(pg_catalog.btrim(COALESCE(p_notes, '')), ''), auth.uid()
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE public.machines SET
      name = v_name, machine_type = p_machine_type,
      identifier = NULLIF(pg_catalog.btrim(COALESCE(p_identifier, '')), ''),
      brand = NULLIF(pg_catalog.btrim(COALESCE(p_brand, '')), ''),
      model = NULLIF(pg_catalog.btrim(COALESCE(p_model, '')), ''),
      model_year = p_model_year, status = p_status,
      notes = NULLIF(pg_catalog.btrim(COALESCE(p_notes, '')), ''), updated_at = now()
    WHERE id = p_machine_id AND company_id = p_company_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Máquina no encontrada en esta empresa.';
    END IF;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_machine(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_machine(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. GASTOS ASOCIADOS A UNA MÁQUINA
-- ----------------------------------------------------------------------------
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS machine_id UUID;
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS fk_expenses_machine;
ALTER TABLE public.expenses ADD CONSTRAINT fk_expenses_machine
  FOREIGN KEY (company_id, machine_id) REFERENCES public.machines(company_id, id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS expenses_machine_idx ON public.expenses (company_id, machine_id, expense_date DESC)
  WHERE machine_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 4. create_expense ahora acepta la máquina (opcional) y se protege el vínculo
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_expense_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Los gastos no se pueden borrar: anulalos con un motivo.';
  END IF;
  IF OLD.status = 'voided' THEN
    RAISE EXCEPTION 'Un gasto anulado no se puede modificar.';
  END IF;
  IF NEW.company_id <> OLD.company_id OR NEW.expense_date <> OLD.expense_date OR NEW.category <> OLD.category
     OR NEW.description <> OLD.description OR NEW.amount <> OLD.amount OR NEW.payment_method <> OLD.payment_method
     OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id OR NEW.cash_movement_id IS DISTINCT FROM OLD.cash_movement_id
     OR NEW.machine_id IS DISTINCT FROM OLD.machine_id
     OR NEW.created_by <> OLD.created_by OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Los datos de un gasto no se pueden editar: anulalo y cargalo de nuevo.';
  END IF;
  RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS public.create_expense(UUID, DATE, TEXT, TEXT, NUMERIC, TEXT, UUID, BOOLEAN);

CREATE OR REPLACE FUNCTION public.create_expense(
  p_company_id UUID,
  p_expense_date DATE,
  p_category TEXT,
  p_description TEXT,
  p_amount NUMERIC,
  p_payment_method TEXT,
  p_supplier_id UUID,
  p_pay_from_cash BOOLEAN,
  p_machine_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_description TEXT := pg_catalog.btrim(p_description);
  v_session_id UUID;
  v_movement_id UUID;
  v_expense_id UUID;
  v_machine_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  PERFORM private.assert_company_role(p_company_id, 'master_admin');
  PERFORM private.assert_money(p_amount, 'el importe', false);

  IF p_expense_date IS NULL THEN
    RAISE EXCEPTION 'Indicá la fecha del gasto.';
  END IF;
  IF p_expense_date > (pg_catalog.timezone((SELECT c.timezone FROM public.companies c WHERE c.id = p_company_id), now()))::DATE THEN
    RAISE EXCEPTION 'La fecha del gasto no puede ser futura.';
  END IF;
  IF v_description IS NULL OR v_description = '' THEN
    RAISE EXCEPTION 'Describí el gasto.';
  END IF;
  IF p_supplier_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.suppliers s WHERE s.id = p_supplier_id AND s.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'El proveedor no pertenece a esta empresa.';
  END IF;

  IF p_machine_id IS NOT NULL THEN
    SELECT m.status INTO v_machine_status
    FROM public.machines m
    WHERE m.id = p_machine_id AND m.company_id = p_company_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La máquina no pertenece a esta empresa.';
    END IF;
    IF v_machine_status = 'inactive' THEN
      RAISE EXCEPTION 'La máquina está inactiva: reactivala para cargarle gastos.';
    END IF;
  END IF;

  IF COALESCE(p_pay_from_cash, false) THEN
    IF p_payment_method <> 'efectivo' THEN
      RAISE EXCEPTION 'Solo un gasto en efectivo puede salir de la caja.';
    END IF;
    SELECT cs.id INTO v_session_id
    FROM public.cash_sessions cs
    WHERE cs.company_id = p_company_id AND cs.status = 'open';
    IF v_session_id IS NULL THEN
      RAISE EXCEPTION 'No hay una caja abierta: abrila para pagar este gasto desde la caja.';
    END IF;
    v_movement_id := (public.register_cash_movement(
      p_company_id, v_session_id, 'out', p_amount, pg_catalog.left('Gasto: ' || v_description, 500)
    ) ->> 'movement_id')::UUID;
  END IF;

  INSERT INTO public.expenses (
    company_id, expense_date, category, description, amount, payment_method,
    supplier_id, cash_movement_id, machine_id, created_by
  ) VALUES (
    p_company_id, p_expense_date, p_category, v_description, p_amount, p_payment_method,
    p_supplier_id, v_movement_id, p_machine_id, auth.uid()
  ) RETURNING id INTO v_expense_id;

  RETURN pg_catalog.jsonb_build_object('expense_id', v_expense_id);
END;
$$;

REVOKE ALL ON FUNCTION public.create_expense(UUID, DATE, TEXT, TEXT, NUMERIC, TEXT, UUID, BOOLEAN, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_expense(UUID, DATE, TEXT, TEXT, NUMERIC, TEXT, UUID, BOOLEAN, UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. COSTOS POR MÁQUINA EN UN PERÍODO
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.machine_costs(p_company_id UUID, p_from DATE, p_to DATE)
RETURNS TABLE (
  machine_id UUID,
  machine_name TEXT,
  machine_type TEXT,
  status TEXT,
  expenses_count BIGINT,
  fuel_total NUMERIC,
  maintenance_total NUMERIC,
  other_total NUMERIC,
  total NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  PERFORM private.assert_company_role(p_company_id, 'master_admin');
  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
    RAISE EXCEPTION 'El período indicado no es válido.';
  END IF;
  IF p_to - p_from > 731 THEN
    RAISE EXCEPTION 'El período no puede superar los 2 años.';
  END IF;

  RETURN QUERY
    SELECT m.id, m.name, m.machine_type, m.status,
           COUNT(e.id)::BIGINT,
           COALESCE(SUM(e.amount) FILTER (WHERE e.category = 'combustible'), 0)::NUMERIC(14, 2),
           COALESCE(SUM(e.amount) FILTER (WHERE e.category IN ('mantenimiento', 'repuestos')), 0)::NUMERIC(14, 2),
           COALESCE(SUM(e.amount) FILTER (WHERE e.category NOT IN ('combustible', 'mantenimiento', 'repuestos')), 0)::NUMERIC(14, 2),
           COALESCE(SUM(e.amount), 0)::NUMERIC(14, 2)
    FROM public.machines m
    LEFT JOIN public.expenses e
      ON e.company_id = m.company_id AND e.machine_id = m.id AND e.status = 'active'
     AND e.expense_date BETWEEN p_from AND p_to
    WHERE m.company_id = p_company_id
    GROUP BY m.id, m.name, m.machine_type, m.status
    ORDER BY COALESCE(SUM(e.amount), 0) DESC, m.name;
END;
$$;

REVOKE ALL ON FUNCTION public.machine_costs(UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.machine_costs(UUID, DATE, DATE) TO authenticated;
