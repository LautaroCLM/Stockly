-- ============================================================================
-- MIGRACIÓN: GASTOS
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
--
-- Alcance: registrar lo que la empresa paga y no es mercadería (combustible,
-- mantenimiento, alquiler, servicios, impuestos, etc.).
--   * Solo el Master Admin registra, anula y consulta gastos.
--   * Un gasto no se edita ni se borra: si hay un error se anula con motivo y se
--     carga de nuevo. Así el historial siempre cuadra.
--   * Si se paga en efectivo desde la caja, se crea el retiro en la caja abierta en la
--     misma operación (o falla todo). Al anular, el efectivo vuelve como ingreso en la
--     caja que esté abierta en ese momento.
--   * Las compras de mercadería NO son gastos: viven en el módulo Compras.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TABLA
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  expense_date DATE NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'combustible', 'mantenimiento', 'repuestos', 'alquiler', 'servicios',
    'impuestos', 'sueldos', 'viaticos', 'seguros', 'otros'
  )),
  description TEXT NOT NULL CHECK (pg_catalog.btrim(description) <> '' AND pg_catalog.length(description) <= 300),
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('efectivo', 'transferencia', 'tarjeta', 'cheque', 'otro')),
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  cash_movement_id UUID REFERENCES public.cash_movements(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'voided')),
  voided_at TIMESTAMPTZ,
  voided_by UUID REFERENCES auth.users(id),
  void_reason TEXT CHECK (void_reason IS NULL OR pg_catalog.length(void_reason) <= 500),
  void_cash_movement_id UUID REFERENCES public.cash_movements(id) ON DELETE RESTRICT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_expenses_void_state CHECK (
    (status = 'active' AND voided_at IS NULL AND voided_by IS NULL AND void_reason IS NULL AND void_cash_movement_id IS NULL)
    OR (status = 'voided' AND voided_at IS NOT NULL AND voided_by IS NOT NULL AND void_reason IS NOT NULL)
  ),
  CONSTRAINT chk_expenses_cash_link CHECK (cash_movement_id IS NULL OR payment_method = 'efectivo')
);

CREATE INDEX IF NOT EXISTS expenses_company_date_idx ON public.expenses (company_id, expense_date DESC, created_at DESC);

-- ----------------------------------------------------------------------------
-- 2. INMUTABILIDAD: solo se permite pasar de activo a anulado
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
     OR NEW.created_by <> OLD.created_by OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Los datos de un gasto no se pueden editar: anulalo y cargalo de nuevo.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_expense_mutation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tr_expenses_guard ON public.expenses;
CREATE TRIGGER tr_expenses_guard
  BEFORE UPDATE OR DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.guard_expense_mutation();

DROP TRIGGER IF EXISTS tr_audit_expenses ON public.expenses;
CREATE TRIGGER tr_audit_expenses
  AFTER INSERT OR UPDATE OR DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger('id');

-- ----------------------------------------------------------------------------
-- 3. RLS: solo lectura directa para el Master Admin; escribir solo por funciones
-- ----------------------------------------------------------------------------
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "expenses_select_admin" ON public.expenses;
CREATE POLICY "expenses_select_admin"
  ON public.expenses FOR SELECT TO authenticated
  USING (
    company_id IN (SELECT private.my_active_company_ids())
    AND private.has_company_role(company_id, 'master_admin')
  );

REVOKE ALL ON public.expenses FROM PUBLIC, anon;
GRANT SELECT ON public.expenses TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.expenses FROM authenticated;

-- ----------------------------------------------------------------------------
-- 4. REGISTRAR GASTO
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_expense(
  p_company_id UUID,
  p_expense_date DATE,
  p_category TEXT,
  p_description TEXT,
  p_amount NUMERIC,
  p_payment_method TEXT,
  p_supplier_id UUID,
  p_pay_from_cash BOOLEAN
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
    supplier_id, cash_movement_id, created_by
  ) VALUES (
    p_company_id, p_expense_date, p_category, v_description, p_amount, p_payment_method,
    p_supplier_id, v_movement_id, auth.uid()
  ) RETURNING id INTO v_expense_id;

  RETURN pg_catalog.jsonb_build_object('expense_id', v_expense_id);
END;
$$;

REVOKE ALL ON FUNCTION public.create_expense(UUID, DATE, TEXT, TEXT, NUMERIC, TEXT, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_expense(UUID, DATE, TEXT, TEXT, NUMERIC, TEXT, UUID, BOOLEAN) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. ANULAR GASTO
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.void_expense(
  p_company_id UUID,
  p_expense_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reason TEXT := pg_catalog.btrim(p_reason);
  v_expense public.expenses%ROWTYPE;
  v_session_id UUID;
  v_refund_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  PERFORM private.assert_company_role(p_company_id, 'master_admin');

  IF v_reason IS NULL OR v_reason = '' THEN
    RAISE EXCEPTION 'Indicá el motivo de la anulación.';
  END IF;
  IF pg_catalog.length(v_reason) > 500 THEN
    RAISE EXCEPTION 'El motivo no puede superar los 500 caracteres.';
  END IF;

  SELECT * INTO v_expense
  FROM public.expenses e
  WHERE e.id = p_expense_id AND e.company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Gasto no encontrado en esta empresa.';
  END IF;
  IF v_expense.status = 'voided' THEN
    RAISE EXCEPTION 'Este gasto ya está anulado.';
  END IF;

  IF v_expense.cash_movement_id IS NOT NULL THEN
    SELECT cs.id INTO v_session_id
    FROM public.cash_sessions cs
    WHERE cs.company_id = p_company_id AND cs.status = 'open';
    IF v_session_id IS NULL THEN
      RAISE EXCEPTION 'Este gasto se pagó con efectivo de la caja: abrí la caja para anularlo y que el dinero vuelva.';
    END IF;
    v_refund_id := (public.register_cash_movement(
      p_company_id, v_session_id, 'in', v_expense.amount,
      pg_catalog.left('Anulación de gasto: ' || v_expense.description, 500)
    ) ->> 'movement_id')::UUID;
  END IF;

  UPDATE public.expenses
  SET status = 'voided', voided_at = now(), voided_by = auth.uid(), void_reason = v_reason,
      void_cash_movement_id = v_refund_id
  WHERE id = p_expense_id;

  RETURN pg_catalog.jsonb_build_object('expense_id', p_expense_id);
END;
$$;

REVOKE ALL ON FUNCTION public.void_expense(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_expense(UUID, UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 6. REALTIME
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'expenses'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.expenses;
  END IF;
END
$$;
