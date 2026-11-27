-- ============================================================================
-- MIGRACIÓN: COMISIONES POR VENDEDOR
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
--
-- El vendedor se elige al cobrar entre el personal (employees) con porcentaje de comisión.
-- La venta guarda el vendedor y el porcentaje de ese momento.
-- Movimientos de comisión (private.commission_entries), cada uno en su fecha local:
--   + venta (total cobrado × %), − anulación (en la fecha de anulación),
--   − devolución (importe devuelto × %, en la fecha de la devolución).
-- Así un período ya pagado nunca cambia: lo que pasa después cae en el período siguiente.
-- Pagar: registra un gasto "comisiones" (create_expense) y cierra el período para ese
-- vendedor; anular el gasto lo reabre.
-- Acceso: ver el informe con 'personal' view; porcentajes, corregir vendedor y pagar con
-- 'personal' operate (pagar además pide 'gastos' operate, como cualquier gasto).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. COLUMNAS Y TABLA
-- ----------------------------------------------------------------------------
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS commission_percent NUMERIC(5, 2);
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS chk_employees_commission_percent;
ALTER TABLE public.employees ADD CONSTRAINT chk_employees_commission_percent
  CHECK (commission_percent IS NULL OR (commission_percent > 0 AND commission_percent <= 50));

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS seller_employee_id UUID;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS seller_commission_percent NUMERIC(5, 2);
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS fk_sales_seller;
ALTER TABLE public.sales ADD CONSTRAINT fk_sales_seller FOREIGN KEY (company_id, seller_employee_id)
  REFERENCES public.employees(company_id, id) ON DELETE RESTRICT;
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS chk_sales_seller_percent;
ALTER TABLE public.sales ADD CONSTRAINT chk_sales_seller_percent CHECK (
  (seller_employee_id IS NULL AND seller_commission_percent IS NULL)
  OR (seller_employee_id IS NOT NULL AND seller_commission_percent > 0 AND seller_commission_percent <= 50)
);
CREATE INDEX IF NOT EXISTS idx_sales_company_seller ON public.sales (company_id, seller_employee_id) WHERE seller_employee_id IS NOT NULL;

-- Categoría de gasto nueva
DO $$
DECLARE
  v_name TEXT;
BEGIN
  FOR v_name IN
    SELECT con.conname FROM pg_catalog.pg_constraint con
    WHERE con.conrelid = 'public.expenses'::regclass AND con.contype = 'c'
      AND pg_catalog.pg_get_constraintdef(con.oid) LIKE '%category%'
  LOOP
    EXECUTE pg_catalog.format('ALTER TABLE public.expenses DROP CONSTRAINT %I', v_name);
  END LOOP;
END;
$$;
ALTER TABLE public.expenses ADD CONSTRAINT chk_expenses_category CHECK (category IN (
  'combustible', 'mantenimiento', 'repuestos', 'alquiler', 'servicios',
  'impuestos', 'sueldos', 'viaticos', 'seguros', 'comisiones', 'otros'
));

