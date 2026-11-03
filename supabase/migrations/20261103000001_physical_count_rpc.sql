-- ============================================================================
-- MIGRACIÓN INCREMENTAL: CONTEO FÍSICO CON VALOR ABSOLUTO (Hallazgo H-05)
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
-- Problema: el frontend calculaba la diferencia del conteo contra un stock en caché.
--           Si entre la carga de la pantalla y el envío hubo una venta, el stock
--           final quedaba distinto del valor contado.
-- Solución: public.register_physical_count recibe la cantidad contada y calcula la
--           diferencia bajo bloqueo del producto, contra el stock vigente.
-- Orden de bloqueos (igual que register_stock_adjustment):
--   companies (FOR NO KEY UPDATE) -> operation_idempotency -> products (FOR UPDATE)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.register_physical_count(
  p_company_id UUID,
  p_idempotency_key UUID,
  p_product_id UUID,
  p_counted_quantity NUMERIC,
  p_notes TEXT DEFAULT NULL,
  p_reference_doc TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_company_active BOOLEAN;
  v_clean_notes TEXT := NULLIF(pg_catalog.btrim(p_notes), '');
  v_clean_ref TEXT := NULLIF(pg_catalog.btrim(p_reference_doc), '');
  v_canonical_json JSONB;
  v_request_hash TEXT;
  v_attempts INT := 0;
  v_rec RECORD;
  v_current_stock NUMERIC(12, 2);
  v_unit TEXT;
  v_delta NUMERIC(12, 2);
  v_direction TEXT;
  v_unit_cost NUMERIC;
  v_total_cost NUMERIC;
  v_movement_id UUID;
  v_response_payload JSONB;
BEGIN
  -- 1. Autenticación, parámetros y autorización con bloqueo de empresa
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;

  IF p_company_id IS NULL OR p_idempotency_key IS NULL OR p_product_id IS NULL OR p_counted_quantity IS NULL THEN
    RAISE EXCEPTION 'Parámetros obligatorios incompletos para el conteo físico.';
  END IF;

  PERFORM private.assert_company_role(p_company_id, 'master_admin');

  SELECT is_active INTO v_company_active
  FROM public.companies
  WHERE id = p_company_id
  FOR NO KEY UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Empresa con ID % no encontrada.', p_company_id;
  END IF;

  IF NOT v_company_active THEN
    RAISE EXCEPTION 'La empresa se encuentra inactiva. No se admiten operaciones.';
  END IF;

  -- Revalidación tras el bloqueo: una baja concurrente confirmada se detecta aquí
  PERFORM private.assert_company_role(p_company_id, 'master_admin');

  -- 2. Validación del valor contado
  IF pg_catalog.scale(p_counted_quantity) > 2 THEN
    RAISE EXCEPTION 'La cantidad contada excede los 2 decimales permitidos: %', p_counted_quantity;
  END IF;

  IF p_counted_quantity < 0 OR p_counted_quantity > 999999999.99 THEN
    RAISE EXCEPTION 'Cantidad contada fuera de rango permitido (0 <= cantidad <= 999.999.999,99): %', p_counted_quantity;
  END IF;

  -- 3. Hash canónico de la petición
  v_canonical_json := pg_catalog.jsonb_build_object(
    'company_id', p_company_id,
    'operation_type', 'physical_count',
    'product_id', p_product_id,
    'counted_quantity', pg_catalog.to_char(p_counted_quantity, 'FM999999999990.00'),
    'notes', v_clean_notes,
    'reference_doc', v_clean_ref
  );

  v_request_hash := pg_catalog.encode(
    extensions.digest(v_canonical_json::TEXT, 'sha256'),
    'hex'
  );

  -- 4. Candado de idempotencia (alcance por created_by, TTL 24 h)
  LOOP
    v_attempts := v_attempts + 1;
    IF v_attempts > 3 THEN
      RAISE EXCEPTION 'No se pudo adquirir el candado de idempotencia tras 3 reintentos por contención concurrente.';
    END IF;

    INSERT INTO public.operation_idempotency (
      company_id, operation_type, idempotency_key, request_hash, response_payload,
      created_by, created_at, updated_at, expires_at
    ) VALUES (
      p_company_id, 'stock_adjustment', p_idempotency_key, v_request_hash, NULL,
      v_user_id, pg_catalog.now(), pg_catalog.now(), pg_catalog.now() + interval '24 hours'
    )
    ON CONFLICT (company_id, created_by, operation_type, idempotency_key) DO NOTHING;

    IF FOUND THEN
      EXIT;
    END IF;

    SELECT id, request_hash, response_payload, expires_at INTO v_rec
    FROM public.operation_idempotency
    WHERE company_id = p_company_id
      AND created_by = v_user_id
      AND operation_type = 'stock_adjustment'
      AND idempotency_key = p_idempotency_key
    FOR UPDATE;

    IF FOUND THEN
      IF v_rec.expires_at <= pg_catalog.now() THEN
        DELETE FROM public.operation_idempotency WHERE id = v_rec.id;
        CONTINUE;
      END IF;

      IF v_rec.request_hash != v_request_hash THEN
        RAISE EXCEPTION 'Idempotency key mismatch: clave reutilizada con distintos parámetros.';
      END IF;

      IF v_rec.response_payload IS NULL THEN
        RAISE EXCEPTION 'Estado inconsistente de idempotencia: operación previa confirmada sin payload.';
      END IF;

      RETURN v_rec.response_payload;
    END IF;
  END LOOP;

  -- 5. Bloqueo del producto y diferencia contra el stock vigente
  SELECT current_stock, unit INTO v_current_stock, v_unit
  FROM public.products
  WHERE company_id = p_company_id AND id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto % no encontrado en la empresa.', p_product_id;
  END IF;

  IF v_unit IN ('unidad', 'bulto', 'par') AND p_counted_quantity != pg_catalog.round(p_counted_quantity, 0) THEN
    RAISE EXCEPTION 'La unidad % es indivisible y no admite cantidades fraccionarias: %', v_unit, p_counted_quantity;
  END IF;

  v_delta := p_counted_quantity - v_current_stock;

  IF v_delta <> 0 THEN
    v_direction := CASE WHEN v_delta > 0 THEN 'increase' ELSE 'decrease' END;

    SELECT cost_price INTO v_unit_cost
    FROM public.product_costs
    WHERE company_id = p_company_id AND product_id = p_product_id;

    v_unit_cost := COALESCE(v_unit_cost, 0.00);
    v_total_cost := pg_catalog.round(pg_catalog.abs(v_delta) * v_unit_cost, 2);

    -- El trigger tr_sync_stock_movements recalcula saldos y actualiza products.current_stock
    INSERT INTO public.stock_movements (
      company_id, product_id, direction, reason, quantity, notes, reference_doc, created_by
    ) VALUES (
      p_company_id, p_product_id, v_direction, 'physical_count', pg_catalog.abs(v_delta),
      v_clean_notes, v_clean_ref, v_user_id
    ) RETURNING id INTO v_movement_id;

    INSERT INTO public.movement_costs (company_id, movement_id, unit_cost, total_cost)
    VALUES (p_company_id, v_movement_id, v_unit_cost, v_total_cost);
  END IF;

  -- 6. Payload final (sin movimiento cuando el conteo coincide con el stock vigente)
  v_response_payload := pg_catalog.jsonb_build_object(
    'movement_id', v_movement_id,
    'product_id', p_product_id,
    'counted_quantity', p_counted_quantity,
    'direction', v_direction,
    'quantity', pg_catalog.abs(v_delta),
    'previous_stock', v_current_stock,
    'new_stock', p_counted_quantity,
    'no_change', v_delta = 0,
    'created_at', pg_catalog.now()
  );

  UPDATE public.operation_idempotency
  SET response_payload = v_response_payload,
      updated_at = pg_catalog.now()
  WHERE company_id = p_company_id
    AND created_by = v_user_id
    AND operation_type = 'stock_adjustment'
    AND idempotency_key = p_idempotency_key;

  RETURN v_response_payload;
END;
$$;

COMMENT ON FUNCTION public.register_physical_count(UUID, UUID, UUID, NUMERIC, TEXT, TEXT) IS
  'Registra un conteo físico con valor absoluto: calcula la diferencia contra el stock vigente bajo bloqueo del producto. Idempotente. Exclusivo master_admin.';

REVOKE ALL ON FUNCTION public.register_physical_count(UUID, UUID, UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_physical_count(UUID, UUID, UUID, NUMERIC, TEXT, TEXT) TO authenticated;
