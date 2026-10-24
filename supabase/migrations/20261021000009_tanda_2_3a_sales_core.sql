-- ============================================================================
-- MIGRACIÓN OFICIAL: TANDA 2.3A - NÚCLEO DE VENTAS E INTEGRACIÓN POS
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
-- Base de datos: PostgreSQL 17 / Supabase
-- Tablas: sales, sale_items
-- Relaciones: stock_movements.reference_sale_id (FK compuesta)
-- Funciones / RPCs: public.process_sale(UUID, UUID, JSONB, NUMERIC, JSONB, TEXT)
-- Seguridad: RLS forzado, Privilegios mínimos (REVOKE directo a PostgREST),
--            RPC SECURITY DEFINER con search_path = '' y validación en private.*
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TABLAS DEL NÚCLEO DE VENTAS
-- ----------------------------------------------------------------------------

-- 1.1. public.sales: Cabecera inmutable de venta
CREATE TABLE IF NOT EXISTS public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  sale_number TEXT NOT NULL,
  customer_id UUID,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'cancelled')),
  subtotal NUMERIC(14, 2) NOT NULL CHECK (subtotal >= 0.00),
  discount NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (discount >= 0.00),
  total_amount NUMERIC(14, 2) NOT NULL CHECK (total_amount >= 0.00),
  payments JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (pg_catalog.jsonb_typeof(payments) = 'array'),
  notes TEXT,
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  cancel_reason TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT uq_sales_company_id UNIQUE (company_id, id),
  CONSTRAINT uq_sales_company_number UNIQUE (company_id, sale_number),
  CONSTRAINT chk_sales_discount_limit CHECK (discount <= subtotal),
  CONSTRAINT chk_sales_total_match CHECK (total_amount = (subtotal - discount))
);

COMMENT ON TABLE public.sales IS 'Cabecera de ventas multiempresa con numeración correlativa interna inmutable.';

-- 1.2. public.sale_items: Detalle histórico inmutable de ítems vendidos
CREATE TABLE IF NOT EXISTS public.sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  sale_id UUID NOT NULL,
  product_id UUID NOT NULL,
  quantity NUMERIC(12, 2) NOT NULL CHECK (quantity > 0.00 AND scale(quantity) <= 2),
  unit_price NUMERIC(14, 2) NOT NULL CHECK (unit_price >= 0.00 AND scale(unit_price) <= 2),
  subtotal NUMERIC(14, 2) NOT NULL CHECK (subtotal >= 0.00 AND scale(subtotal) <= 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT uq_sale_items_company_id UNIQUE (company_id, id),
  CONSTRAINT fk_sale_items_sale FOREIGN KEY (company_id, sale_id)
    REFERENCES public.sales(company_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_sale_items_product FOREIGN KEY (company_id, product_id)
    REFERENCES public.products(company_id, id) ON DELETE RESTRICT
);

COMMENT ON TABLE public.sale_items IS 'Líneas de venta históricas con precios congelados e integridad multiempresa.';

-- ----------------------------------------------------------------------------
-- 2. INTEGRIDAD REFERENCIAL COMPUESTA HACIA stock_movements
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conname = 'fk_stock_movements_sale'
      AND conrelid = 'public.stock_movements'::regclass
  ) THEN
    ALTER TABLE public.stock_movements
      ADD CONSTRAINT fk_stock_movements_sale
      FOREIGN KEY (company_id, reference_sale_id)
      REFERENCES public.sales(company_id, id) ON DELETE RESTRICT;
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. ÍNDICES MULTIEMPRESA
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_sales_company_created_at
  ON public.sales(company_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_sales_company_status
  ON public.sales(company_id, status);

CREATE INDEX IF NOT EXISTS idx_sales_company_created_by
  ON public.sales(company_id, created_by);

CREATE INDEX IF NOT EXISTS idx_sale_items_company_sale
  ON public.sale_items(company_id, sale_id);

CREATE INDEX IF NOT EXISTS idx_sale_items_company_product
  ON public.sale_items(company_id, product_id);

-- ----------------------------------------------------------------------------
-- 4. INMUTABILIDAD CONTABLE: PROTECCIÓN ANTE MUTACIONES DIRECTAS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE TRIGGER tr_sales_prevent_mutation
  BEFORE UPDATE OR DELETE ON public.sales
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_immutable_modification();

CREATE OR REPLACE TRIGGER tr_sale_items_prevent_mutation
  BEFORE UPDATE OR DELETE ON public.sale_items
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_immutable_modification();

-- ----------------------------------------------------------------------------
-- 5. SEGURIDAD: ROW LEVEL SECURITY Y REVOCACIÓN DE PERMISOS
-- ----------------------------------------------------------------------------
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales FORCE ROW LEVEL SECURITY;

ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items FORCE ROW LEVEL SECURITY;

-- 5.1. Políticas RLS: Solo lectura para miembros autorizados de la empresa
DROP POLICY IF EXISTS "sales_select_member" ON public.sales;
CREATE POLICY "sales_select_member" ON public.sales
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT private.my_accessible_company_ids()));

DROP POLICY IF EXISTS "sale_items_select_member" ON public.sale_items;
CREATE POLICY "sale_items_select_member" ON public.sale_items
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT private.my_accessible_company_ids()));

-- 5.2. Revocar todo acceso de mutación directa
REVOKE ALL ON public.sales FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.sale_items FROM PUBLIC, anon, authenticated;

-- 5.3. Concesión exclusiva de SELECT a authenticated
GRANT SELECT ON public.sales TO authenticated;
GRANT SELECT ON public.sale_items TO authenticated;

-- ----------------------------------------------------------------------------
-- 6. RPC TRANSACCIONAL AUTORITATIVA: public.process_sale
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_sale(
  p_company_id UUID,
  p_idempotency_key UUID,
  p_items JSONB,
  p_discount NUMERIC DEFAULT 0.00,
  p_payments JSONB DEFAULT '[]'::jsonb,
  p_notes TEXT DEFAULT NULL
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

  -- 4. Idempotencia: Cálculo de Hash Canónico de la Petición
  v_canonical_json := pg_catalog.jsonb_build_object(
    'company_id', p_company_id,
    'discount', v_discount,
    'items', p_items,
    'payments', COALESCE(p_payments, '[]'::jsonb),
    'notes', COALESCE(p_notes, '')
  );
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
  --      Previene deadlocks con ajustes manuales y compras
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

        IF v_payment.method NOT IN ('efectivo', 'transferencia', 'debito', 'credito', 'cheque', 'courtesy') THEN
          RAISE EXCEPTION 'Medio de pago inválido: %.', v_payment.method;
        END IF;

        v_total_payments := v_total_payments + v_payment.amount;
      END LOOP;

      IF v_total_payments <> v_total_amount THEN
        RAISE EXCEPTION 'La suma de los pagos (% ARS) no coincide con el total de la venta (% ARS).', v_total_payments, v_total_amount;
      END IF;
    ELSE
      -- Si no se suministró desglose de pagos para una venta con importe > 0
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

  -- 9. Inserción de la Cabecera de Venta
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
    NULL,
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

    -- 10.2. Registro en stock_movements (dispara sync_product_stock para descontar stock)
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
-- 7. CONCESIÓN DE PRIVILEGIOS DE EJECUCIÓN SOBRE LA RPC
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.process_sale(UUID, UUID, JSONB, NUMERIC, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_sale(UUID, UUID, JSONB, NUMERIC, JSONB, TEXT) TO authenticated;
