-- ============================================================================
-- MIGRACIÓN OFICIAL: TANDA 2.2B (MIGRACIÓN 3) - IDEMPOTENCIA POR USUARIO Y TTL 24H
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
-- Base de datos: PostgreSQL 17 / Supabase
-- Alcance atómico en un único corte transaccional:
--   1. Incorporación de expires_at TIMESTAMPTZ NOT NULL en public.operation_idempotency
--      con backfill coherente (created_at + interval '24 hours') y DEFAULT a 24h.
--   2. Verificación de integridad de created_by y reemplazo atómico de la
--      restricción única uq_operation_idempotency por
--      UNIQUE (company_id, created_by, operation_type, idempotency_key).
--   3. Actualización conjunta de public.register_stock_adjustment y
--      public.import_initial_stock para aislar claves por usuario (auth.uid())
--      y reemplazar transaccionalmente claves vencidas (expires_at <= now()).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EVOLUCIÓN DE ESQUEMA EN public.operation_idempotency
-- ----------------------------------------------------------------------------

-- 1.1. Comprobación defensiva: verificar que no existan filas con created_by nulo
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.operation_idempotency WHERE created_by IS NULL) THEN
    RAISE EXCEPTION 'Inconsistencia en public.operation_idempotency: existen registros con created_by NULL.';
  END IF;
END;
$$;

-- 1.2. Incorporar columna expires_at, poblar filas existentes con created_at + 24h y fijar NOT NULL + DEFAULT
ALTER TABLE public.operation_idempotency
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

UPDATE public.operation_idempotency
SET expires_at = created_at + interval '24 hours'
WHERE expires_at IS NULL;

ALTER TABLE public.operation_idempotency
  ALTER COLUMN expires_at SET DEFAULT (pg_catalog.now() + interval '24 hours'),
  ALTER COLUMN expires_at SET NOT NULL;

COMMENT ON COLUMN public.operation_idempotency.expires_at IS
  'Fecha y hora de expiración de la clave de idempotencia (24 horas desde created_at).';

-- 1.3. Reemplazar restricción única e índice de búsqueda para incluir created_by
ALTER TABLE public.operation_idempotency
  DROP CONSTRAINT IF EXISTS uq_operation_idempotency;

ALTER TABLE public.operation_idempotency
  ADD CONSTRAINT uq_operation_idempotency
  UNIQUE (company_id, created_by, operation_type, idempotency_key);

DROP INDEX IF EXISTS public.idx_operation_idempotency_lookup;

CREATE INDEX idx_operation_idempotency_lookup
  ON public.operation_idempotency (company_id, created_by, operation_type, idempotency_key);

