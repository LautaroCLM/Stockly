-- ============================================================================
-- MIGRACIÓN INCREMENTAL: FECHA DE COMPRA EN HORA LOCAL DE LA EMPRESA (Hallazgo H-15)
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
-- Problema: process_purchase usaba CURRENT_DATE (fecha del servidor, en UTC) cuando no
--           recibía fecha, y la columna purchases.purchase_date tenía el mismo default.
--           En Argentina (UTC-3), una compra cargada después de las 21:00 quedaba con
--           la fecha del día siguiente.
-- Solución:
--   1. process_purchase toma "hoy" en la zona horaria de la empresa y rechaza fechas
--      posteriores a ese día. El resto de la función queda idéntico a la Tanda 2.4A.
--   2. purchases.purchase_date deja de tener default: solo se carga mediante la RPC,
--      que siempre informa la fecha.
-- ============================================================================

ALTER TABLE public.purchases ALTER COLUMN purchase_date DROP DEFAULT;

CREATE OR REPLACE FUNCTION public.process_purchase(
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
  v_user_id UUID := auth.uid();
  v_company_active BOOLEAN;
  v_supplier_active BOOLEAN;
  v_num_items INT;
  v_canonical_json JSONB;
  v_request_hash TEXT;
  v_rec RECORD;
  v_attempts INT := 0;
  v_sorted_product_ids UUID[];
  v_item RECORD;
  v_prod RECORD;
  v_subtotal NUMERIC(14, 2) := 0.00;
  v_total_amount NUMERIC(14, 2) := 0.00;
  v_next_counter BIGINT;
  v_purchase_number TEXT;
  v_purchase_id UUID;
  v_movement_id UUID;
  v_effective_date DATE;
  v_timezone TEXT;
  v_local_today DATE;
  v_clean_invoice TEXT;
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

  IF p_supplier_id IS NULL THEN
    RAISE EXCEPTION 'El identificador de proveedor (p_supplier_id) es obligatorio.';
  END IF;

  IF p_items IS NULL OR pg_catalog.jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'El detalle de la compra (p_items) debe ser un arreglo JSON válido.';
  END IF;

  v_num_items := pg_catalog.jsonb_array_length(p_items);
  IF v_num_items = 0 THEN
    RAISE EXCEPTION 'El detalle de compra no puede estar vacío.';
  END IF;

  -- 2. Validación de Rol: Exclusivo para master_admin activo
  PERFORM private.assert_company_role(p_company_id, 'master_admin');

  -- 2.1. Bloqueo de Empresa (FOR NO KEY UPDATE) para serializar contra desactivación concurrente
  SELECT is_active, timezone INTO v_company_active, v_timezone
  FROM public.companies
  WHERE id = p_company_id
  FOR NO KEY UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Empresa con ID % no encontrada.', p_company_id;
  END IF;

  IF NOT v_company_active THEN
    RAISE EXCEPTION 'La empresa se encuentra inactiva. No se admiten compras.';
  END IF;

  -- 2.2. Revalidar rol tras adquirir el bloqueo de empresa (anti-TOCTOU)
  PERFORM private.assert_company_role(p_company_id, 'master_admin');

  -- 3. Validación de Proveedor (debe pertenecer a la empresa y estar activo)
  SELECT is_active INTO v_supplier_active
  FROM public.suppliers
  WHERE id = p_supplier_id AND company_id = p_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El proveedor especificado no existe o no pertenece a esta empresa.'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT v_supplier_active THEN
    RAISE EXCEPTION 'No se pueden registrar compras a un proveedor inactivo.'
      USING ERRCODE = 'P0001';
  END IF;

  -- 4. Normalización de campos de texto y fecha
  -- Fecha local de la empresa (no la del servidor en UTC)
  v_local_today := (pg_catalog.now() AT TIME ZONE v_timezone)::DATE;
  v_effective_date := COALESCE(p_purchase_date, v_local_today);

  IF v_effective_date > v_local_today THEN
    RAISE EXCEPTION 'La fecha de la compra (%) no puede ser posterior a hoy (%).', v_effective_date, v_local_today;
  END IF;
  v_clean_invoice := NULLIF(pg_catalog.btrim(p_invoice_number), '');

  IF v_clean_invoice IS NOT NULL AND pg_catalog.length(v_clean_invoice) > 100 THEN
    RAISE EXCEPTION 'El número de comprobante o factura no puede superar los 100 caracteres.';
  END IF;

  IF p_notes IS NOT NULL AND pg_catalog.length(p_notes) > 1000 THEN
    RAISE EXCEPTION 'Las observaciones no pueden superar los 1000 caracteres.';
  END IF;

  -- 5. Idempotencia: Cálculo de Hash Canónico de la Petición
  v_canonical_json := pg_catalog.jsonb_build_object(
    'company_id', p_company_id,
    'supplier_id', p_supplier_id,
    'invoice_number', COALESCE(v_clean_invoice, ''),
    'purchase_date', v_effective_date,
    'items', p_items,
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
      RAISE EXCEPTION 'Fallo de concurrencia al procesar la clave de idempotencia de la compra.';
    END IF;

    SELECT id, request_hash, response_payload, expires_at INTO v_rec
    FROM public.operation_idempotency
    WHERE company_id = p_company_id
      AND created_by = v_user_id
      AND operation_type = 'purchase'
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
        RAISE EXCEPTION 'Idempotency key mismatch: clave de compra reutilizada con distintos parámetros.';
      END IF;

      IF v_rec.response_payload IS NULL THEN
        RAISE EXCEPTION 'Estado inconsistente de idempotencia: compra previa en procesamiento inconcluso.';
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
        'purchase',
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

  -- 6. Validación de Ítems de Compra y Detección de Duplicados
  SELECT pg_catalog.array_agg((x.value->>'product_id')::UUID)
  INTO v_sorted_product_ids
  FROM pg_catalog.jsonb_array_elements(p_items) AS x;

  IF (SELECT pg_catalog.count(*) FROM pg_catalog.unnest(v_sorted_product_ids)) <>
     (SELECT pg_catalog.count(DISTINCT x) FROM pg_catalog.unnest(v_sorted_product_ids) x) THEN
    RAISE EXCEPTION 'Existen productos duplicados en el detalle de la compra.';
  END IF;

  -- 6.1. Bloqueo determinístico canónico de productos (ORDER BY id ASC FOR UPDATE)
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

  -- 6.2. Validación individual de cada ítem (producto activo, cantidades, costos y unidades indivisibles)
  FOR v_item IN
    SELECT (x.value->>'product_id')::UUID AS product_id,
           (x.value->>'quantity')::NUMERIC AS quantity,
           (x.value->>'unit_cost')::NUMERIC AS unit_cost
    FROM pg_catalog.jsonb_array_elements(p_items) AS x
  LOOP
    IF v_item.quantity IS NULL OR v_item.quantity <= 0.00 THEN
      RAISE EXCEPTION 'La cantidad debe ser mayor a 0 para cada producto de la compra.';
    END IF;

    IF pg_catalog.scale(v_item.quantity) > 2 THEN
      RAISE EXCEPTION 'La cantidad no puede tener más de 2 decimales.';
    END IF;

    IF v_item.unit_cost IS NULL OR v_item.unit_cost < 0.00 THEN
      RAISE EXCEPTION 'El costo unitario no puede ser negativo.';
    END IF;

    IF pg_catalog.scale(v_item.unit_cost) > 2 THEN
      RAISE EXCEPTION 'El costo unitario no puede tener más de 2 decimales.';
    END IF;

    SELECT id, name, unit, is_active INTO v_prod
    FROM public.products
    WHERE id = v_item.product_id AND company_id = p_company_id;

    IF NOT v_prod.is_active THEN
      RAISE EXCEPTION 'El producto "%" está inactivo y no puede ser comprado.', v_prod.name;
    END IF;

    -- Validación de indivisibilidad de unidades continuas vs enteras
    IF v_prod.unit IN ('unidad', 'bulto', 'par') AND v_item.quantity <> pg_catalog.round(v_item.quantity, 0) THEN
      RAISE EXCEPTION 'La unidad % es indivisible y no admite cantidades fraccionarias: %', v_prod.unit, v_item.quantity;
    END IF;

    v_subtotal := v_subtotal + pg_catalog.round(v_item.quantity * v_item.unit_cost, 2);
  END LOOP;

  v_total_amount := v_subtotal;

  -- 7. Numeración Correlativa Interna Segura (company_counters FOR UPDATE)
  SELECT last_value + 1 INTO v_next_counter
  FROM public.company_counters
  WHERE company_id = p_company_id AND kind = 'purchase'
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.company_counters (company_id, kind, last_value)
    VALUES (p_company_id, 'purchase', 1)
    ON CONFLICT (company_id, kind) DO UPDATE
      SET last_value = public.company_counters.last_value + 1,
          updated_at = pg_catalog.now()
    RETURNING last_value INTO v_next_counter;
  ELSE
    UPDATE public.company_counters
    SET last_value = v_next_counter,
        updated_at = pg_catalog.now()
    WHERE company_id = p_company_id AND kind = 'purchase';
  END IF;

  v_purchase_number := 'COM-' || pg_catalog.lpad(v_next_counter::text, 8, '0');

  -- 8. Inserción de la Cabecera de Compra
  INSERT INTO public.purchases (
    company_id,
    purchase_number,
    supplier_id,
    invoice_number,
    purchase_date,
    status,
    subtotal,
    total_amount,
    notes,
    created_by,
    created_at
  ) VALUES (
    p_company_id,
    v_purchase_number,
    p_supplier_id,
    v_clean_invoice,
    v_effective_date,
    'completed',
    v_subtotal,
    v_total_amount,
    p_notes,
    v_user_id,
    pg_catalog.now()
  ) RETURNING id INTO v_purchase_id;

  -- 9. Inserción de Líneas de Compra, Movimientos, Costos Congelados y Actualización de Reposición
  FOR v_item IN
    SELECT (x.value->>'product_id')::UUID AS product_id,
           (x.value->>'quantity')::NUMERIC AS quantity,
           (x.value->>'unit_cost')::NUMERIC AS unit_cost
    FROM pg_catalog.jsonb_array_elements(p_items) AS x
  LOOP
    -- 9.1. Registro en purchase_items (detalle histórico)
    INSERT INTO public.purchase_items (
      company_id,
      purchase_id,
      product_id,
      quantity,
      unit_cost,
      subtotal
    ) VALUES (
      p_company_id,
      v_purchase_id,
      v_item.product_id,
      v_item.quantity,
      v_item.unit_cost,
      pg_catalog.round(v_item.quantity * v_item.unit_cost, 2)
    );

    -- 9.2. Registro en stock_movements (aumenta stock atómicamente mediante sync_product_stock)
    INSERT INTO public.stock_movements (
      company_id,
      product_id,
      direction,
      reason,
      quantity,
      reference_purchase_id,
      reference_doc,
      notes,
      created_by
    ) VALUES (
      p_company_id,
      v_item.product_id,
      'increase',
      'purchase',
      v_item.quantity,
      v_purchase_id,
      COALESCE(v_clean_invoice, v_purchase_number),
      'Compra ' || v_purchase_number,
      v_user_id
    ) RETURNING id INTO v_movement_id;

    -- 9.3. Congelar costo histórico en movement_costs
    INSERT INTO public.movement_costs (
      company_id,
      movement_id,
      unit_cost,
      total_cost
    ) VALUES (
      p_company_id,
      v_movement_id,
      v_item.unit_cost,
      pg_catalog.round(v_item.unit_cost * v_item.quantity, 2)
    );

    -- 9.4. Actualizar costo de reposición actual en product_costs
    INSERT INTO public.product_costs (
      company_id,
      product_id,
      cost_price,
      updated_at,
      updated_by
    ) VALUES (
      p_company_id,
      v_item.product_id,
      v_item.unit_cost,
      pg_catalog.now(),
      v_user_id
    )
    ON CONFLICT (company_id, product_id) DO UPDATE
      SET cost_price = EXCLUDED.cost_price,
          updated_at = EXCLUDED.updated_at,
          updated_by = EXCLUDED.updated_by;
  END LOOP;

  -- 10. Registro en auditoría inmutable
  INSERT INTO public.audit_log (
    company_id,
    table_name,
    record_id,
    action,
    new_data,
    performed_by,
    actor_role
  ) VALUES (
    p_company_id,
    'purchases',
    v_purchase_id::text,
    'INSERT',
    pg_catalog.jsonb_build_object(
      'purchase_number', v_purchase_number,
      'supplier_id', p_supplier_id,
      'invoice_number', v_clean_invoice,
      'purchase_date', v_effective_date,
      'total_amount', v_total_amount,
      'items_count', v_num_items
    ),
    v_user_id,
    'master_admin'
  );

  -- 11. Generar Payload de Respuesta y Asentar en operation_idempotency
  v_response_payload := pg_catalog.jsonb_build_object(
    'success', true,
    'purchase_id', v_purchase_id,
    'purchase_number', v_purchase_number,
    'company_id', p_company_id,
    'supplier_id', p_supplier_id,
    'invoice_number', v_clean_invoice,
    'purchase_date', v_effective_date,
    'subtotal', v_subtotal,
    'total_amount', v_total_amount,
    'status', 'completed',
    'created_at', pg_catalog.now()
  );

  UPDATE public.operation_idempotency
  SET response_payload = v_response_payload,
      updated_at = pg_catalog.now()
  WHERE company_id = p_company_id
    AND created_by = v_user_id
    AND operation_type = 'purchase'
    AND idempotency_key = p_idempotency_key;

  RETURN v_response_payload;
END;
$$;

COMMENT ON FUNCTION public.process_purchase(UUID, UUID, UUID, JSONB, TEXT, DATE, TEXT) IS
  'Procesa transaccionalmente una compra a proveedor, validando proveedor activo, incrementando stock atómicamente mediante stock_movements, congelando costos históricos en movement_costs y purchase_items, actualizando product_costs y registrando comprobante idempotente. Exclusivo master_admin.';

-- ----------------------------------------------------------------------------
-- 7. PRIVILEGIOS MÍNIMOS DE EJECUCIÓN
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.process_purchase(UUID, UUID, UUID, JSONB, TEXT, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_purchase(UUID, UUID, UUID, JSONB, TEXT, DATE, TEXT) TO authenticated;