CREATE TABLE IF NOT EXISTS public.commission_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  employee_id UUID NOT NULL,
  period_from DATE NOT NULL,
  period_to DATE NOT NULL,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  expense_id UUID NOT NULL REFERENCES public.expenses(id) ON DELETE RESTRICT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_commission_payments_period CHECK (period_from <= period_to),
  CONSTRAINT fk_commission_payments_employee FOREIGN KEY (company_id, employee_id)
    REFERENCES public.employees(company_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_commission_payments_employee ON public.commission_payments (company_id, employee_id, period_from);

ALTER TABLE public.commission_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_payments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "commission_payments_select" ON public.commission_payments;
CREATE POLICY "commission_payments_select" ON public.commission_payments FOR SELECT TO authenticated
  USING (company_id IN (SELECT private.my_accessible_company_ids()) AND private.has_module_level(company_id, ARRAY['personal'], 'view'));
REVOKE ALL ON public.commission_payments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.commission_payments TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. GUARDA DE VENTAS: además de anular, se puede corregir el vendedor (solo esas columnas)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_document_cancellation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'La tabla % es inmutable: no se permiten eliminaciones.', TG_TABLE_NAME;
  END IF;

  IF OLD.status = 'completed'
     AND NEW.status = 'cancelled'
     AND NEW.cancelled_at IS NOT NULL
     AND NEW.cancelled_by IS NOT NULL
     AND pg_catalog.btrim(COALESCE(NEW.cancel_reason, '')) <> ''
     AND (pg_catalog.to_jsonb(NEW) - 'status' - 'cancelled_at' - 'cancelled_by' - 'cancel_reason')
         = (pg_catalog.to_jsonb(OLD) - 'status' - 'cancelled_at' - 'cancelled_by' - 'cancel_reason')
  THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'sales'
     AND (pg_catalog.to_jsonb(NEW) - 'seller_employee_id' - 'seller_commission_percent')
         = (pg_catalog.to_jsonb(OLD) - 'seller_employee_id' - 'seller_commission_percent')
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'La tabla % es inmutable: solo se admite anular un documento completado.', TG_TABLE_NAME;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. MOVIMIENTOS DE COMISIÓN (única regla: la usan el informe y el pago)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.commission_entries(p_company_id UUID, p_from DATE, p_to DATE)
RETURNS TABLE (
  employee_id UUID, entry_date DATE, kind TEXT, sale_id UUID, sale_number TEXT, document_number TEXT,
  base_amount NUMERIC, commission_percent NUMERIC, commission NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH tz AS (SELECT c.timezone FROM public.companies c WHERE c.id = p_company_id),
  e AS (
    SELECT s.seller_employee_id, (s.created_at AT TIME ZONE (SELECT timezone FROM tz))::DATE AS d, 'sale'::TEXT AS kind,
           s.id, s.sale_number, s.sale_number AS doc, s.total_amount AS base, s.seller_commission_percent AS pct, 1 AS sign
    FROM public.sales s
    WHERE s.company_id = p_company_id AND s.seller_employee_id IS NOT NULL
    UNION ALL
    SELECT s.seller_employee_id, (s.cancelled_at AT TIME ZONE (SELECT timezone FROM tz))::DATE, 'cancellation',
           s.id, s.sale_number, s.sale_number, s.total_amount, s.seller_commission_percent, -1
    FROM public.sales s
    WHERE s.company_id = p_company_id AND s.seller_employee_id IS NOT NULL AND s.status = 'cancelled'
    UNION ALL
    SELECT s.seller_employee_id, (r.created_at AT TIME ZONE (SELECT timezone FROM tz))::DATE, 'return',
           s.id, s.sale_number, r.return_number, r.refund_amount, s.seller_commission_percent, -1
    FROM public.sale_returns r
    JOIN public.sales s ON s.company_id = r.company_id AND s.id = r.sale_id
    WHERE r.company_id = p_company_id AND s.seller_employee_id IS NOT NULL AND r.refund_amount > 0
  )
  SELECT e.seller_employee_id, e.d, e.kind, e.id, e.sale_number, e.doc, e.sign * e.base, e.pct,
         e.sign * pg_catalog.round(e.base * e.pct / 100, 2)
  FROM e
  WHERE e.d BETWEEN p_from AND p_to;
$$;
REVOKE ALL ON FUNCTION private.commission_entries(UUID, DATE, DATE) FROM PUBLIC, anon, authenticated;

-- Pago activo (su gasto no está anulado) que cubre una fecha para un vendedor
CREATE OR REPLACE FUNCTION private.commission_paid_on(p_company_id UUID, p_employee_id UUID, p_date DATE)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.commission_payments cp
    JOIN public.expenses ex ON ex.id = cp.expense_id
    WHERE cp.company_id = p_company_id AND cp.employee_id = p_employee_id AND ex.status = 'active'
      AND p_date BETWEEN cp.period_from AND cp.period_to
  );
$$;
REVOKE ALL ON FUNCTION private.commission_paid_on(UUID, UUID, DATE) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.assert_commission_period(p_from DATE, p_to DATE)
RETURNS VOID
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
    RAISE EXCEPTION 'Elegí un período válido (desde / hasta).';
  END IF;
  IF p_to - p_from > 366 THEN
    RAISE EXCEPTION 'El período no puede superar un año.';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION private.assert_commission_period(DATE, DATE) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. INFORME: movimientos del período con el vendedor y si ya están pagados
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.commission_report(p_company_id UUID, p_from DATE, p_to DATE)
RETURNS TABLE (
  employee_id UUID, employee_name TEXT, entry_date DATE, kind TEXT, sale_id UUID, sale_number TEXT,
  document_number TEXT, base_amount NUMERIC, commission_percent NUMERIC, commission NUMERIC, is_paid BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.assert_module_access(p_company_id, ARRAY['personal'], 'view');
  PERFORM private.assert_commission_period(p_from, p_to);
  RETURN QUERY
  SELECT ce.employee_id, em.full_name, ce.entry_date, ce.kind, ce.sale_id, ce.sale_number, ce.document_number,
         ce.base_amount, ce.commission_percent, ce.commission,
         private.commission_paid_on(p_company_id, ce.employee_id, ce.entry_date)
  FROM private.commission_entries(p_company_id, p_from, p_to) ce
  JOIN public.employees em ON em.company_id = p_company_id AND em.id = ce.employee_id
  ORDER BY em.full_name, ce.entry_date, ce.sale_number;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. PAGAR: gasto "comisiones" por lo del período; no se superpone con otro pago activo
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pay_commission(
  p_company_id UUID, p_employee_id UUID, p_from DATE, p_to DATE, p_payment_method TEXT, p_pay_from_cash BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_name TEXT;
  v_amount NUMERIC(14, 2);
  v_today DATE;
  v_expense JSONB;
  v_payment_id UUID;
BEGIN
  PERFORM private.assert_module_access(p_company_id, ARRAY['personal'], 'operate');
  PERFORM private.assert_commission_period(p_from, p_to);

  -- Serializa los pagos de un mismo vendedor
  SELECT em.full_name INTO v_name FROM public.employees em
  WHERE em.company_id = p_company_id AND em.id = p_employee_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El vendedor no existe o no pertenece a esta empresa.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.commission_payments cp JOIN public.expenses ex ON ex.id = cp.expense_id
    WHERE cp.company_id = p_company_id AND cp.employee_id = p_employee_id AND ex.status = 'active'
      AND cp.period_from <= p_to AND cp.period_to >= p_from
  ) THEN
    RAISE EXCEPTION 'Ya hay un pago de comisión de % que se superpone con ese período.', v_name;
  END IF;

  SELECT COALESCE(pg_catalog.sum(ce.commission), 0) INTO v_amount
  FROM private.commission_entries(p_company_id, p_from, p_to) ce WHERE ce.employee_id = p_employee_id;
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'No hay comisión para pagar a % en ese período.', v_name;
  END IF;

  SELECT (pg_catalog.now() AT TIME ZONE c.timezone)::DATE INTO v_today FROM public.companies c WHERE c.id = p_company_id;
  v_expense := public.create_expense(
    p_company_id, v_today, 'comisiones',
    'Comisión de ' || v_name || ' (' || pg_catalog.to_char(p_from, 'DD/MM/YYYY') || ' al ' || pg_catalog.to_char(p_to, 'DD/MM/YYYY') || ')',
    v_amount, p_payment_method, NULL, p_pay_from_cash
  );

  INSERT INTO public.commission_payments (company_id, employee_id, period_from, period_to, amount, expense_id, created_by)
  VALUES (p_company_id, p_employee_id, p_from, p_to, v_amount, (v_expense ->> 'expense_id')::UUID, auth.uid())
  RETURNING id INTO v_payment_id;

  RETURN pg_catalog.jsonb_build_object('payment_id', v_payment_id, 'expense_id', v_expense ->> 'expense_id', 'amount', v_amount);
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. PORCENTAJE DE UN EMPLEADO (NULL = no vende a comisión)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_employee_commission(p_company_id UUID, p_employee_id UUID, p_percent NUMERIC)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.assert_module_access(p_company_id, ARRAY['personal'], 'operate');
  IF p_percent IS NOT NULL AND (p_percent <= 0 OR p_percent > 50 OR pg_catalog.scale(p_percent) > 2) THEN
    RAISE EXCEPTION 'La comisión tiene que estar entre 0,01 %% y 50 %%, con hasta 2 decimales.';
  END IF;
  UPDATE public.employees SET commission_percent = p_percent, updated_at = pg_catalog.now()
  WHERE company_id = p_company_id AND id = p_employee_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El empleado no existe o no pertenece a esta empresa.';
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. VENDEDORES (todo el equipo: para elegir al cobrar y para mostrar el nombre en ventas y tickets)
--    can_sell: activo y con porcentaje (los únicos que se pueden elegir).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sale_sellers(p_company_id UUID)
RETURNS TABLE (employee_id UUID, full_name TEXT, commission_percent NUMERIC, can_sell BOOLEAN)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_company_id IS NULL OR p_company_id NOT IN (SELECT private.my_accessible_company_ids()) THEN
    RAISE EXCEPTION 'El usuario no es un miembro activo de esta empresa.';
  END IF;
  RETURN QUERY
  SELECT em.id, em.full_name, em.commission_percent, (em.status = 'active' AND em.commission_percent IS NOT NULL)
  FROM public.employees em
  WHERE em.company_id = p_company_id
    AND (em.commission_percent IS NOT NULL
         OR EXISTS (SELECT 1 FROM public.sales s WHERE s.company_id = p_company_id AND s.seller_employee_id = em.id))
  ORDER BY em.full_name;
END;
$$;

-- Vendedor válido para una venta: activo y con porcentaje. Devuelve el porcentaje.
CREATE OR REPLACE FUNCTION private.seller_percent(p_company_id UUID, p_employee_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v RECORD;
BEGIN
  SELECT em.full_name, em.status, em.commission_percent INTO v FROM public.employees em
  WHERE em.company_id = p_company_id AND em.id = p_employee_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El vendedor elegido no existe o no pertenece a esta empresa.';
  END IF;
  IF v.status <> 'active' OR v.commission_percent IS NULL THEN
    RAISE EXCEPTION '% no está activo como vendedor a comisión.', v.full_name;
  END IF;
  RETURN v.commission_percent;
END;
$$;
REVOKE ALL ON FUNCTION private.seller_percent(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 8. CORREGIR EL VENDEDOR DE UNA VENTA (NULL = sin vendedor)
--    No se toca una venta cuyos movimientos caen en un período ya pagado.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_sale_seller(p_company_id UUID, p_sale_id UUID, p_employee_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sale RECORD;
  v_pct NUMERIC(5, 2);
BEGIN
  PERFORM private.assert_module_access(p_company_id, ARRAY['personal'], 'operate');
  SELECT s.id, s.sale_number, s.seller_employee_id INTO v_sale FROM public.sales s
  WHERE s.company_id = p_company_id AND s.id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venta no encontrada en esta empresa.';
  END IF;
  IF v_sale.seller_employee_id IS NOT DISTINCT FROM p_employee_id THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM private.commission_entries(p_company_id, '1900-01-01', '2999-12-31') ce
    WHERE ce.sale_id = p_sale_id AND private.commission_paid_on(p_company_id, ce.employee_id, ce.entry_date)
  ) THEN
    RAISE EXCEPTION 'La comisión de la venta % ya se pagó: no se puede cambiar el vendedor.', v_sale.sale_number;
  END IF;
  IF p_employee_id IS NOT NULL THEN
    v_pct := private.seller_percent(p_company_id, p_employee_id);
  END IF;

  UPDATE public.sales SET seller_employee_id = p_employee_id, seller_commission_percent = v_pct
  WHERE company_id = p_company_id AND id = p_sale_id;
  -- Si el nuevo vendedor ya tiene pagado ese período, tampoco se puede
  IF p_employee_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM private.commission_entries(p_company_id, '1900-01-01', '2999-12-31') ce
    WHERE ce.sale_id = p_sale_id AND private.commission_paid_on(p_company_id, ce.employee_id, ce.entry_date)
  ) THEN
    RAISE EXCEPTION 'Ese vendedor ya cobró la comisión del período de la venta %.', v_sale.sale_number;
  END IF;

  INSERT INTO public.audit_log (company_id, table_name, record_id, action, old_data, new_data, performed_by, actor_role)
  SELECT p_company_id, 'sales', p_sale_id::TEXT, 'UPDATE',
         pg_catalog.jsonb_build_object('seller_employee_id', v_sale.seller_employee_id),
         pg_catalog.jsonb_build_object('seller_employee_id', p_employee_id, 'seller_commission_percent', v_pct),
         auth.uid(), (SELECT cm.role FROM public.company_members cm WHERE cm.company_id = p_company_id AND cm.user_id = auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.commission_report(UUID, DATE, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pay_commission(UUID, UUID, DATE, DATE, TEXT, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_employee_commission(UUID, UUID, NUMERIC) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sale_sellers(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_sale_seller(UUID, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commission_report(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pay_commission(UUID, UUID, DATE, DATE, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_employee_commission(UUID, UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sale_sellers(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_sale_seller(UUID, UUID, UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 9. VENTA CON VENDEDOR: process_sale con p_seller_employee_id (opcional)
--    Misma lógica que la versión de listas de precios; se agrega el vendedor.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.process_sale(UUID, UUID, JSONB, NUMERIC, JSONB, TEXT, UUID, UUID, BOOLEAN);

CREATE OR REPLACE FUNCTION public.process_sale(
  p_company_id UUID,
  p_idempotency_key UUID,
  p_items JSONB,
  p_discount NUMERIC DEFAULT 0.00,
  p_payments JSONB DEFAULT '[]'::jsonb,
  p_notes TEXT DEFAULT NULL,
  p_customer_id UUID DEFAULT NULL,
  p_price_list_id UUID DEFAULT NULL,
  p_override_price_list BOOLEAN DEFAULT false,
  p_seller_employee_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_company_active BOOLEAN;
  v_is_admin BOOLEAN;
  v_cust_active BOOLEAN;
  v_list UUID;
  v_seller_pct NUMERIC(5, 2);
  v_canonical_json JSONB;
  v_request_hash TEXT;
  v_rec RECORD;
  v_attempts INT := 0;

  v_sorted_product_ids UUID[];
  v_num_items INT;
  v_item RECORD;
  v_prod RECORD;
  v_cost NUMERIC(14, 2);

  v_subtotal NUMERIC(14, 2) := 0.00;
  v_discount NUMERIC(14, 2) := 0.00;
  v_total_amount NUMERIC(14, 2) := 0.00;
  v_total_payments NUMERIC(14, 2) := 0.00;
  v_payment RECORD;

  v_next_counter BIGINT;
  v_sale_number TEXT;
  v_sale_id UUID;
  v_movement_id UUID;

  v_response_payload JSONB;
BEGIN
  -- 1. Autenticación y Parámetros Obligatorios
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;

  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'El identificador de empresa (p_company_id) es obligatorio.';
  END IF;

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'La clave de idempotencia (p_idempotency_key) es obligatoria.';
  END IF;

  IF p_items IS NULL OR pg_catalog.jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'El detalle de la venta (p_items) debe ser un arreglo JSON válido.';
  END IF;

  v_num_items := pg_catalog.jsonb_array_length(p_items);
  IF v_num_items = 0 THEN
    RAISE EXCEPTION 'El detalle de venta no puede estar vacío.';
  END IF;

  -- 2. Validación de Rol y Membresía Activa (empleado o master_admin)
  PERFORM private.assert_company_role(p_company_id, NULL);

  -- 2.1. Bloqueo de Empresa (FOR NO KEY UPDATE) para serializar contra desactivación concurrente
  SELECT is_active INTO v_company_active
  FROM public.companies
  WHERE id = p_company_id
  FOR NO KEY UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Empresa con ID % no encontrada.', p_company_id;
  END IF;

  IF NOT v_company_active THEN
    RAISE EXCEPTION 'La empresa se encuentra inactiva. No se admiten ventas.';
  END IF;

  -- 2.2. Revalidar rol tras adquirir el bloqueo de empresa
  PERFORM private.assert_company_role(p_company_id, NULL);
  v_is_admin := private.has_company_role(p_company_id, 'master_admin');

  -- 3. Validación de Descuentos por Rol
  v_discount := COALESCE(p_discount, 0.00);
  IF v_discount < 0.00 THEN
    RAISE EXCEPTION 'El descuento no puede ser negativo.';
  END IF;

  IF v_discount > 0.00 AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Solo usuarios con rol master_admin pueden autorizar ventas con descuento.';
  END IF;

  -- 3.1. Validación de Cliente (si fue provisto p_customer_id)
  IF p_customer_id IS NOT NULL THEN
    SELECT is_active INTO v_cust_active
    FROM public.customers
    WHERE id = p_customer_id AND company_id = p_company_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'El cliente especificado no existe o no pertenece a esta empresa.'
        USING ERRCODE = 'P0001';
    END IF;

    IF NOT v_cust_active THEN
      RAISE EXCEPTION 'No se pueden registrar ventas asociadas a un cliente inactivo.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- 3.2. Lista de precios: la del cliente; el Master Admin puede elegir otra (o ninguna)
  IF COALESCE(p_override_price_list, false) THEN
    IF NOT v_is_admin THEN
      RAISE EXCEPTION 'Solo el Master Admin puede cambiar la lista de precios de una venta.';
    END IF;
    v_list := p_price_list_id;
  ELSIF p_customer_id IS NOT NULL THEN
    SELECT price_list_id INTO v_list FROM public.customers WHERE id = p_customer_id AND company_id = p_company_id;
  END IF;
  IF v_list IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.price_lists WHERE id = v_list AND company_id = p_company_id AND is_active
  ) THEN
    IF COALESCE(p_override_price_list, false) THEN
      RAISE EXCEPTION 'La lista de precios elegida no existe o está desactivada.';
    END IF;
    v_list := NULL; -- la lista del cliente se desactivó: precio normal
  END IF;

  -- 3.3. Vendedor (opcional): activo y con porcentaje; se congela el porcentaje en la venta
  IF p_seller_employee_id IS NOT NULL THEN
    v_seller_pct := private.seller_percent(p_company_id, p_seller_employee_id);
  END IF;

  -- 4. Idempotencia: Cálculo de Hash Canónico de la Petición
  -- COMPATIBILIDAD HISTÓRICA: Si p_customer_id es NULL, el JSON canónico debe mantener
  -- exactamente la estructura y claves de la tanda anterior para evitar invalidar replays históricos.
  IF p_customer_id IS NULL THEN
    v_canonical_json := pg_catalog.jsonb_build_object(
      'company_id', p_company_id,
      'discount', v_discount,
      'items', p_items,
      'payments', COALESCE(p_payments, '[]'::jsonb),
      'notes', COALESCE(p_notes, '')
    );
  ELSE
    v_canonical_json := pg_catalog.jsonb_build_object(
      'company_id', p_company_id,
      'customer_id', p_customer_id,
    'price_list_id', v_list,
      'discount', v_discount,
      'items', p_items,
      'payments', COALESCE(p_payments, '[]'::jsonb),
      'notes', COALESCE(p_notes, '')
    );
  END IF;

  v_request_hash := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to((v_canonical_json || CASE WHEN v_list IS NULL THEN '{}'::jsonb
      ELSE pg_catalog.jsonb_build_object('price_list_id', v_list) END
      || CASE WHEN p_seller_employee_id IS NULL THEN '{}'::jsonb
      ELSE pg_catalog.jsonb_build_object('seller_employee_id', p_seller_employee_id) END)::text, 'UTF8')),
    'hex'
  );

  -- Bucle de reserva/consulta de clave de idempotencia
  LOOP
    v_attempts := v_attempts + 1;
    IF v_attempts > 5 THEN
      RAISE EXCEPTION 'Fallo de concurrencia al procesar la clave de idempotencia de la venta.';
    END IF;

    SELECT id, request_hash, response_payload, expires_at INTO v_rec
    FROM public.operation_idempotency
    WHERE company_id = p_company_id
      AND created_by = v_user_id
      AND operation_type = 'sale'
      AND idempotency_key = p_idempotency_key
    FOR UPDATE;

    IF FOUND THEN
      -- Si expiró el TTL, se purga y se reintenta inserción limpia
      IF v_rec.expires_at <= pg_catalog.now() THEN
        DELETE FROM public.operation_idempotency WHERE id = v_rec.id;
        CONTINUE;
      END IF;

      -- Verificar coherencia de hash
      IF v_rec.request_hash <> v_request_hash THEN
        RAISE EXCEPTION 'Idempotency key mismatch: clave de venta reutilizada con distintos parámetros.';
      END IF;

      IF v_rec.response_payload IS NULL THEN
        RAISE EXCEPTION 'Estado inconsistente de idempotencia: venta previa en procesamiento inconcluso.';
      END IF;

      -- Retorno directo del comprobante procesado originalmente
      RETURN v_rec.response_payload;
    END IF;

    -- Intento de inserción de reserva de clave
    BEGIN
      INSERT INTO public.operation_idempotency (
        company_id,
        operation_type,
        idempotency_key,
        created_by,
        request_hash,
        response_payload,
        created_at,
        updated_at,
        expires_at
      ) VALUES (
        p_company_id,
        'sale',
        p_idempotency_key,
        v_user_id,
        v_request_hash,
        NULL,
        pg_catalog.now(),
        pg_catalog.now(),
        pg_catalog.now() + interval '24 hours'
      );
      EXIT; -- Inserción exitosa de reserva
    EXCEPTION WHEN unique_violation THEN
      CONTINUE; -- Colisión concurrente, repetir lectura FOR UPDATE
    END;
  END LOOP;

  -- 5. Validación de Ítems del Carrito y Detección de Duplicados
  -- Las líneas de "artículo varios" no tienen producto: no se bloquean ni tocan stock
  SELECT pg_catalog.array_agg((x.value->>'product_id')::UUID)
  INTO v_sorted_product_ids
  FROM pg_catalog.jsonb_array_elements(p_items) AS x
  WHERE NULLIF(x.value->>'product_id', '') IS NOT NULL;

  -- 5.0. Validación de artículos varios (descripción y precio libres, sin producto)
  FOR v_item IN
    SELECT NULLIF(pg_catalog.btrim(x.value->>'description'), '') AS description,
           (x.value->>'unit_price')::NUMERIC AS unit_price,
           (x.value->>'quantity')::NUMERIC AS quantity
    FROM pg_catalog.jsonb_array_elements(p_items) AS x
    WHERE NULLIF(x.value->>'product_id', '') IS NULL
  LOOP
    IF v_item.description IS NULL THEN
      RAISE EXCEPTION 'Cada artículo varios necesita una descripción.';
    END IF;
    IF pg_catalog.length(v_item.description) > 120 THEN
      RAISE EXCEPTION 'La descripción de un artículo varios no puede superar los 120 caracteres.';
    END IF;
    IF v_item.unit_price IS NULL OR v_item.unit_price < 0.00 OR pg_catalog.scale(v_item.unit_price) > 2 THEN
      RAISE EXCEPTION 'El precio del artículo varios "%" no es válido.', v_item.description;
    END IF;
    IF v_item.quantity IS NULL OR v_item.quantity <= 0.00 OR pg_catalog.scale(v_item.quantity) > 2 THEN
      RAISE EXCEPTION 'La cantidad del artículo varios "%" debe ser mayor a 0.', v_item.description;
    END IF;
  END LOOP;

  IF (SELECT pg_catalog.count(*) FROM pg_catalog.unnest(v_sorted_product_ids)) <>
     (SELECT pg_catalog.count(DISTINCT x) FROM pg_catalog.unnest(v_sorted_product_ids) x) THEN
    RAISE EXCEPTION 'Existen productos duplicados en el detalle de la venta.';
  END IF;

  -- 5.1. Bloqueo determinístico canónico de productos (ORDER BY id ASC FOR UPDATE)
  PERFORM 1
  FROM public.products p
  WHERE p.id = ANY(v_sorted_product_ids)
    AND p.company_id = p_company_id
  ORDER BY p.id ASC
  FOR UPDATE;

  -- Verificar que todos los productos existan y pertenezcan a la empresa
  IF (
    SELECT pg_catalog.count(*)
    FROM public.products p
    WHERE p.id = ANY(v_sorted_product_ids)
      AND p.company_id = p_company_id
  ) <> COALESCE(pg_catalog.cardinality(v_sorted_product_ids), 0) THEN
    RAISE EXCEPTION 'Uno o más productos del detalle no pertenecen a esta empresa o no existen.';
  END IF;

  -- Verificar que ningún producto esté inactivo
  FOR v_prod IN
    SELECT p.id, p.name, p.is_active, p.selling_price
    FROM public.products p
    WHERE p.id = ANY(v_sorted_product_ids)
    ORDER BY p.id ASC
  LOOP
    IF NOT v_prod.is_active THEN
      RAISE EXCEPTION 'El producto "%" está inactivo y no puede ser vendido.', v_prod.name;
    END IF;
  END LOOP;

  -- 6. Cálculo del Subtotal con Precios Autoritativos de PostgreSQL (varios: precio escrito en la venta)
  FOR v_item IN
    SELECT NULLIF(x.value->>'product_id', '')::UUID AS product_id,
           (x.value->>'quantity')::NUMERIC AS quantity,
           (x.value->>'unit_price')::NUMERIC AS unit_price
    FROM pg_catalog.jsonb_array_elements(p_items) AS x
  LOOP
    IF v_item.quantity IS NULL OR v_item.quantity <= 0.00 THEN
      RAISE EXCEPTION 'La cantidad debe ser mayor a 0 para cada producto.';
    END IF;

    IF v_item.product_id IS NULL THEN
      v_subtotal := v_subtotal + pg_catalog.round(v_item.unit_price * v_item.quantity, 2);
      CONTINUE;
    END IF;

    SELECT private.price_for(p_company_id, v_list, v_item.product_id) INTO v_prod.selling_price;

    v_subtotal := v_subtotal + pg_catalog.round(v_prod.selling_price * v_item.quantity, 2);
  END LOOP;

  IF v_discount > v_subtotal THEN
    RAISE EXCEPTION 'El descuento (% ARS) no puede superar el subtotal de la venta (% ARS).', v_discount, v_subtotal;
  END IF;

  v_total_amount := v_subtotal - v_discount;

  -- 7. Validación de Medios de Pago
  IF v_total_amount = 0.00 THEN
    IF NOT v_is_admin THEN
      RAISE EXCEPTION 'Ventas con total $0.00 requieren autorización de master_admin.';
    END IF;
  ELSE
    IF p_payments IS NOT NULL AND pg_catalog.jsonb_array_length(p_payments) > 0 THEN
      FOR v_payment IN
        SELECT (y.value->>'method')::TEXT AS method,
               (y.value->>'amount')::NUMERIC AS amount
        FROM pg_catalog.jsonb_array_elements(p_payments) AS y
      LOOP
        IF v_payment.amount IS NULL OR v_payment.amount <= 0.00 THEN
          RAISE EXCEPTION 'El importe de cada medio de pago debe ser mayor a 0.';
        END IF;

        IF v_payment.method NOT IN ('efectivo', 'transferencia', 'debito', 'credito', 'cheque', 'courtesy', 'cuenta_corriente') THEN
          RAISE EXCEPTION 'Medio de pago inválido: %.', v_payment.method;
        END IF;

        v_total_payments := v_total_payments + v_payment.amount;
      END LOOP;

      IF p_customer_id IS NULL AND EXISTS (
        SELECT 1 FROM pg_catalog.jsonb_array_elements(p_payments) AS cc
        WHERE cc.value->>'method' = 'cuenta_corriente'
      ) THEN
        RAISE EXCEPTION 'Para vender en cuenta corriente hay que elegir un cliente.';
      END IF;

      IF v_total_payments <> v_total_amount THEN
        RAISE EXCEPTION 'La suma de los pagos (% ARS) no coincide con el total de la venta (% ARS).', v_total_payments, v_total_amount;
      END IF;
    ELSE
      RAISE EXCEPTION 'Debe registrar al menos un medio de pago que cubra el total de la venta.';
    END IF;
  END IF;

  -- 8. Numeración Correlativa Interna Segura (company_counters FOR UPDATE)
  SELECT last_value + 1 INTO v_next_counter
  FROM public.company_counters
  WHERE company_id = p_company_id AND kind = 'sale'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contador transaccional de ventas no inicializado para esta empresa.';
  END IF;

  UPDATE public.company_counters
  SET last_value = v_next_counter,
      updated_at = pg_catalog.now()
  WHERE company_id = p_company_id AND kind = 'sale';

  v_sale_number := 'VTA-' || pg_catalog.lpad(v_next_counter::text, 8, '0');

  -- 9. Inserción de la Cabecera de Venta (con customer_id asociado si fue indicado)
  INSERT INTO public.sales (
    company_id,
    sale_number,
    customer_id,
    price_list_id,
    seller_employee_id,
    seller_commission_percent,
    status,
    subtotal,
    discount,
    total_amount,
    payments,
    notes,
    created_by,
    created_at
  ) VALUES (
    p_company_id,
    v_sale_number,
    p_customer_id,
    v_list,
    p_seller_employee_id,
    v_seller_pct,
    'completed',
    v_subtotal,
    v_discount,
    v_total_amount,
    COALESCE(p_payments, '[]'::jsonb),
    p_notes,
    v_user_id,
    pg_catalog.now()
  ) RETURNING id INTO v_sale_id;

  -- 10. Inserción de Líneas de Venta, Movimientos y Costos Congelados
  FOR v_item IN
    SELECT NULLIF(x.value->>'product_id', '')::UUID AS product_id,
           (x.value->>'quantity')::NUMERIC AS quantity,
           NULLIF(pg_catalog.btrim(x.value->>'description'), '') AS description,
           (x.value->>'unit_price')::NUMERIC AS unit_price
    FROM pg_catalog.jsonb_array_elements(p_items) AS x
  LOOP
    -- 10.0. Artículo varios: solo la línea de venta (sin stock ni costo)
    IF v_item.product_id IS NULL THEN
      INSERT INTO public.sale_items (company_id, sale_id, product_id, description, quantity, unit_price, subtotal)
      VALUES (p_company_id, v_sale_id, NULL, v_item.description, v_item.quantity, v_item.unit_price,
              pg_catalog.round(v_item.unit_price * v_item.quantity, 2));
      CONTINUE;
    END IF;
    SELECT private.price_for(p_company_id, v_list, v_item.product_id) INTO v_prod.selling_price;

    SELECT cost_price INTO v_cost
    FROM public.product_costs
    WHERE product_id = v_item.product_id AND company_id = p_company_id;

    -- 10.1. Registro en sale_items
    INSERT INTO public.sale_items (
      company_id,
      sale_id,
      product_id,
      quantity,
      unit_price,
      subtotal
    ) VALUES (
      p_company_id,
      v_sale_id,
      v_item.product_id,
      v_item.quantity,
      v_prod.selling_price,
      pg_catalog.round(v_prod.selling_price * v_item.quantity, 2)
    );

    -- 10.2. Registro en stock_movements (descuenta stock en sync_product_stock)
    INSERT INTO public.stock_movements (
      company_id,
      product_id,
      direction,
      reason,
      quantity,
      reference_sale_id,
      reference_doc,
      notes,
      created_by
    ) VALUES (
      p_company_id,
      v_item.product_id,
      'decrease',
      'sale',
      v_item.quantity,
      v_sale_id,
      v_sale_number,
      'Venta ' || v_sale_number,
      v_user_id
    ) RETURNING id INTO v_movement_id;

    -- 10.3. Congelar costo histórico en movement_costs
    INSERT INTO public.movement_costs (
      company_id,
      movement_id,
      unit_cost,
      total_cost
    ) VALUES (
      p_company_id,
      v_movement_id,
      COALESCE(v_cost, 0.00),
      pg_catalog.round(COALESCE(v_cost, 0.00) * v_item.quantity, 2)
    );
  END LOOP;

  -- 11. Generar Payload de Respuesta y Asentar en operation_idempotency
  v_response_payload := pg_catalog.jsonb_build_object(
    'success', true,
    'sale_id', v_sale_id,
    'sale_number', v_sale_number,
    'company_id', p_company_id,
    'customer_id', p_customer_id,
    'seller_employee_id', p_seller_employee_id,
    'subtotal', v_subtotal,
    'discount', v_discount,
    'total_amount', v_total_amount,
    'status', 'completed',
    'created_at', pg_catalog.now()
  );

  UPDATE public.operation_idempotency
  SET response_payload = v_response_payload,
      updated_at = pg_catalog.now()
  WHERE company_id = p_company_id
    AND created_by = v_user_id
    AND operation_type = 'sale'
    AND idempotency_key = p_idempotency_key;

  RETURN v_response_payload;
END;
$$;

REVOKE ALL ON FUNCTION public.process_sale(UUID, UUID, JSONB, NUMERIC, JSONB, TEXT, UUID, UUID, BOOLEAN, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_sale(UUID, UUID, JSONB, NUMERIC, JSONB, TEXT, UUID, UUID, BOOLEAN, UUID) TO authenticated;
