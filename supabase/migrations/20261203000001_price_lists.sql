-- ============================================================================
-- MIGRACIÓN: LISTAS DE PRECIOS
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
--
-- Cada lista es un porcentaje sobre el precio de venta, con redondeo, y admite un precio
-- fijo por producto (excepción). La lista se elige por cliente; el Master Admin puede
-- cambiarla en una venta puntual. La base calcula el precio cobrado (process_sale), como
-- hasta ahora: el precio que manda la pantalla para productos del catálogo no se usa.
-- Acceso: crear y editar listas con el módulo 'precios'; los precios los ve todo el equipo.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TABLAS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.price_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (name = pg_catalog.btrim(name) AND pg_catalog.length(name) BETWEEN 1 AND 60),
  adjustment_percent NUMERIC(6, 2) NOT NULL CHECK (adjustment_percent BETWEEN -90 AND 1000),
  rounding_step NUMERIC(6, 2) NOT NULL DEFAULT 0.01 CHECK (rounding_step IN (0.01, 1, 10, 50, 100)),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_price_lists_company_id UNIQUE (company_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_price_lists_name ON public.price_lists (company_id, pg_catalog.lower(name));

CREATE TABLE IF NOT EXISTS public.price_list_items (
  company_id UUID NOT NULL,
  price_list_id UUID NOT NULL,
  product_id UUID NOT NULL,
  price NUMERIC(14, 2) NOT NULL CHECK (price >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (price_list_id, product_id),
  CONSTRAINT fk_price_list_items_list FOREIGN KEY (company_id, price_list_id) REFERENCES public.price_lists(company_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_price_list_items_product FOREIGN KEY (company_id, product_id) REFERENCES public.products(company_id, id) ON DELETE RESTRICT
);

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS price_list_id UUID;
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS fk_customers_price_list;
ALTER TABLE public.customers ADD CONSTRAINT fk_customers_price_list FOREIGN KEY (company_id, price_list_id)
  REFERENCES public.price_lists(company_id, id) ON DELETE RESTRICT;

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS price_list_id UUID;
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS fk_sales_price_list;
ALTER TABLE public.sales ADD CONSTRAINT fk_sales_price_list FOREIGN KEY (company_id, price_list_id)
  REFERENCES public.price_lists(company_id, id) ON DELETE RESTRICT;

DROP TRIGGER IF EXISTS tr_audit_price_lists ON public.price_lists;
CREATE TRIGGER tr_audit_price_lists AFTER INSERT OR UPDATE OR DELETE ON public.price_lists
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger('id');

ALTER TABLE public.price_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_lists FORCE ROW LEVEL SECURITY;
ALTER TABLE public.price_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_list_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "price_lists_select" ON public.price_lists;
CREATE POLICY "price_lists_select" ON public.price_lists FOR SELECT TO authenticated
  USING (company_id IN (SELECT private.my_accessible_company_ids()));
DROP POLICY IF EXISTS "price_list_items_select" ON public.price_list_items;
CREATE POLICY "price_list_items_select" ON public.price_list_items FOR SELECT TO authenticated
  USING (company_id IN (SELECT private.my_accessible_company_ids()));
REVOKE ALL ON public.price_lists, public.price_list_items FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.price_lists, public.price_list_items TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. PRECIO DE UN PRODUCTO EN UNA LISTA (única regla, la usan la venta y la pantalla)
--    Lista NULL o inactiva = precio de venta. Mismo redondeo que el cambio masivo de precios.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.price_for(p_company_id UUID, p_price_list_id UUID, p_product_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN l.id IS NULL THEN p.selling_price
    ELSE COALESCE(i.price, pg_catalog.round(p.selling_price * (100 + l.adjustment_percent) / 100 / l.rounding_step) * l.rounding_step)
  END::NUMERIC(14, 2)
  FROM public.products p
  LEFT JOIN public.price_lists l ON l.id = p_price_list_id AND l.company_id = p.company_id AND l.is_active
  LEFT JOIN public.price_list_items i ON i.price_list_id = l.id AND i.product_id = p.id
  WHERE p.id = p_product_id AND p.company_id = p_company_id;
$$;
REVOKE ALL ON FUNCTION private.price_for(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;

-- Precios de todo el catálogo en una lista (para el carrito y la pantalla de listas)
CREATE OR REPLACE FUNCTION public.price_list_prices(p_company_id UUID, p_price_list_id UUID)
RETURNS TABLE (product_id UUID, price NUMERIC, is_fixed BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id, private.price_for(p_company_id, p_price_list_id, p.id),
    EXISTS (SELECT 1 FROM public.price_list_items i WHERE i.price_list_id = p_price_list_id AND i.product_id = p.id)
  FROM public.products p
  WHERE p.company_id = p_company_id AND p_company_id IN (SELECT private.my_accessible_company_ids());
$$;
REVOKE ALL ON FUNCTION public.price_list_prices(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.price_list_prices(UUID, UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. ALTA, EDICIÓN Y EXCEPCIONES (módulo 'precios')
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_price_list(
  p_company_id UUID, p_price_list_id UUID, p_name TEXT, p_adjustment_percent NUMERIC, p_rounding_step NUMERIC, p_is_active BOOLEAN
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
  PERFORM private.assert_module_access(p_company_id, ARRAY['precios'], 'operate');
  IF v_name = '' OR pg_catalog.length(v_name) > 60 THEN
    RAISE EXCEPTION 'El nombre de la lista es obligatorio y no puede superar 60 caracteres.';
  END IF;
  IF p_adjustment_percent IS NULL OR p_adjustment_percent < -90 OR p_adjustment_percent > 1000 OR pg_catalog.scale(p_adjustment_percent) > 2 THEN
    RAISE EXCEPTION 'El porcentaje debe estar entre -90 %% y 1000 %%.';
  END IF;
  IF p_rounding_step IS NULL OR p_rounding_step NOT IN (0.01, 1, 10, 50, 100) THEN
    RAISE EXCEPTION 'Redondeo inválido.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.price_lists WHERE company_id = p_company_id AND pg_catalog.lower(name) = pg_catalog.lower(v_name)
             AND id IS DISTINCT FROM p_price_list_id) THEN
    RAISE EXCEPTION 'Ya existe una lista con ese nombre.';
  END IF;

  IF p_price_list_id IS NULL THEN
    INSERT INTO public.price_lists (company_id, name, adjustment_percent, rounding_step, is_active, created_by)
    VALUES (p_company_id, v_name, p_adjustment_percent, p_rounding_step, COALESCE(p_is_active, true), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.price_lists SET name = v_name, adjustment_percent = p_adjustment_percent, rounding_step = p_rounding_step,
      is_active = COALESCE(p_is_active, true), updated_at = now()
    WHERE id = p_price_list_id AND company_id = p_company_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Lista no encontrada.'; END IF;
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.save_price_list(UUID, UUID, TEXT, NUMERIC, NUMERIC, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_price_list(UUID, UUID, TEXT, NUMERIC, NUMERIC, BOOLEAN) TO authenticated;

-- Precio fijo de un producto en la lista; NULL quita la excepción (vuelve al porcentaje)
CREATE OR REPLACE FUNCTION public.set_price_list_item(p_company_id UUID, p_price_list_id UUID, p_product_id UUID, p_price NUMERIC)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.assert_module_access(p_company_id, ARRAY['precios'], 'operate');
  IF NOT EXISTS (SELECT 1 FROM public.price_lists WHERE id = p_price_list_id AND company_id = p_company_id) THEN
    RAISE EXCEPTION 'Lista no encontrada.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_product_id AND company_id = p_company_id) THEN
    RAISE EXCEPTION 'Producto no encontrado.';
  END IF;
  IF p_price IS NULL THEN
    DELETE FROM public.price_list_items WHERE price_list_id = p_price_list_id AND product_id = p_product_id;
    RETURN;
  END IF;
  IF p_price < 0 OR pg_catalog.scale(p_price) > 2 OR p_price > 999999999999.99 THEN
    RAISE EXCEPTION 'El precio no puede ser negativo ni tener más de 2 decimales.';
  END IF;
  INSERT INTO public.price_list_items (company_id, price_list_id, product_id, price)
  VALUES (p_company_id, p_price_list_id, p_product_id, p_price)
  ON CONFLICT (price_list_id, product_id) DO UPDATE SET price = EXCLUDED.price, updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.set_price_list_item(UUID, UUID, UUID, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_price_list_item(UUID, UUID, UUID, NUMERIC) TO authenticated;

-- Lista del cliente (módulo 'clientes'); NULL = precio normal
CREATE OR REPLACE FUNCTION public.set_customer_price_list(p_company_id UUID, p_customer_id UUID, p_price_list_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.assert_module_access(p_company_id, ARRAY['clientes'], 'operate');
  IF p_price_list_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.price_lists WHERE id = p_price_list_id AND company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Lista no encontrada.';
  END IF;
  UPDATE public.customers SET price_list_id = p_price_list_id, updated_at = now()
  WHERE id = p_customer_id AND company_id = p_company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cliente no encontrado.'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_customer_price_list(UUID, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_customer_price_list(UUID, UUID, UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. VENTA: cobra con la lista del cliente (o la que elija el Master Admin)
--    p_override_price_list = true: se usa p_price_list_id (NULL = precio normal); solo el admin.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.process_sale(UUID, UUID, JSONB, NUMERIC, JSONB, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.process_sale(
  p_company_id UUID,
  p_idempotency_key UUID,
  p_items JSONB,
  p_discount NUMERIC DEFAULT 0.00,
  p_payments JSONB DEFAULT '[]'::jsonb,
  p_notes TEXT DEFAULT NULL,
  p_customer_id UUID DEFAULT NULL,
  p_price_list_id UUID DEFAULT NULL,
  p_override_price_list BOOLEAN DEFAULT false
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
      ELSE pg_catalog.jsonb_build_object('price_list_id', v_list) END)::text, 'UTF8')),
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

REVOKE ALL ON FUNCTION public.process_sale(UUID, UUID, JSONB, NUMERIC, JSONB, TEXT, UUID, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_sale(UUID, UUID, JSONB, NUMERIC, JSONB, TEXT, UUID, UUID, BOOLEAN) TO authenticated;
