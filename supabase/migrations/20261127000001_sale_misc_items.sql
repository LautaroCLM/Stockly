-- ============================================================================
-- Stockly: "artículo varios" en la venta
-- ============================================================================
-- Permite vender algo que no está en el catálogo (un corte, un servicio, un
-- tornillo suelto) con descripción y precio escritos en el momento.
--   * sale_items.product_id pasa a ser opcional y se agrega description.
--   * process_sale acepta líneas {description, unit_price, quantity} sin
--     product_id: suman a la venta, al ticket y a la caja, sin tocar stock.
--   * cancel_sale repone stock solo de las líneas con producto.
-- ============================================================================

ALTER TABLE public.sale_items ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS description TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_sale_items_product_or_description') THEN
    ALTER TABLE public.sale_items ADD CONSTRAINT chk_sale_items_product_or_description
      CHECK (product_id IS NOT NULL OR (description IS NOT NULL AND pg_catalog.length(description) BETWEEN 1 AND 120));
  END IF;
END;
$$;

COMMENT ON COLUMN public.sale_items.description IS 'Descripción del artículo varios (líneas sin producto del catálogo).';

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

CREATE OR REPLACE FUNCTION public.cancel_sale(p_company_id uuid, p_sale_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_reason TEXT;
  v_sale RECORD;
  v_item RECORD;
  v_movement_id UUID;
  v_now TIMESTAMPTZ := pg_catalog.now();
BEGIN
  v_reason := private.prepare_document_cancellation(p_company_id, p_sale_id, p_reason, 'anular_ventas');

  SELECT id, sale_number, status, cancelled_at, total_amount INTO v_sale
  FROM public.sales
  WHERE id = p_sale_id AND company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venta no encontrada en esta empresa.';
  END IF;

  -- Reintento de una anulación ya confirmada: sin efectos
  IF v_sale.status = 'cancelled' THEN
    RETURN pg_catalog.jsonb_build_object(
      'sale_id', v_sale.id, 'sale_number', v_sale.sale_number, 'status', 'cancelled',
      'cancelled_at', v_sale.cancelled_at, 'already_cancelled', true
    );
  END IF;

  -- Bloqueo canónico de productos antes de insertar movimientos
  PERFORM 1
  FROM public.products p
  WHERE p.company_id = p_company_id
    AND p.id IN (SELECT si.product_id FROM public.sale_items si WHERE si.sale_id = p_sale_id AND si.company_id = p_company_id)
  ORDER BY p.id
  FOR UPDATE;

  -- Reposición de stock al costo congelado de la venta original
  FOR v_item IN
    SELECT si.product_id, si.quantity, COALESCE(mc.unit_cost, 0.00) AS unit_cost
    FROM public.sale_items si
    LEFT JOIN public.stock_movements sm
      ON sm.company_id = si.company_id AND sm.reference_sale_id = si.sale_id
     AND sm.product_id = si.product_id AND sm.reason = 'sale'
    LEFT JOIN public.movement_costs mc
      ON mc.company_id = sm.company_id AND mc.movement_id = sm.id
    WHERE si.sale_id = p_sale_id AND si.company_id = p_company_id
      AND si.product_id IS NOT NULL -- los artículos varios no tienen stock
    ORDER BY si.product_id
  LOOP
    INSERT INTO public.stock_movements (
      company_id, product_id, direction, reason, quantity, reference_sale_id, reference_doc, notes, created_by
    ) VALUES (
      p_company_id, v_item.product_id, 'increase', 'cancellation', v_item.quantity, p_sale_id,
      v_sale.sale_number, 'Anulación ' || v_sale.sale_number, v_user_id
    ) RETURNING id INTO v_movement_id;

    INSERT INTO public.movement_costs (company_id, movement_id, unit_cost, total_cost)
    VALUES (p_company_id, v_movement_id, v_item.unit_cost, pg_catalog.round(v_item.unit_cost * v_item.quantity, 2));
  END LOOP;

  UPDATE public.sales
  SET status = 'cancelled', cancelled_at = v_now, cancelled_by = v_user_id, cancel_reason = v_reason
  WHERE id = p_sale_id AND company_id = p_company_id;

  INSERT INTO public.audit_log (
    company_id, table_name, record_id, action, old_data, new_data, performed_by, actor_role
  ) VALUES (
    p_company_id, 'sales', p_sale_id::TEXT, 'UPDATE',
    pg_catalog.jsonb_build_object('status', 'completed'),
    pg_catalog.jsonb_build_object('status', 'cancelled', 'reason', v_reason, 'total_amount', v_sale.total_amount),
    v_user_id, 'master_admin'
  );

  RETURN pg_catalog.jsonb_build_object(
    'sale_id', p_sale_id, 'sale_number', v_sale.sale_number, 'status', 'cancelled',
    'cancelled_at', v_now, 'already_cancelled', false
  );
END;
$function$;