-- ----------------------------------------------------------------------------
-- 2. ACTUALIZACIÓN DE RPC: public.register_stock_adjustment
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_stock_adjustment(
  p_company_id UUID,
  p_idempotency_key UUID,
  p_product_id UUID,
  p_direction TEXT,
  p_reason TEXT,
  p_quantity NUMERIC,
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
  v_canonical_json JSONB;
  v_request_hash TEXT;
  v_attempts INT := 0;
  v_rec RECORD;
  v_unit_cost NUMERIC;
  v_total_cost NUMERIC;
  v_new_movement_id UUID;
  v_movement RECORD;
  v_response_payload JSONB;
BEGIN
  -- 1. Validación de Autenticación y Autorización de Tenant
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;

  IF p_company_id IS NULL OR p_idempotency_key IS NULL OR p_product_id IS NULL OR
     p_direction IS NULL OR p_reason IS NULL OR p_quantity IS NULL THEN
    RAISE EXCEPTION 'Parámetros obligatorios incompletos para el ajuste de stock.';
  END IF;

  PERFORM private.assert_company_role(p_company_id, 'master_admin');

  -- 2. Validación de Parámetros de Negocio
  IF p_direction NOT IN ('increase', 'decrease') THEN
    RAISE EXCEPTION 'Dirección inválida: %. Debe ser increase o decrease.', p_direction;
  END IF;

  IF p_reason NOT IN ('physical_count', 'loss_damage', 'internal_use') THEN
    RAISE EXCEPTION 'Motivo no autorizado para ajuste manual: %. Motivos permitidos: physical_count, loss_damage, internal_use.', p_reason;
  END IF;

  IF (p_direction = 'increase' AND p_reason NOT IN ('physical_count')) OR
     (p_direction = 'decrease' AND p_reason NOT IN ('physical_count', 'loss_damage', 'internal_use')) THEN
    RAISE EXCEPTION 'Incoherencia entre dirección % y motivo %.', p_direction, p_reason;
  END IF;

  IF pg_catalog.scale(p_quantity) > 2 THEN
    RAISE EXCEPTION 'La cantidad excede los 2 decimales permitidos: %', p_quantity;
  END IF;

  IF p_quantity <= 0 OR p_quantity > 999999999.99 THEN
    RAISE EXCEPTION 'Cantidad fuera de rango permitido (0 < cantidad <= 999.999.999,99): %', p_quantity;
  END IF;

  -- 3. Construcción del Hash Canónico Estructurado
  v_canonical_json := pg_catalog.jsonb_build_object(
    'company_id', p_company_id,
    'operation_type', 'stock_adjustment',
    'product_id', p_product_id,
    'direction', p_direction,
    'reason', p_reason,
    'quantity', pg_catalog.to_char(p_quantity, 'FM999999999990.00'),
    'notes', NULLIF(pg_catalog.btrim(p_notes), ''),
    'reference_doc', NULLIF(pg_catalog.btrim(p_reference_doc), '')
  );

  v_request_hash := pg_catalog.encode(
    extensions.digest(v_canonical_json::TEXT, 'sha256'),
    'hex'
  );

  -- 4. Bucle Acotado de Adquisición de Candado de Idempotencia (con alcance por created_by y TTL 24h)
  LOOP
    v_attempts := v_attempts + 1;
    IF v_attempts > 3 THEN
      RAISE EXCEPTION 'No se pudo adquirir el candado de idempotencia tras 3 reintentos por contención concurrente.';
    END IF;

    INSERT INTO public.operation_idempotency (
      company_id,
      operation_type,
      idempotency_key,
      request_hash,
      response_payload,
      created_by,
      created_at,
      updated_at,
      expires_at
    ) VALUES (
      p_company_id,
      'stock_adjustment',
      p_idempotency_key,
      v_request_hash,
      NULL,
      v_user_id,
      pg_catalog.now(),
      pg_catalog.now(),
      pg_catalog.now() + interval '24 hours'
    )
    ON CONFLICT (company_id, created_by, operation_type, idempotency_key) DO NOTHING;

    IF FOUND THEN
      EXIT; -- Candado adquirido por esta transacción
    END IF;

    -- Espera pesimista de resolución de la otra transacción para el mismo (company_id, created_by, operation_type, idempotency_key)
    SELECT id, request_hash, response_payload, expires_at INTO v_rec
    FROM public.operation_idempotency
    WHERE company_id = p_company_id
      AND created_by = v_user_id
      AND operation_type = 'stock_adjustment'
      AND idempotency_key = p_idempotency_key
    FOR UPDATE;

    IF FOUND THEN
      -- Si el registro previo venció (TTL <= now()), se purga bajo el bloqueo FOR UPDATE y se reintenta la inserción limpia
      IF v_rec.expires_at <= pg_catalog.now() THEN
        DELETE FROM public.operation_idempotency
        WHERE id = v_rec.id;
        CONTINUE;
      END IF;

      IF v_rec.request_hash != v_request_hash THEN
        RAISE EXCEPTION 'Idempotency key mismatch: clave reutilizada con distintos parámetros.';
      END IF;

      IF v_rec.response_payload IS NULL THEN
        RAISE EXCEPTION 'Estado inconsistente de idempotencia: operación previa confirmada sin payload.';
      END IF;

      RETURN v_rec.response_payload; -- Replay exitoso sin repetir efectos
    END IF;

    -- Si NOT FOUND: la otra transacción hizo ROLLBACK; el bucle itera y toma el candado limpio
  END LOOP;

  -- 5. Obtener Costo Vigente de Reposición
  SELECT cost_price INTO v_unit_cost
  FROM public.product_costs
  WHERE company_id = p_company_id AND product_id = p_product_id;

  v_unit_cost := COALESCE(v_unit_cost, 0.00);
  v_total_cost := pg_catalog.round(p_quantity * v_unit_cost, 2);

  IF v_total_cost > 9999999999999999999999.99 THEN
    RAISE EXCEPTION 'El costo total resultante excede el rango representable: %', v_total_cost;
  END IF;

  -- 6. Insertar Movimiento Físico (El trigger tr_sync_stock_movements actualiza el stock)
  INSERT INTO public.stock_movements (
    company_id, product_id, direction, reason, quantity, notes, reference_doc, created_by
  ) VALUES (
    p_company_id, p_product_id, p_direction, p_reason, p_quantity,
    NULLIF(pg_catalog.btrim(p_notes), ''), NULLIF(pg_catalog.btrim(p_reference_doc), ''), v_user_id
  ) RETURNING id INTO v_new_movement_id;

  -- 7. Congelar Costo Histórico
  INSERT INTO public.movement_costs (
    company_id, movement_id, unit_cost, total_cost
  ) VALUES (
    p_company_id, v_new_movement_id, v_unit_cost, v_total_cost
  );

  -- 8. Obtener saldos definitivos calculados por el trigger
  SELECT previous_stock, new_stock INTO v_movement
  FROM public.stock_movements
  WHERE id = v_new_movement_id;

  -- 9. Confirmar Payload Final de Idempotencia y Retornar
  v_response_payload := pg_catalog.jsonb_build_object(
    'movement_id', v_new_movement_id,
    'product_id', p_product_id,
    'direction', p_direction,
    'reason', p_reason,
    'quantity', p_quantity,
    'previous_stock', v_movement.previous_stock,
    'new_stock', v_movement.new_stock,
    'unit_cost', v_unit_cost,
    'total_cost', v_total_cost,
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

COMMENT ON FUNCTION public.register_stock_adjustment(UUID, UUID, UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT) IS
  'Ajuste manual atómico e idempotente de inventario (con alcance por usuario y TTL de 24h). Exclusivo master_admin.';

REVOKE ALL ON FUNCTION public.register_stock_adjustment(UUID, UUID, UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_stock_adjustment(UUID, UUID, UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. ACTUALIZACIÓN DE RPC: public.import_initial_stock
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.import_initial_stock(
  p_company_id UUID,
  p_idempotency_key UUID,
  p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_request_hash TEXT;
  v_attempts INT := 0;
  v_rec RECORD;
  v_item RECORD;
  v_product_id UUID;
  v_qty NUMERIC;
  v_cost NUMERIC;
  v_total_cost NUMERIC;
  v_item_count INT;
  v_unique_count INT;
  v_product_ids UUID[];
  v_prod RECORD;
  v_new_movement_id UUID;
  v_response_payload JSONB;
  v_result_movements JSONB := '[]'::JSONB;
BEGIN
  -- 1. Validación de Autenticación y Autorización
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;

  IF p_company_id IS NULL OR p_idempotency_key IS NULL OR p_items IS NULL THEN
    RAISE EXCEPTION 'Parámetros obligatorios incompletos para la carga inicial.';
  END IF;

  PERFORM private.assert_company_role(p_company_id, 'master_admin');

  -- 2. Validación de Estructura de Array del Lote
  IF pg_catalog.jsonb_typeof(p_items) != 'array' THEN
    RAISE EXCEPTION 'El parámetro p_items debe ser un array JSONB.';
  END IF;

  v_item_count := pg_catalog.jsonb_array_length(p_items);
  IF v_item_count = 0 THEN
    RAISE EXCEPTION 'El lote de carga inicial no puede estar vacío.';
  END IF;

  -- 3. Parseo, Validación Tipada Estricta y Detección de Duplicados
  FOR v_item IN SELECT * FROM pg_catalog.jsonb_array_elements(p_items) LOOP
    IF (v_item.value->>'product_id') IS NULL OR
       (v_item.value->>'product_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'Identificador de producto inválido o nulo en el lote: %', (v_item.value->>'product_id');
    END IF;

    IF (v_item.value->>'quantity') IS NULL THEN
      RAISE EXCEPTION 'Cantidad nula para el producto % en el lote.', (v_item.value->>'product_id');
    END IF;

    BEGIN
      v_qty := (v_item.value->>'quantity')::NUMERIC;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Cantidad no numérica para el producto %.', (v_item.value->>'product_id');
    END;

    IF pg_catalog.scale(v_qty) > 2 THEN
      RAISE EXCEPTION 'La cantidad excede 2 decimales para el producto %: %', (v_item.value->>'product_id'), v_qty;
    END IF;

    IF v_qty <= 0 OR v_qty > 999999999.99 THEN
      RAISE EXCEPTION 'Cantidad fuera de rango (0 < cantidad <= 999.999.999,99) para el producto %: %', (v_item.value->>'product_id'), v_qty;
    END IF;

    IF (v_item.value->>'unit_cost') IS NULL THEN
      RAISE EXCEPTION 'Costo unitario nulo para el producto % en el lote.', (v_item.value->>'product_id');
    END IF;

    BEGIN
      v_cost := (v_item.value->>'unit_cost')::NUMERIC;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Costo unitario no numérico para el producto %.', (v_item.value->>'product_id');
    END;

    IF pg_catalog.scale(v_cost) > 2 THEN
      RAISE EXCEPTION 'El costo unitario excede 2 decimales para el producto %: %', (v_item.value->>'product_id'), v_cost;
    END IF;

    IF v_cost < 0 OR v_cost > 999999999999.99 THEN
      RAISE EXCEPTION 'Costo fuera de rango (0 <= costo <= 999.999.999.999,99) para el producto %: %', (v_item.value->>'product_id'), v_cost;
    END IF;

    v_product_ids := pg_catalog.array_append(v_product_ids, (v_item.value->>'product_id')::UUID);
  END LOOP;

  SELECT count(DISTINCT pid) INTO v_unique_count FROM unnest(v_product_ids) AS pid;
  IF v_unique_count != v_item_count THEN
    RAISE EXCEPTION 'El lote contiene productos duplicados (mismo product_id repetido).';
  END IF;

  -- 4. Construcción del Hash Canónico del Lote (Ordenado Determinísticamente por UUID)
  SELECT pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'company_id', p_company_id,
          'operation_type', 'initial_load',
          'items', (
            SELECT pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'product_id', (item->>'product_id')::UUID,
                'quantity', pg_catalog.to_char((item->>'quantity')::NUMERIC, 'FM999999999990.00'),
                'unit_cost', pg_catalog.to_char((item->>'unit_cost')::NUMERIC, 'FM999999999990.00')
              )
              ORDER BY (item->>'product_id')::UUID ASC
            )
            FROM pg_catalog.jsonb_array_elements(p_items) AS item
          )
        )::TEXT,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ) INTO v_request_hash;

  -- 5. Bucle de Idempotencia Acotado (con alcance por created_by y TTL 24h)
  LOOP
    v_attempts := v_attempts + 1;
    IF v_attempts > 3 THEN
      RAISE EXCEPTION 'No se pudo adquirir el candado de idempotencia tras 3 reintentos por contención concurrente.';
    END IF;

    INSERT INTO public.operation_idempotency (
      company_id,
      operation_type,
      idempotency_key,
      request_hash,
      response_payload,
      created_by,
      created_at,
      updated_at,
      expires_at
    ) VALUES (
      p_company_id,
      'initial_load',
      p_idempotency_key,
      v_request_hash,
      NULL,
      v_user_id,
      pg_catalog.now(),
      pg_catalog.now(),
      pg_catalog.now() + interval '24 hours'
    )
    ON CONFLICT (company_id, created_by, operation_type, idempotency_key) DO NOTHING;

    IF FOUND THEN
      EXIT;
    END IF;

    SELECT id, request_hash, response_payload, expires_at INTO v_rec
    FROM public.operation_idempotency
    WHERE company_id = p_company_id
      AND created_by = v_user_id
      AND operation_type = 'initial_load'
      AND idempotency_key = p_idempotency_key
    FOR UPDATE;

    IF FOUND THEN
      -- Si el registro previo venció (TTL <= now()), se purga bajo el bloqueo FOR UPDATE y se reintenta la inserción limpia
      IF v_rec.expires_at <= pg_catalog.now() THEN
        DELETE FROM public.operation_idempotency
        WHERE id = v_rec.id;
        CONTINUE;
      END IF;

      IF v_rec.request_hash != v_request_hash THEN
        RAISE EXCEPTION 'Idempotency key mismatch: clave de carga inicial reutilizada con distintos parámetros.';
      END IF;

      IF v_rec.response_payload IS NULL THEN
        RAISE EXCEPTION 'Estado inconsistente de idempotencia: carga inicial previa confirmada sin payload.';
      END IF;

      RETURN v_rec.response_payload;
    END IF;
  END LOOP;

  -- 6. Bloqueo Pesimista en Orden Canónico Ascendente de Todos los Productos del Lote
  PERFORM id FROM public.products
  WHERE company_id = p_company_id AND id = ANY(v_product_ids)
  ORDER BY id ASC
  FOR UPDATE;

  -- 7. Validación de Pertenencia y Regla de Stock Inicial Cero sin Movimientos Previos
  FOR v_product_id IN SELECT unnest(v_product_ids) LOOP
    SELECT id, current_stock INTO v_prod
    FROM public.products
    WHERE company_id = p_company_id AND id = v_product_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Producto % no encontrado o no pertenece a la empresa %.', v_product_id, p_company_id;
    END IF;

    IF v_prod.current_stock != 0 THEN
      RAISE EXCEPTION 'El producto % ya posee existencias registradas (%). La carga inicial solo admite productos con stock cero.',
        v_product_id, v_prod.current_stock;
    END IF;

    IF EXISTS (SELECT 1 FROM public.stock_movements WHERE company_id = p_company_id AND product_id = v_product_id) THEN
      RAISE EXCEPTION 'El producto % ya posee movimientos históricos registrados. Utilice ajustes manuales para modificar existencias.', v_product_id;
    END IF;
  END LOOP;

  -- 8. Aplicación Atómica de la Carga Inicial para Cada Ítem
  FOR v_item IN SELECT * FROM pg_catalog.jsonb_array_elements(p_items) LOOP
    v_product_id := (v_item.value->>'product_id')::UUID;
    v_qty := (v_item.value->>'quantity')::NUMERIC;
    v_cost := (v_item.value->>'unit_cost')::NUMERIC;
    v_total_cost := pg_catalog.round(v_qty * v_cost, 2);

    INSERT INTO public.product_costs (
      company_id, product_id, cost_price, updated_by
    ) VALUES (
      p_company_id, v_product_id, v_cost, v_user_id
    )
    ON CONFLICT (company_id, product_id) DO UPDATE
      SET cost_price = EXCLUDED.cost_price,
          updated_by = EXCLUDED.updated_by,
          updated_at = pg_catalog.now();

    INSERT INTO public.stock_movements (
      company_id, product_id, direction, reason, quantity, notes, reference_doc, created_by
    ) VALUES (
      p_company_id, v_product_id, 'increase', 'initial_load', v_qty,
      'Carga inicial de inventario', 'INICIAL', v_user_id
    ) RETURNING id INTO v_new_movement_id;

    INSERT INTO public.movement_costs (
      company_id, movement_id, unit_cost, total_cost
    ) VALUES (
      p_company_id, v_new_movement_id, v_cost, v_total_cost
    );

    v_result_movements := v_result_movements || pg_catalog.jsonb_build_object(
      'product_id', v_product_id,
      'movement_id', v_new_movement_id,
      'quantity', v_qty,
      'unit_cost', v_cost,
      'total_cost', v_total_cost
    );
  END LOOP;

  -- 9. Confirmar Payload Final de Idempotencia y Retornar
  v_response_payload := pg_catalog.jsonb_build_object(
    'company_id', p_company_id,
    'operation_type', 'initial_load',
    'items_count', v_item_count,
    'movements', v_result_movements,
    'created_at', pg_catalog.now()
  );

  UPDATE public.operation_idempotency
  SET response_payload = v_response_payload,
      updated_at = pg_catalog.now()
  WHERE company_id = p_company_id
    AND created_by = v_user_id
    AND operation_type = 'initial_load'
    AND idempotency_key = p_idempotency_key;

  RETURN v_response_payload;
END;
$$;

COMMENT ON FUNCTION public.import_initial_stock(UUID, UUID, JSONB) IS
  'Carga inicial masiva atómica e idempotente (con alcance por usuario y TTL de 24h) para productos nuevos sin movimientos previos. Exclusivo master_admin.';

REVOKE ALL ON FUNCTION public.import_initial_stock(UUID, UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_initial_stock(UUID, UUID, JSONB) TO authenticated;
