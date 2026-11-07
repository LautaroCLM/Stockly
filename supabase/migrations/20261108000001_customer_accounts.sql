-- ============================================================================
-- MIGRACIÓN: CUENTA CORRIENTE DE CLIENTES (COBROS)
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
--
-- Una venta puede quedar total o parcialmente "a cuenta corriente" de un cliente
-- (por ejemplo, una municipalidad). Esa parte no se cobra en el momento: queda como
-- deuda del cliente hasta que se registre un cobro.
--
--   * saldo del cliente = ventas completadas a cuenta corriente - cobros activos.
--     Nunca se guarda: se calcula, así anular una venta lo corrige solo.
--   * Cobros: tabla customer_payments, con varios medios de pago por cobro.
--     No se editan ni se borran: se anulan con motivo (solo Master Admin).
--   * Un cobro no puede superar el saldo del cliente.
--   * Si el cobro incluye efectivo y se marca "ingresa a la caja", se registra el
--     ingreso en la caja abierta en la misma operación.
--   * Es idempotente: reenviar el mismo cobro (misma clave) no lo duplica.
--   * No hay tope de crédito: solo se informa el saldo.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TABLA DE COBROS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  customer_id UUID NOT NULL,
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
  CONSTRAINT fk_customer_payments_customer FOREIGN KEY (company_id, customer_id)
    REFERENCES public.customers(company_id, id) ON DELETE RESTRICT,
  CONSTRAINT uq_customer_payments_idempotency UNIQUE (company_id, created_by, idempotency_key),
  CONSTRAINT chk_customer_payments_void_state CHECK (
    (status = 'active' AND voided_at IS NULL AND voided_by IS NULL AND void_reason IS NULL AND void_cash_movement_id IS NULL)
    OR (status = 'voided' AND voided_at IS NOT NULL AND voided_by IS NOT NULL AND void_reason IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS customer_payments_customer_idx
  ON public.customer_payments (company_id, customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sales_company_customer_idx
  ON public.sales (company_id, customer_id, created_at) WHERE customer_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. INMUTABILIDAD, AUDITORÍA, RLS Y REALTIME
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_customer_payment_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Los cobros no se pueden borrar: anulalos con un motivo.';
  END IF;
  IF OLD.status = 'voided' THEN
    RAISE EXCEPTION 'Un cobro anulado no se puede modificar.';
  END IF;
  IF NEW.company_id <> OLD.company_id OR NEW.customer_id <> OLD.customer_id OR NEW.amount <> OLD.amount
     OR NEW.payments <> OLD.payments OR NEW.notes IS DISTINCT FROM OLD.notes
     OR NEW.cash_movement_id IS DISTINCT FROM OLD.cash_movement_id
     OR NEW.idempotency_key <> OLD.idempotency_key OR NEW.created_by <> OLD.created_by
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Los datos de un cobro no se pueden editar: anulalo y registralo de nuevo.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_customer_payment_mutation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tr_customer_payments_guard ON public.customer_payments;
CREATE TRIGGER tr_customer_payments_guard
  BEFORE UPDATE OR DELETE ON public.customer_payments
  FOR EACH ROW EXECUTE FUNCTION public.guard_customer_payment_mutation();

DROP TRIGGER IF EXISTS tr_audit_customer_payments ON public.customer_payments;
CREATE TRIGGER tr_audit_customer_payments
  AFTER INSERT OR UPDATE OR DELETE ON public.customer_payments
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger('id');

ALTER TABLE public.customer_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_payments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer_payments_select_member" ON public.customer_payments;
CREATE POLICY "customer_payments_select_member"
  ON public.customer_payments FOR SELECT TO authenticated
  USING (company_id IN (SELECT private.my_accessible_company_ids()));

REVOKE ALL ON public.customer_payments FROM PUBLIC, anon;
GRANT SELECT ON public.customer_payments TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.customer_payments FROM authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'customer_payments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_payments;
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- 3. SALDOS (cálculo central, de uso interno)
-- ----------------------------------------------------------------------------
-- Parte de cada venta completada que quedó a cuenta corriente.
CREATE OR REPLACE FUNCTION private.sale_credit_amount(p_payments JSONB)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(SUM((pay.value ->> 'amount')::NUMERIC), 0)::NUMERIC(14, 2)
  FROM pg_catalog.jsonb_array_elements(p_payments) AS pay(value)
  WHERE pay.value ->> 'method' = 'cuenta_corriente';
$$;

REVOKE ALL ON FUNCTION private.sale_credit_amount(JSONB) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.customer_balance(p_company_id UUID, p_customer_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT (
    COALESCE((
      SELECT SUM(private.sale_credit_amount(s.payments))
      FROM public.sales s
      WHERE s.company_id = p_company_id AND s.customer_id = p_customer_id AND s.status = 'completed'
    ), 0)
    - COALESCE((
      SELECT SUM(cp.amount)
      FROM public.customer_payments cp
      WHERE cp.company_id = p_company_id AND cp.customer_id = p_customer_id AND cp.status = 'active'
    ), 0)
  )::NUMERIC(14, 2);
$$;

REVOKE ALL ON FUNCTION private.customer_balance(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- Saldo por cliente, con la fecha de la deuda abierta más antigua (los cobros
-- cancelan primero las ventas más viejas).
CREATE OR REPLACE FUNCTION private.customer_balance_rows(p_company_id UUID)
RETURNS TABLE (
  customer_id UUID,
  customer_name TEXT,
  charged_total NUMERIC,
  collected_total NUMERIC,
  balance NUMERIC,
  last_activity TIMESTAMPTZ,
  oldest_open_since TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH charges AS (
    SELECT s.customer_id, s.created_at, private.sale_credit_amount(s.payments) AS amt,
           SUM(private.sale_credit_amount(s.payments)) OVER (
             PARTITION BY s.customer_id ORDER BY s.created_at, s.id
           ) AS cum
    FROM public.sales s
    WHERE s.company_id = p_company_id AND s.customer_id IS NOT NULL AND s.status = 'completed'
  ),
  charged AS (
    SELECT c.customer_id, SUM(c.amt) AS total, MAX(c.created_at) AS last_charge
    FROM charges c WHERE c.amt > 0 GROUP BY c.customer_id
  ),
  collected AS (
    SELECT cp.customer_id, SUM(cp.amount) AS total, MAX(cp.created_at) AS last_payment
    FROM public.customer_payments cp
    WHERE cp.company_id = p_company_id AND cp.status = 'active'
    GROUP BY cp.customer_id
  )
  SELECT cu.id, cu.name,
         COALESCE(ch.total, 0)::NUMERIC(14, 2),
         COALESCE(co.total, 0)::NUMERIC(14, 2),
         (COALESCE(ch.total, 0) - COALESCE(co.total, 0))::NUMERIC(14, 2),
         GREATEST(ch.last_charge, co.last_payment),
         (SELECT MIN(c.created_at) FROM charges c
          WHERE c.customer_id = cu.id AND c.amt > 0 AND c.cum > COALESCE(co.total, 0))
  FROM public.customers cu
  LEFT JOIN charged ch ON ch.customer_id = cu.id
  LEFT JOIN collected co ON co.customer_id = cu.id
  WHERE cu.company_id = p_company_id AND (ch.total IS NOT NULL OR co.total IS NOT NULL);
$$;

REVOKE ALL ON FUNCTION private.customer_balance_rows(UUID) FROM PUBLIC, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 5. VENTAS: nuevo medio de pago cuenta_corriente (exige cliente)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.process_sale(
  p_company_id UUID,
  p_idempotency_key UUID,
  p_items JSONB,
  p_discount NUMERIC DEFAULT 0.00,
  p_payments JSONB DEFAULT '[]'::jsonb,
  p_notes TEXT DEFAULT NULL,
  p_customer_id UUID DEFAULT NULL
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
      'discount', v_discount,
      'items', p_items,
      'payments', COALESCE(p_payments, '[]'::jsonb),
      'notes', COALESCE(p_notes, '')
    );
  END IF;

  v_request_hash := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(v_canonical_json::text, 'UTF8')),
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
  SELECT pg_catalog.array_agg((x.value->>'product_id')::UUID)
  INTO v_sorted_product_ids
  FROM pg_catalog.jsonb_array_elements(p_items) AS x;

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
  ) <> v_num_items THEN
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

  -- 6. Cálculo del Subtotal con Precios Autoritativos de PostgreSQL
  FOR v_item IN
    SELECT (x.value->>'product_id')::UUID AS product_id,
           (x.value->>'quantity')::NUMERIC AS quantity
    FROM pg_catalog.jsonb_array_elements(p_items) AS x
  LOOP
    IF v_item.quantity IS NULL OR v_item.quantity <= 0.00 THEN
      RAISE EXCEPTION 'La cantidad debe ser mayor a 0 para cada producto.';
    END IF;

    SELECT selling_price INTO v_prod.selling_price
    FROM public.products
    WHERE id = v_item.product_id AND company_id = p_company_id;

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
    SELECT (x.value->>'product_id')::UUID AS product_id,
           (x.value->>'quantity')::NUMERIC AS quantity
    FROM pg_catalog.jsonb_array_elements(p_items) AS x
  LOOP
    SELECT selling_price INTO v_prod.selling_price
    FROM public.products
    WHERE id = v_item.product_id AND company_id = p_company_id;

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


-- ----------------------------------------------------------------------------
-- 6. CONSULTAS: saldos y estado de cuenta
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.customer_balances(p_company_id UUID)
RETURNS TABLE (
  customer_id UUID,
  customer_name TEXT,
  charged_total NUMERIC,
  collected_total NUMERIC,
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
  PERFORM private.assert_company_role(p_company_id, NULL);
  RETURN QUERY
    SELECT b.customer_id, b.customer_name, b.charged_total, b.collected_total, b.balance,
           b.last_activity, b.oldest_open_since
    FROM private.customer_balance_rows(p_company_id) b
    ORDER BY b.balance DESC, b.customer_name;
END;
$$;

REVOKE ALL ON FUNCTION public.customer_balances(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_balances(UUID) TO authenticated;

-- Movimientos del cliente: ventas a cuenta corriente (+) y cobros activos (-).
CREATE OR REPLACE FUNCTION public.customer_statement(p_company_id UUID, p_customer_id UUID)
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
  PERFORM private.assert_company_role(p_company_id, NULL);
  IF NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.id = p_customer_id AND c.company_id = p_company_id) THEN
    RAISE EXCEPTION 'Cliente no encontrado en esta empresa.';
  END IF;
  RETURN QUERY
    SELECT m.kind, m.reference_id, m.document, m.occurred_at, m.amount
    FROM (
      SELECT 'sale'::TEXT AS kind, s.id AS reference_id, s.sale_number AS document,
             s.created_at AS occurred_at, private.sale_credit_amount(s.payments) AS amount
      FROM public.sales s
      WHERE s.company_id = p_company_id AND s.customer_id = p_customer_id AND s.status = 'completed'
        AND private.sale_credit_amount(s.payments) > 0
      UNION ALL
      SELECT 'payment'::TEXT, cp.id, 'Cobro', cp.created_at, -cp.amount
      FROM public.customer_payments cp
      WHERE cp.company_id = p_company_id AND cp.customer_id = p_customer_id AND cp.status = 'active'
    ) m
    ORDER BY m.occurred_at, m.reference_id;
END;
$$;

REVOKE ALL ON FUNCTION public.customer_statement(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_statement(UUID, UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. REGISTRAR Y ANULAR COBROS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_customer_payment(
  p_company_id UUID,
  p_customer_id UUID,
  p_payments JSONB,
  p_notes TEXT,
  p_into_cash BOOLEAN,
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
  v_customer_name TEXT;
  v_existing public.customer_payments%ROWTYPE;
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
  PERFORM private.assert_company_role(p_company_id, NULL);

  IF p_payments IS NULL OR pg_catalog.jsonb_typeof(p_payments) <> 'array' OR pg_catalog.jsonb_array_length(p_payments) = 0 THEN
    RAISE EXCEPTION 'Indicá con qué medio de pago se cobra.';
  END IF;
  IF v_notes IS NOT NULL AND pg_catalog.length(v_notes) > 500 THEN
    RAISE EXCEPTION 'La nota no puede superar los 500 caracteres.';
  END IF;

  -- Se bloquea al cliente: dos cobros simultáneos no pueden pasarse del saldo juntos
  SELECT c.name INTO v_customer_name
  FROM public.customers c
  WHERE c.id = p_customer_id AND c.company_id = p_company_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El cliente no existe o no pertenece a esta empresa.';
  END IF;

  SELECT * INTO v_existing
  FROM public.customer_payments cp
  WHERE cp.company_id = p_company_id AND cp.created_by = v_user AND cp.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.customer_id <> p_customer_id THEN
      RAISE EXCEPTION 'Clave de cobro reutilizada con otro cliente.';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'payment_id', v_existing.id, 'balance_after', private.customer_balance(p_company_id, p_customer_id)
    );
  END IF;

  FOR v_pay IN
    SELECT (y.value ->> 'method')::TEXT AS method, (y.value ->> 'amount')::NUMERIC AS amount
    FROM pg_catalog.jsonb_array_elements(p_payments) AS y
  LOOP
    IF v_pay.method IS NULL OR v_pay.method NOT IN ('efectivo', 'transferencia', 'debito', 'credito', 'cheque') THEN
      RAISE EXCEPTION 'Medio de pago inválido para un cobro: %.', COALESCE(v_pay.method, '(vacío)');
    END IF;
    PERFORM private.assert_money(v_pay.amount, 'el importe de cada medio de pago', false);
    v_total := v_total + v_pay.amount;
    IF v_pay.method = 'efectivo' THEN
      v_cash := v_cash + v_pay.amount;
    END IF;
  END LOOP;

  v_balance := private.customer_balance(p_company_id, p_customer_id);
  IF v_total > v_balance THEN
    RAISE EXCEPTION 'El cobro ($ %) supera el saldo del cliente ($ %).', v_total, GREATEST(v_balance, 0);
  END IF;

  IF COALESCE(p_into_cash, false) THEN
    IF v_cash = 0 THEN
      RAISE EXCEPTION 'Solo el efectivo puede ingresar a la caja: este cobro no tiene efectivo.';
    END IF;
    SELECT cs.id INTO v_session_id
    FROM public.cash_sessions cs
    WHERE cs.company_id = p_company_id AND cs.status = 'open';
    IF v_session_id IS NULL THEN
      RAISE EXCEPTION 'No hay una caja abierta: abrila para que el efectivo del cobro ingrese a la caja.';
    END IF;
    v_movement_id := (public.register_cash_movement(
      p_company_id, v_session_id, 'in', v_cash,
      pg_catalog.left('Cobro de cuenta corriente: ' || v_customer_name, 500)
    ) ->> 'movement_id')::UUID;
  END IF;

  INSERT INTO public.customer_payments (
    company_id, customer_id, amount, payments, notes, cash_movement_id, idempotency_key, created_by
  ) VALUES (
    p_company_id, p_customer_id, v_total, p_payments, v_notes, v_movement_id, p_idempotency_key, v_user
  ) RETURNING id INTO v_payment_id;

  RETURN pg_catalog.jsonb_build_object('payment_id', v_payment_id, 'balance_after', v_balance - v_total);
END;
$$;

REVOKE ALL ON FUNCTION public.register_customer_payment(UUID, UUID, JSONB, TEXT, BOOLEAN, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_customer_payment(UUID, UUID, JSONB, TEXT, BOOLEAN, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.void_customer_payment(
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
  v_payment public.customer_payments%ROWTYPE;
  v_session_id UUID;
  v_out_id UUID;
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
  FROM public.customer_payments cp
  WHERE cp.id = p_payment_id AND cp.company_id = p_company_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cobro no encontrado en esta empresa.';
  END IF;
  IF v_payment.status = 'voided' THEN
    RAISE EXCEPTION 'Este cobro ya está anulado.';
  END IF;

  IF v_payment.cash_movement_id IS NOT NULL THEN
    SELECT COALESCE(SUM((pay.value ->> 'amount')::NUMERIC), 0) INTO v_cash
    FROM pg_catalog.jsonb_array_elements(v_payment.payments) AS pay(value)
    WHERE pay.value ->> 'method' = 'efectivo';

    SELECT cs.id INTO v_session_id
    FROM public.cash_sessions cs
    WHERE cs.company_id = p_company_id AND cs.status = 'open';
    IF v_session_id IS NULL THEN
      RAISE EXCEPTION 'El efectivo de este cobro ingresó a la caja: abrí la caja para anularlo y que el dinero salga.';
    END IF;
    v_out_id := (public.register_cash_movement(
      p_company_id, v_session_id, 'out', v_cash,
      pg_catalog.left('Anulación de cobro de cuenta corriente: ' || v_reason, 500)
    ) ->> 'movement_id')::UUID;
  END IF;

  UPDATE public.customer_payments
  SET status = 'voided', voided_at = now(), voided_by = auth.uid(), void_reason = v_reason,
      void_cash_movement_id = v_out_id
  WHERE id = p_payment_id;

  RETURN pg_catalog.jsonb_build_object('payment_id', p_payment_id);
END;
$$;

REVOKE ALL ON FUNCTION public.void_customer_payment(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_customer_payment(UUID, UUID, TEXT) TO authenticated;


-- ----------------------------------------------------------------------------
-- 8. RESUMEN FINANCIERO: cobrado real, ventas a cuenta corriente y saldo a cobrar
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
    'receivable_total', v_receivable
  );
END;
$$;

COMMENT ON FUNCTION public.financial_summary(UUID, DATE, DATE) IS
  'Resumen financiero del período (ventas, costo, compras, cobros por medio de pago y valor del inventario). Solo master_admin.';


REVOKE ALL ON FUNCTION public.financial_summary(UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.financial_summary(UUID, DATE, DATE) TO authenticated;
