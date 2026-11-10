-- ============================================================================
-- MIGRACIÓN: DEUDAS A PROVEEDORES (CUENTA CORRIENTE DE PROVEEDORES)
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
--
-- Es el espejo de la cuenta corriente de clientes, del lado de lo que la empresa debe.
--   * Una compra puede quedar "a pagar" (cuenta corriente con el proveedor). Si no, se
--     considera pagada, como hasta ahora: las compras ya cargadas no generan deuda.
--     La condición se guarda en credit_purchases, aparte de la compra, que sigue inmutable.
--   * La deuda con un proveedor = compras a crédito (sin las anuladas) - pagos activos.
--   * supplier_payments: pagos al proveedor con uno o varios medios (efectivo,
--     transferencia, débito, crédito o cheque). No se puede pagar más de lo que se debe.
--   * Si el pago incluye efectivo, puede salir de la caja abierta en la misma operación.
--   * Los pagos no se editan ni se borran: se anulan con motivo (y el efectivo vuelve a
--     la caja). Son idempotentes: reenviar el mismo pago (misma clave) no lo duplica.
--   * Todo es solo del Master Admin, igual que las compras.
--   * financial_summary suma: compras a crédito del período, pagos a proveedores del
--     período y deuda total con proveedores.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TABLAS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.credit_purchases (
  purchase_id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_credit_purchases_purchase FOREIGN KEY (company_id, purchase_id)
    REFERENCES public.purchases(company_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.supplier_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  supplier_id UUID NOT NULL,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  payments JSONB NOT NULL CHECK (pg_catalog.jsonb_typeof(payments) = 'array'),
  notes TEXT CHECK (notes IS NULL OR pg_catalog.length(notes) <= 500),
  cash_movement_id UUID REFERENCES public.cash_movements(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'voided')),
  voided_at TIMESTAMPTZ,
  voided_by UUID REFERENCES auth.users(id),
  void_reason TEXT CHECK (void_reason IS NULL OR pg_catalog.length(void_reason) <= 500),
  void_cash_movement_id UUID REFERENCES public.cash_movements(id) ON DELETE RESTRICT,
  idempotency_key UUID NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_supplier_payments_supplier FOREIGN KEY (company_id, supplier_id)
    REFERENCES public.suppliers(company_id, id) ON DELETE RESTRICT,
  CONSTRAINT uq_supplier_payments_idempotency UNIQUE (company_id, created_by, idempotency_key),
  CONSTRAINT chk_supplier_payments_void_state CHECK (
    (status = 'active' AND voided_at IS NULL AND voided_by IS NULL AND void_reason IS NULL AND void_cash_movement_id IS NULL)
    OR (status = 'voided' AND voided_at IS NOT NULL AND voided_by IS NOT NULL AND void_reason IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS supplier_payments_supplier_idx
  ON public.supplier_payments (company_id, supplier_id, created_at DESC);
CREATE INDEX IF NOT EXISTS purchases_company_supplier_idx
  ON public.purchases (company_id, supplier_id, created_at);

-- ----------------------------------------------------------------------------
-- 2. INMUTABILIDAD, AUDITORÍA, RLS Y REALTIME
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_credit_purchase_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'La condición de pago de una compra no se puede cambiar.';
END;
$$;

REVOKE ALL ON FUNCTION public.guard_credit_purchase_mutation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tr_credit_purchases_guard ON public.credit_purchases;
CREATE TRIGGER tr_credit_purchases_guard
  BEFORE UPDATE OR DELETE ON public.credit_purchases
  FOR EACH ROW EXECUTE FUNCTION public.guard_credit_purchase_mutation();

CREATE OR REPLACE FUNCTION public.guard_supplier_payment_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Los pagos no se pueden borrar: anulalos con un motivo.';
  END IF;
  IF OLD.status = 'voided' THEN
    RAISE EXCEPTION 'Un pago anulado no se puede modificar.';
  END IF;
  IF NEW.company_id <> OLD.company_id OR NEW.supplier_id <> OLD.supplier_id OR NEW.amount <> OLD.amount
     OR NEW.payments <> OLD.payments OR NEW.notes IS DISTINCT FROM OLD.notes
     OR NEW.cash_movement_id IS DISTINCT FROM OLD.cash_movement_id
     OR NEW.idempotency_key <> OLD.idempotency_key OR NEW.created_by <> OLD.created_by
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Los datos de un pago no se pueden editar: anulalo y registralo de nuevo.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_supplier_payment_mutation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tr_supplier_payments_guard ON public.supplier_payments;
CREATE TRIGGER tr_supplier_payments_guard
  BEFORE UPDATE OR DELETE ON public.supplier_payments
  FOR EACH ROW EXECUTE FUNCTION public.guard_supplier_payment_mutation();

DROP TRIGGER IF EXISTS tr_audit_supplier_payments ON public.supplier_payments;
CREATE TRIGGER tr_audit_supplier_payments
  AFTER INSERT OR UPDATE OR DELETE ON public.supplier_payments
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger('id');

DROP TRIGGER IF EXISTS tr_audit_credit_purchases ON public.credit_purchases;
CREATE TRIGGER tr_audit_credit_purchases
  AFTER INSERT OR UPDATE OR DELETE ON public.credit_purchases
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger('purchase_id');

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['credit_purchases', 'supplier_payments'] LOOP
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
-- 3. SALDOS (cálculo central, de uso interno)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.supplier_balance(p_company_id UUID, p_supplier_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT (
    COALESCE((
      SELECT SUM(p.total_amount)
      FROM public.credit_purchases cp
      JOIN public.purchases p ON p.company_id = cp.company_id AND p.id = cp.purchase_id
      WHERE cp.company_id = p_company_id AND p.supplier_id = p_supplier_id AND p.status = 'completed'
    ), 0)
    - COALESCE((
      SELECT SUM(sp.amount)
      FROM public.supplier_payments sp
      WHERE sp.company_id = p_company_id AND sp.supplier_id = p_supplier_id AND sp.status = 'active'
    ), 0)
  )::NUMERIC(14, 2);
$$;

REVOKE ALL ON FUNCTION private.supplier_balance(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- Saldo por proveedor, con la fecha de la deuda abierta más antigua (los pagos
-- cancelan primero las compras más viejas).
CREATE OR REPLACE FUNCTION private.supplier_balance_rows(p_company_id UUID)
RETURNS TABLE (
  supplier_id UUID,
  supplier_name TEXT,
  charged_total NUMERIC,
  paid_total NUMERIC,
  balance NUMERIC,
  last_activity TIMESTAMPTZ,
  oldest_open_since TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH charges AS (
    SELECT p.supplier_id, p.created_at, p.total_amount AS amt,
           SUM(p.total_amount) OVER (PARTITION BY p.supplier_id ORDER BY p.created_at, p.id) AS cum
    FROM public.credit_purchases cp
    JOIN public.purchases p ON p.company_id = cp.company_id AND p.id = cp.purchase_id
    WHERE cp.company_id = p_company_id AND p.status = 'completed'
  ),
  charged AS (
    SELECT c.supplier_id, SUM(c.amt) AS total, MAX(c.created_at) AS last_charge
    FROM charges c WHERE c.amt > 0 GROUP BY c.supplier_id
  ),
  paid AS (
    SELECT sp.supplier_id, SUM(sp.amount) AS total, MAX(sp.created_at) AS last_payment
    FROM public.supplier_payments sp
    WHERE sp.company_id = p_company_id AND sp.status = 'active'
    GROUP BY sp.supplier_id
  )
  SELECT su.id, su.name,
         COALESCE(ch.total, 0)::NUMERIC(14, 2),
         COALESCE(pa.total, 0)::NUMERIC(14, 2),
         (COALESCE(ch.total, 0) - COALESCE(pa.total, 0))::NUMERIC(14, 2),
         GREATEST(ch.last_charge, pa.last_payment),
         (SELECT MIN(c.created_at) FROM charges c
          WHERE c.supplier_id = su.id AND c.amt > 0 AND c.cum > COALESCE(pa.total, 0))
  FROM public.suppliers su
  LEFT JOIN charged ch ON ch.supplier_id = su.id
  LEFT JOIN paid pa ON pa.supplier_id = su.id
  WHERE su.company_id = p_company_id AND (ch.total IS NOT NULL OR pa.total IS NOT NULL);
$$;

REVOKE ALL ON FUNCTION private.supplier_balance_rows(UUID) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. COMPRA A CRÉDITO (misma compra de siempre + marca de "a pagar", en una sola operación)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_credit_purchase(
  p_company_id UUID,
  p_idempotency_key UUID,
  p_supplier_id UUID,
  p_items JSONB,
  p_invoice_number TEXT DEFAULT NULL,
  p_purchase_date DATE DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_replay BOOLEAN;
  v_result JSONB;
  v_purchase_id UUID;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  PERFORM private.assert_company_role(p_company_id, 'master_admin');

  -- Si la clave ya se usó, es un reintento: se devuelve lo guardado sin tocar la condición de pago
  SELECT EXISTS (
    SELECT 1 FROM public.operation_idempotency oi
    WHERE oi.company_id = p_company_id AND oi.created_by = v_user
      AND oi.operation_type = 'purchase' AND oi.idempotency_key = p_idempotency_key
  ) INTO v_replay;

  v_result := public.process_purchase(
    p_company_id, p_idempotency_key, p_supplier_id, p_items, p_invoice_number, p_purchase_date, p_notes
  );
  v_purchase_id := (v_result ->> 'purchase_id')::UUID;

  IF NOT v_replay THEN
    INSERT INTO public.credit_purchases (purchase_id, company_id, created_by)
    VALUES (v_purchase_id, p_company_id, v_user)
    ON CONFLICT (purchase_id) DO NOTHING;
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.process_credit_purchase(UUID, UUID, UUID, JSONB, TEXT, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_credit_purchase(UUID, UUID, UUID, JSONB, TEXT, DATE, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. CONSULTAS: saldos y estado de cuenta (solo Master Admin)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supplier_balances(p_company_id UUID)
RETURNS TABLE (
  supplier_id UUID,
  supplier_name TEXT,
  charged_total NUMERIC,
  paid_total NUMERIC,
  balance NUMERIC,
  last_activity TIMESTAMPTZ,
  oldest_open_since TIMESTAMPTZ
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
  RETURN QUERY
    SELECT b.supplier_id, b.supplier_name, b.charged_total, b.paid_total, b.balance,
           b.last_activity, b.oldest_open_since
    FROM private.supplier_balance_rows(p_company_id) b
    ORDER BY b.balance DESC, b.supplier_name;
END;
$$;

REVOKE ALL ON FUNCTION public.supplier_balances(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supplier_balances(UUID) TO authenticated;

-- Movimientos del proveedor: compras a crédito (+) y pagos activos (-).
CREATE OR REPLACE FUNCTION public.supplier_statement(p_company_id UUID, p_supplier_id UUID)
RETURNS TABLE (
  kind TEXT,
  reference_id UUID,
  document TEXT,
  occurred_at TIMESTAMPTZ,
  amount NUMERIC
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
  IF NOT EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = p_supplier_id AND s.company_id = p_company_id) THEN
    RAISE EXCEPTION 'Proveedor no encontrado en esta empresa.';
  END IF;
  RETURN QUERY
    SELECT m.kind, m.reference_id, m.document, m.occurred_at, m.amount
    FROM (
      SELECT 'purchase'::TEXT AS kind, p.id AS reference_id, p.purchase_number AS document,
             p.created_at AS occurred_at, p.total_amount AS amount
      FROM public.credit_purchases cp
      JOIN public.purchases p ON p.company_id = cp.company_id AND p.id = cp.purchase_id
      WHERE cp.company_id = p_company_id AND p.supplier_id = p_supplier_id AND p.status = 'completed'
      UNION ALL
      SELECT 'payment'::TEXT, sp.id, 'Pago', sp.created_at, -sp.amount
      FROM public.supplier_payments sp
      WHERE sp.company_id = p_company_id AND sp.supplier_id = p_supplier_id AND sp.status = 'active'
    ) m
    ORDER BY m.occurred_at, m.reference_id;
END;
$$;

REVOKE ALL ON FUNCTION public.supplier_statement(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supplier_statement(UUID, UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 6. REGISTRAR Y ANULAR PAGOS A PROVEEDORES
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_supplier_payment(
  p_company_id UUID,
  p_supplier_id UUID,
  p_payments JSONB,
  p_notes TEXT,
  p_from_cash BOOLEAN,
  p_idempotency_key UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_notes TEXT := NULLIF(pg_catalog.btrim(COALESCE(p_notes, '')), '');
  v_supplier_name TEXT;
  v_existing public.supplier_payments%ROWTYPE;
  v_pay RECORD;
  v_total NUMERIC(14, 2) := 0;
  v_cash NUMERIC(14, 2) := 0;
  v_balance NUMERIC(14, 2);
  v_session_id UUID;
  v_movement_id UUID;
  v_payment_id UUID;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'La clave de idempotencia es obligatoria.';
  END IF;
  PERFORM private.assert_company_role(p_company_id, 'master_admin');

  IF p_payments IS NULL OR pg_catalog.jsonb_typeof(p_payments) <> 'array' OR pg_catalog.jsonb_array_length(p_payments) = 0 THEN
    RAISE EXCEPTION 'Indicá con qué medio de pago se paga.';
  END IF;
  IF v_notes IS NOT NULL AND pg_catalog.length(v_notes) > 500 THEN
    RAISE EXCEPTION 'La nota no puede superar los 500 caracteres.';
  END IF;

  -- Se bloquea al proveedor: dos pagos simultáneos no pueden pasarse del saldo juntos
  SELECT s.name INTO v_supplier_name
  FROM public.suppliers s
  WHERE s.id = p_supplier_id AND s.company_id = p_company_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El proveedor no existe o no pertenece a esta empresa.';
  END IF;

  SELECT * INTO v_existing
  FROM public.supplier_payments sp
  WHERE sp.company_id = p_company_id AND sp.created_by = v_user AND sp.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.supplier_id <> p_supplier_id THEN
      RAISE EXCEPTION 'Clave de pago reutilizada con otro proveedor.';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'payment_id', v_existing.id, 'balance_after', private.supplier_balance(p_company_id, p_supplier_id)
    );
  END IF;

  FOR v_pay IN
    SELECT (y.value ->> 'method')::TEXT AS method, (y.value ->> 'amount')::NUMERIC AS amount
    FROM pg_catalog.jsonb_array_elements(p_payments) AS y
  LOOP
    IF v_pay.method IS NULL OR v_pay.method NOT IN ('efectivo', 'transferencia', 'debito', 'credito', 'cheque') THEN
      RAISE EXCEPTION 'Medio de pago inválido para un pago: %.', COALESCE(v_pay.method, '(vacío)');
    END IF;
    PERFORM private.assert_money(v_pay.amount, 'el importe de cada medio de pago', false);
    v_total := v_total + v_pay.amount;
    IF v_pay.method = 'efectivo' THEN
      v_cash := v_cash + v_pay.amount;
    END IF;
  END LOOP;

  v_balance := private.supplier_balance(p_company_id, p_supplier_id);
  IF v_total > v_balance THEN
    RAISE EXCEPTION 'El pago ($ %) supera lo que se le debe al proveedor ($ %).', v_total, GREATEST(v_balance, 0);
  END IF;

  IF COALESCE(p_from_cash, false) THEN
    IF v_cash = 0 THEN
      RAISE EXCEPTION 'Solo el efectivo puede salir de la caja: este pago no tiene efectivo.';
    END IF;
    SELECT cs.id INTO v_session_id
    FROM public.cash_sessions cs
    WHERE cs.company_id = p_company_id AND cs.status = 'open';
    IF v_session_id IS NULL THEN
      RAISE EXCEPTION 'No hay una caja abierta: abrila para que el efectivo del pago salga de la caja.';
    END IF;
    v_movement_id := (public.register_cash_movement(
      p_company_id, v_session_id, 'out', v_cash,
      pg_catalog.left('Pago a proveedor: ' || v_supplier_name, 500)
    ) ->> 'movement_id')::UUID;
  END IF;

  INSERT INTO public.supplier_payments (
    company_id, supplier_id, amount, payments, notes, cash_movement_id, idempotency_key, created_by
  ) VALUES (
    p_company_id, p_supplier_id, v_total, p_payments, v_notes, v_movement_id, p_idempotency_key, v_user
  ) RETURNING id INTO v_payment_id;

  RETURN pg_catalog.jsonb_build_object('payment_id', v_payment_id, 'balance_after', v_balance - v_total);
END;
$$;

REVOKE ALL ON FUNCTION public.register_supplier_payment(UUID, UUID, JSONB, TEXT, BOOLEAN, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_supplier_payment(UUID, UUID, JSONB, TEXT, BOOLEAN, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.void_supplier_payment(
  p_company_id UUID,
  p_payment_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reason TEXT := pg_catalog.btrim(p_reason);
  v_payment public.supplier_payments%ROWTYPE;
  v_session_id UUID;
  v_in_id UUID;
  v_cash NUMERIC(14, 2);
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

  SELECT * INTO v_payment
  FROM public.supplier_payments sp
  WHERE sp.id = p_payment_id AND sp.company_id = p_company_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pago no encontrado en esta empresa.';
  END IF;
  IF v_payment.status = 'voided' THEN
    RAISE EXCEPTION 'Este pago ya está anulado.';
  END IF;

  IF v_payment.cash_movement_id IS NOT NULL THEN
    SELECT COALESCE(SUM((pay.value ->> 'amount')::NUMERIC), 0) INTO v_cash
    FROM pg_catalog.jsonb_array_elements(v_payment.payments) AS pay(value)
    WHERE pay.value ->> 'method' = 'efectivo';

    SELECT cs.id INTO v_session_id
    FROM public.cash_sessions cs
    WHERE cs.company_id = p_company_id AND cs.status = 'open';
    IF v_session_id IS NULL THEN
      RAISE EXCEPTION 'El efectivo de este pago salió de la caja: abrí la caja para anularlo y que el dinero vuelva a entrar.';
    END IF;
    v_in_id := (public.register_cash_movement(
      p_company_id, v_session_id, 'in', v_cash,
      pg_catalog.left('Anulación de pago a proveedor: ' || v_reason, 500)
    ) ->> 'movement_id')::UUID;
  END IF;

  UPDATE public.supplier_payments
  SET status = 'voided', voided_at = now(), voided_by = auth.uid(), void_reason = v_reason,
      void_cash_movement_id = v_in_id
  WHERE id = p_payment_id;

  RETURN pg_catalog.jsonb_build_object('payment_id', p_payment_id);
END;
$$;

REVOKE ALL ON FUNCTION public.void_supplier_payment(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_supplier_payment(UUID, UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. RESUMEN FINANCIERO: compras a crédito, pagos a proveedores y deuda total
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.financial_summary(
  p_company_id UUID,
  p_from DATE,
  p_to DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tz TEXT;
  v_start TIMESTAMPTZ;
  v_end TIMESTAMPTZ;
  v_sales_total NUMERIC(14, 2);
  v_sales_count INTEGER;
  v_cancelled_total NUMERIC(14, 2);
  v_cancelled_count INTEGER;
  v_cogs NUMERIC(14, 2);
  v_purchases_total NUMERIC(14, 2);
  v_purchases_count INTEGER;
  v_payments JSONB;
  v_inventory NUMERIC(14, 2);
  v_expenses_total NUMERIC(14, 2);
  v_expenses_count INTEGER;
  v_expenses_by_cat JSONB;
  v_credit_sales NUMERIC(14, 2);
  v_collections NUMERIC(14, 2);
  v_receivable NUMERIC(14, 2);
  v_credit_purchases NUMERIC(14, 2);
  v_supplier_payments NUMERIC(14, 2);
  v_payables NUMERIC(14, 2);
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

  SELECT c.timezone INTO v_tz FROM public.companies c WHERE c.id = p_company_id;
  v_start := p_from::TIMESTAMP AT TIME ZONE v_tz;
  v_end := (p_to + 1)::TIMESTAMP AT TIME ZONE v_tz;

  SELECT
    COALESCE(SUM(s.total_amount) FILTER (WHERE s.status = 'completed'), 0)::NUMERIC(14, 2),
    (COUNT(*) FILTER (WHERE s.status = 'completed'))::INTEGER,
    COALESCE(SUM(s.total_amount) FILTER (WHERE s.status = 'cancelled'), 0)::NUMERIC(14, 2),
    (COUNT(*) FILTER (WHERE s.status = 'cancelled'))::INTEGER
  INTO v_sales_total, v_sales_count, v_cancelled_total, v_cancelled_count
  FROM public.sales s
  WHERE s.company_id = p_company_id
    AND s.created_at >= v_start AND s.created_at < v_end;

  SELECT COALESCE(SUM(mc.total_cost), 0)::NUMERIC(14, 2)
  INTO v_cogs
  FROM public.sales s
  JOIN public.stock_movements sm
    ON sm.company_id = s.company_id AND sm.reference_sale_id = s.id AND sm.reason = 'sale'
  JOIN public.movement_costs mc
    ON mc.company_id = sm.company_id AND mc.movement_id = sm.id
  WHERE s.company_id = p_company_id
    AND s.status = 'completed'
    AND s.created_at >= v_start AND s.created_at < v_end;

  SELECT COALESCE(SUM(p.total_amount), 0)::NUMERIC(14, 2), COUNT(*)::INTEGER
  INTO v_purchases_total, v_purchases_count
  FROM public.purchases p
  WHERE p.company_id = p_company_id
    AND p.status = 'completed'
    AND p.purchase_date BETWEEN p_from AND p_to;

  -- Cobrado por medio: pagos de ventas (sin cuenta corriente, que todavía no se cobró)
  -- más los cobros de cuenta corriente hechos en el período.
  SELECT COALESCE(pg_catalog.jsonb_object_agg(t.method, t.total), '{}'::JSONB)
  INTO v_payments
  FROM (
    SELECT u.method, SUM(u.amount)::NUMERIC(14, 2) AS total
    FROM (
      SELECT pay.value ->> 'method' AS method, (pay.value ->> 'amount')::NUMERIC AS amount
      FROM public.sales s
      CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(s.payments) AS pay(value)
      WHERE s.company_id = p_company_id
        AND s.status = 'completed'
        AND s.created_at >= v_start AND s.created_at < v_end
        AND pay.value ->> 'method' <> 'cuenta_corriente'
      UNION ALL
      SELECT pay.value ->> 'method', (pay.value ->> 'amount')::NUMERIC
      FROM public.customer_payments cp
      CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(cp.payments) AS pay(value)
      WHERE cp.company_id = p_company_id
        AND cp.status = 'active'
        AND cp.created_at >= v_start AND cp.created_at < v_end
    ) u
    GROUP BY u.method
  ) t;

  SELECT COALESCE(SUM((pay.value ->> 'amount')::NUMERIC), 0)::NUMERIC(14, 2)
  INTO v_credit_sales
  FROM public.sales s
  CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(s.payments) AS pay(value)
  WHERE s.company_id = p_company_id
    AND s.status = 'completed'
    AND s.created_at >= v_start AND s.created_at < v_end
    AND pay.value ->> 'method' = 'cuenta_corriente';

  SELECT COALESCE(SUM(cp.amount), 0)::NUMERIC(14, 2)
  INTO v_collections
  FROM public.customer_payments cp
  WHERE cp.company_id = p_company_id AND cp.status = 'active'
    AND cp.created_at >= v_start AND cp.created_at < v_end;

  SELECT COALESCE(SUM(b.balance) FILTER (WHERE b.balance > 0), 0)::NUMERIC(14, 2)
  INTO v_receivable
  FROM private.customer_balance_rows(p_company_id) b;

  SELECT COALESCE(SUM(p.total_amount), 0)::NUMERIC(14, 2)
  INTO v_credit_purchases
  FROM public.credit_purchases cp
  JOIN public.purchases p ON p.company_id = cp.company_id AND p.id = cp.purchase_id
  WHERE cp.company_id = p_company_id
    AND p.status = 'completed'
    AND p.purchase_date BETWEEN p_from AND p_to;

  SELECT COALESCE(SUM(sp.amount), 0)::NUMERIC(14, 2)
  INTO v_supplier_payments
  FROM public.supplier_payments sp
  WHERE sp.company_id = p_company_id AND sp.status = 'active'
    AND sp.created_at >= v_start AND sp.created_at < v_end;

  SELECT COALESCE(SUM(b.balance) FILTER (WHERE b.balance > 0), 0)::NUMERIC(14, 2)
  INTO v_payables
  FROM private.supplier_balance_rows(p_company_id) b;

  SELECT COALESCE(SUM(pr.current_stock * pc.cost_price), 0)::NUMERIC(14, 2)
  INTO v_inventory
  FROM public.products pr
  JOIN public.product_costs pc
    ON pc.product_id = pr.id AND pc.company_id = pr.company_id
  WHERE pr.company_id = p_company_id AND pr.current_stock > 0;

  SELECT COALESCE(SUM(e.amount), 0)::NUMERIC(14, 2), COUNT(*)::INTEGER
  INTO v_expenses_total, v_expenses_count
  FROM public.expenses e
  WHERE e.company_id = p_company_id AND e.status = 'active'
    AND e.expense_date BETWEEN p_from AND p_to;

  SELECT COALESCE(pg_catalog.jsonb_object_agg(t.category, t.total), '{}'::JSONB)
  INTO v_expenses_by_cat
  FROM (
    SELECT e.category, SUM(e.amount)::NUMERIC(14, 2) AS total
    FROM public.expenses e
    WHERE e.company_id = p_company_id AND e.status = 'active'
      AND e.expense_date BETWEEN p_from AND p_to
    GROUP BY e.category
  ) t;

  RETURN pg_catalog.jsonb_build_object(
    'sales_total', v_sales_total,
    'sales_count', v_sales_count,
    'cancelled_total', v_cancelled_total,
    'cancelled_count', v_cancelled_count,
    'cogs_total', v_cogs,
    'purchases_total', v_purchases_total,
    'purchases_count', v_purchases_count,
    'payments_by_method', v_payments,
    'inventory_value', v_inventory,
    'expenses_total', v_expenses_total,
    'expenses_count', v_expenses_count,
    'expenses_by_category', v_expenses_by_cat,
    'credit_sales_total', v_credit_sales,
    'collections_total', v_collections,
    'receivable_total', v_receivable,
    'credit_purchases_total', v_credit_purchases,
    'supplier_payments_total', v_supplier_payments,
    'payables_total', v_payables
  );
END;
$$;

COMMENT ON FUNCTION public.financial_summary(UUID, DATE, DATE) IS
  'Resumen financiero del período (ventas, costo, compras, gastos, cuentas corrientes de clientes y proveedores, cobros por medio de pago y valor del inventario). Solo master_admin.';


REVOKE ALL ON FUNCTION public.financial_summary(UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.financial_summary(UUID, DATE, DATE) TO authenticated;
