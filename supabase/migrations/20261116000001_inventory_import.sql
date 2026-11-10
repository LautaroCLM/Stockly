-- ============================================================================
-- MIGRACIÓN: IMPORTACIÓN DE INVENTARIO DESDE EXCEL
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
--
-- public.import_inventory: crea productos nuevos y actualiza o suma stock a los existentes,
-- en una sola operación atómica (todo o nada) e idempotente.
--   * Cada fila identifica al producto por SKU o por nombre (p_options.match_by).
--   * Solo se tocan los campos que vienen en la fila: lo que el usuario no mapeó en el
--     Excel no se modifica. Una fila sin 'stock' no mueve existencias.
--   * Stock: se SUMA al que ya hay (milanesa 20 + 4 = 24) y queda registrado como un
--     movimiento de entrada con motivo 'import', visible en el historial. Los productos
--     nuevos arrancan en 0 y reciben el stock del archivo.
--   * Si el producto ya existe: on_existing = 'update' (aplica los campos y suma stock),
--     'skip' (lo ignora por completo) o 'error' (aborta toda la importación).
--   * Categorías por nombre: las que no existen se crean si create_categories es true;
--     si no, la fila falla.
--   * El costo de cada entrada de stock es el costo importado o, si no viene, el vigente.
--   * Exige operar el módulo productos (el administrador siempre puede).
-- ============================================================================

-- Nuevo motivo de movimiento: importación
ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS chk_stock_movements_reason;
ALTER TABLE public.stock_movements ADD CONSTRAINT chk_stock_movements_reason CHECK (
  reason IN ('initial_load', 'purchase', 'physical_count', 'loss_damage', 'internal_use', 'sale', 'cancellation', 'purchase_cancellation', 'import')
);
ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS chk_stock_movements_dir_reason;
ALTER TABLE public.stock_movements ADD CONSTRAINT chk_stock_movements_dir_reason CHECK (
  (direction = 'increase' AND reason IN ('initial_load', 'purchase', 'physical_count', 'cancellation', 'import')) OR
  (direction = 'decrease' AND reason IN ('sale', 'loss_damage', 'internal_use', 'physical_count', 'purchase_cancellation'))
);

-- Nuevo tipo de operación idempotente
ALTER TABLE public.operation_idempotency DROP CONSTRAINT IF EXISTS chk_idempotency_op_type;
ALTER TABLE public.operation_idempotency ADD CONSTRAINT chk_idempotency_op_type CHECK (
  operation_type IN ('stock_adjustment', 'initial_load', 'sale', 'purchase', 'inventory_import')
);

CREATE OR REPLACE FUNCTION public.import_inventory(
  p_company_id UUID,
  p_idempotency_key UUID,
  p_rows JSONB,
  p_options JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_company_active BOOLEAN;
  v_match_by TEXT;
  v_on_existing TEXT;
  v_create_categories BOOLEAN;
  v_request_hash TEXT;
  v_attempts INT := 0;
  v_rec RECORD;
  v_row_count INT;
  v_row JSONB;
  v_n INT := 0;
  v_label TEXT;
  v_sku TEXT;
  v_name TEXT;
  v_key TEXT;
  v_barcode TEXT;
  v_desc TEXT;
  v_unit TEXT;
  v_price NUMERIC;
  v_cost NUMERIC;
  v_min NUMERIC;
  v_stock NUMERIC;
  v_category_name TEXT;
  v_category_id UUID;
  v_existing public.products%ROWTYPE;
  v_matches INT;
  v_effective_unit TEXT;
  v_effective_min NUMERIC;
  v_effective_cost NUMERIC;
  v_new_id UUID;
  v_movement_id UUID;
  v_seen_keys TEXT[] := ARRAY[]::TEXT[];
  v_ids UUID[] := ARRAY[]::UUID[];
  v_created INT := 0;
  v_updated INT := 0;
  v_skipped INT := 0;
  v_with_stock INT := 0;
  v_categories_created INT := 0;
  v_response JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  IF p_company_id IS NULL OR p_idempotency_key IS NULL OR p_rows IS NULL OR p_options IS NULL THEN
    RAISE EXCEPTION 'Parámetros obligatorios incompletos para la importación.';
  END IF;

  PERFORM private.assert_module_access(p_company_id, ARRAY['productos'], 'operate');

  -- Opciones
  IF pg_catalog.jsonb_typeof(p_options) <> 'object' THEN
    RAISE EXCEPTION 'Las opciones de importación deben ser un objeto.';
  END IF;
  v_match_by := COALESCE(p_options ->> 'match_by', 'sku');
  v_on_existing := COALESCE(p_options ->> 'on_existing', 'update');
  v_create_categories := COALESCE((p_options ->> 'create_categories')::BOOLEAN, false);
  IF v_match_by NOT IN ('sku', 'name') THEN
    RAISE EXCEPTION 'Criterio de coincidencia inválido: %.', v_match_by;
  END IF;
  IF v_on_existing NOT IN ('update', 'skip', 'error') THEN
    RAISE EXCEPTION 'Opción para productos existentes inválida: %.', v_on_existing;
  END IF;

  -- Filas
  IF pg_catalog.jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'Las filas a importar deben ser un arreglo.';
  END IF;
  v_row_count := pg_catalog.jsonb_array_length(p_rows);
  IF v_row_count = 0 THEN
    RAISE EXCEPTION 'No hay filas para importar.';
  END IF;
  IF v_row_count > 2000 THEN
    RAISE EXCEPTION 'Se pueden importar hasta 2000 productos por vez (el archivo trae %).', v_row_count;
  END IF;

  -- Bloqueo de la empresa y revalidación (anti-TOCTOU)
  SELECT is_active INTO v_company_active FROM public.companies WHERE id = p_company_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Empresa con ID % no encontrada.', p_company_id;
  END IF;
  IF NOT v_company_active THEN
    RAISE EXCEPTION 'La empresa se encuentra inactiva. No se admiten operaciones.';
  END IF;
  PERFORM private.assert_module_access(p_company_id, ARRAY['productos'], 'operate');

  -- Idempotencia: reenviar lo mismo devuelve el resultado guardado
  v_request_hash := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(
      pg_catalog.jsonb_build_object('company_id', p_company_id, 'rows', p_rows, 'options', p_options)::TEXT, 'UTF8'), 'sha256'),
    'hex');

  LOOP
    v_attempts := v_attempts + 1;
    IF v_attempts > 3 THEN
      RAISE EXCEPTION 'No se pudo adquirir el candado de idempotencia tras 3 reintentos por contención concurrente.';
    END IF;

    INSERT INTO public.operation_idempotency (
      company_id, operation_type, idempotency_key, request_hash, response_payload, created_by, created_at, updated_at, expires_at
    ) VALUES (
      p_company_id, 'inventory_import', p_idempotency_key, v_request_hash, NULL, v_user_id,
      pg_catalog.now(), pg_catalog.now(), pg_catalog.now() + interval '24 hours'
    )
    ON CONFLICT (company_id, created_by, operation_type, idempotency_key) DO NOTHING;
    IF FOUND THEN
      EXIT;
    END IF;

    SELECT id, request_hash, response_payload, expires_at INTO v_rec
    FROM public.operation_idempotency
    WHERE company_id = p_company_id AND created_by = v_user_id
      AND operation_type = 'inventory_import' AND idempotency_key = p_idempotency_key
    FOR UPDATE;
    IF FOUND THEN
      IF v_rec.expires_at <= pg_catalog.now() THEN
        DELETE FROM public.operation_idempotency WHERE id = v_rec.id;
        CONTINUE;
      END IF;
      IF v_rec.request_hash <> v_request_hash THEN
        RAISE EXCEPTION 'Idempotency key mismatch: clave de importación reutilizada con distintos parámetros.';
      END IF;
      IF v_rec.response_payload IS NULL THEN
        RAISE EXCEPTION 'Estado inconsistente de idempotencia: importación previa sin resultado.';
      END IF;
      RETURN v_rec.response_payload;
    END IF;
  END LOOP;

  -- Pasada 1: validar el formato de cada fila, detectar duplicados dentro del archivo y
  -- bloquear en orden canónico los productos existentes que se van a tocar.
  FOR v_row IN SELECT value FROM pg_catalog.jsonb_array_elements(p_rows) LOOP
    v_n := v_n + 1;
    IF pg_catalog.jsonb_typeof(v_row) <> 'object' THEN
      RAISE EXCEPTION 'Fila %: formato inválido.', v_n;
    END IF;
    v_label := COALESCE(v_row ->> 'row', v_n::TEXT);

    v_sku := pg_catalog.upper(pg_catalog.btrim(COALESCE(v_row ->> 'sku', '')));
    v_name := pg_catalog.btrim(COALESCE(v_row ->> 'name', ''));
    v_key := CASE WHEN v_match_by = 'sku' THEN v_sku ELSE pg_catalog.lower(v_name) END;
    IF v_key = '' THEN
      RAISE EXCEPTION 'Fila %: falta % para identificar el producto.', v_label, CASE WHEN v_match_by = 'sku' THEN 'el SKU' ELSE 'el nombre' END;
    END IF;
    IF v_key = ANY (v_seen_keys) THEN
      RAISE EXCEPTION 'Fila %: el producto "%" aparece más de una vez en el archivo.', v_label, CASE WHEN v_match_by = 'sku' THEN v_sku ELSE v_name END;
    END IF;
    v_seen_keys := pg_catalog.array_append(v_seen_keys, v_key);

    IF v_match_by = 'sku' THEN
      SELECT p.id INTO v_new_id FROM public.products p
      WHERE p.company_id = p_company_id AND pg_catalog.upper(pg_catalog.btrim(p.sku)) = v_sku;
      v_matches := CASE WHEN v_new_id IS NULL THEN 0 ELSE 1 END;
    ELSE
      SELECT pg_catalog.count(*)::INT, pg_catalog.min(p.id::TEXT)::UUID INTO v_matches, v_new_id
      FROM public.products p
      WHERE p.company_id = p_company_id AND pg_catalog.lower(pg_catalog.btrim(p.name)) = v_key;
      IF v_matches > 1 THEN
        RAISE EXCEPTION 'Fila %: hay % productos llamados "%" en el inventario; usá el SKU para identificarlo.', v_label, v_matches, v_name;
      END IF;
    END IF;
    IF v_matches = 1 THEN
      v_ids := pg_catalog.array_append(v_ids, v_new_id);
    END IF;
  END LOOP;

  PERFORM p.id FROM public.products p
  WHERE p.company_id = p_company_id AND p.id = ANY (v_ids)
  ORDER BY p.id ASC
  FOR UPDATE;

  -- Pasada 2: aplicar
  v_n := 0;
  FOR v_row IN SELECT value FROM pg_catalog.jsonb_array_elements(p_rows) LOOP
    v_n := v_n + 1;
    v_label := COALESCE(v_row ->> 'row', v_n::TEXT);
    v_sku := pg_catalog.upper(pg_catalog.btrim(COALESCE(v_row ->> 'sku', '')));
    v_name := pg_catalog.btrim(COALESCE(v_row ->> 'name', ''));

    -- Valores opcionales: solo cuentan los que vienen en la fila
    v_barcode := NULLIF(pg_catalog.btrim(COALESCE(v_row ->> 'barcode', '')), '');
    v_desc := NULLIF(pg_catalog.btrim(COALESCE(v_row ->> 'description', '')), '');
    v_unit := NULLIF(pg_catalog.lower(pg_catalog.btrim(COALESCE(v_row ->> 'unit', ''))), '');
    v_category_name := NULLIF(pg_catalog.btrim(COALESCE(v_row ->> 'category', '')), '');

    BEGIN
      v_price := NULLIF(pg_catalog.btrim(COALESCE(v_row ->> 'selling_price', '')), '')::NUMERIC;
      v_cost := NULLIF(pg_catalog.btrim(COALESCE(v_row ->> 'cost_price', '')), '')::NUMERIC;
      v_min := NULLIF(pg_catalog.btrim(COALESCE(v_row ->> 'min_stock', '')), '')::NUMERIC;
      v_stock := NULLIF(pg_catalog.btrim(COALESCE(v_row ->> 'stock', '')), '')::NUMERIC;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Fila %: hay un número inválido (precio, costo, stock mínimo o stock).', v_label;
    END;

    IF v_unit IS NOT NULL AND v_unit NOT IN ('unidad', 'kg', 'litro', 'metro', 'bulto', 'par') THEN
      RAISE EXCEPTION 'Fila %: unidad inválida (%). Valores permitidos: unidad, kg, litro, metro, bulto, par.', v_label, v_unit;
    END IF;
    IF v_price IS NOT NULL AND (v_price < 0 OR pg_catalog.scale(v_price) > 2 OR v_price > 999999999999.99) THEN
      RAISE EXCEPTION 'Fila %: el precio de venta no puede ser negativo ni tener más de 2 decimales.', v_label;
    END IF;
    IF v_cost IS NOT NULL AND (v_cost < 0 OR pg_catalog.scale(v_cost) > 2 OR v_cost > 999999999999.99) THEN
      RAISE EXCEPTION 'Fila %: el costo no puede ser negativo ni tener más de 2 decimales.', v_label;
    END IF;
    IF v_min IS NOT NULL AND (v_min < 0 OR pg_catalog.scale(v_min) > 2 OR v_min > 999999999.99) THEN
      RAISE EXCEPTION 'Fila %: el stock mínimo no puede ser negativo ni tener más de 2 decimales.', v_label;
    END IF;
    IF v_stock IS NOT NULL AND (v_stock < 0 OR pg_catalog.scale(v_stock) > 2 OR v_stock > 999999999.99) THEN
      RAISE EXCEPTION 'Fila %: el stock no puede ser negativo ni tener más de 2 decimales.', v_label;
    END IF;
    IF v_barcode IS NOT NULL AND pg_catalog.length(v_barcode) > 50 THEN
      RAISE EXCEPTION 'Fila %: el código de barras no puede superar 50 caracteres.', v_label;
    END IF;
    IF v_name <> '' AND pg_catalog.length(v_name) > 200 THEN
      RAISE EXCEPTION 'Fila %: el nombre no puede superar 200 caracteres.', v_label;
    END IF;

    -- ¿Existe?
    v_existing := NULL;
    IF v_match_by = 'sku' THEN
      SELECT p.* INTO v_existing FROM public.products p
      WHERE p.company_id = p_company_id AND pg_catalog.upper(pg_catalog.btrim(p.sku)) = v_sku;
    ELSE
      SELECT p.* INTO v_existing FROM public.products p
      WHERE p.company_id = p_company_id AND pg_catalog.lower(pg_catalog.btrim(p.name)) = pg_catalog.lower(v_name);
    END IF;

    IF v_existing.id IS NOT NULL THEN
      IF v_on_existing = 'error' THEN
        RAISE EXCEPTION 'Fila %: el producto "%" ya existe en el inventario.', v_label, v_existing.name;
      ELSIF v_on_existing = 'skip' THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;
    END IF;

    -- Categoría por nombre
    v_category_id := NULL;
    IF v_category_name IS NOT NULL THEN
      IF pg_catalog.length(v_category_name) > 100 THEN
        RAISE EXCEPTION 'Fila %: la categoría no puede superar 100 caracteres.', v_label;
      END IF;
      SELECT c.id INTO v_category_id FROM public.categories c
      WHERE c.company_id = p_company_id AND pg_catalog.lower(c.name) = pg_catalog.lower(v_category_name)
      ORDER BY c.is_active DESC, c.created_at ASC LIMIT 1;
      IF v_category_id IS NULL THEN
        IF NOT v_create_categories THEN
          RAISE EXCEPTION 'Fila %: la categoría "%" no existe.', v_label, v_category_name;
        END IF;
        INSERT INTO public.categories (company_id, name, is_active) VALUES (p_company_id, v_category_name, true)
        RETURNING id INTO v_category_id;
        v_categories_created := v_categories_created + 1;
      END IF;
    END IF;

    IF v_existing.id IS NOT NULL THEN
      v_effective_unit := COALESCE(v_unit, v_existing.unit);
      v_effective_min := COALESCE(v_min, v_existing.min_stock);
      IF v_effective_unit IN ('unidad', 'bulto', 'par') THEN
        IF v_existing.current_stock <> pg_catalog.round(v_existing.current_stock, 0) AND v_effective_unit <> v_existing.unit THEN
          RAISE EXCEPTION 'Fila %: no se puede pasar a una unidad indivisible mientras el producto tenga stock fraccionario.', v_label;
        END IF;
        IF v_effective_min <> pg_catalog.round(v_effective_min, 0) THEN
          RAISE EXCEPTION 'Fila %: la unidad "%" no admite decimales en el stock mínimo.', v_label, v_effective_unit;
        END IF;
        IF v_stock IS NOT NULL AND v_stock <> pg_catalog.round(v_stock, 0) THEN
          RAISE EXCEPTION 'Fila %: la unidad "%" no admite cantidades con decimales.', v_label, v_effective_unit;
        END IF;
      END IF;

      UPDATE public.products
      SET name = CASE WHEN v_match_by = 'sku' AND v_name <> '' THEN v_name ELSE name END,
          barcode = COALESCE(v_barcode, barcode),
          description = COALESCE(v_desc, description),
          category_id = COALESCE(v_category_id, category_id),
          unit = v_effective_unit,
          selling_price = COALESCE(v_price, selling_price),
          min_stock = v_effective_min,
          updated_at = pg_catalog.now()
      WHERE id = v_existing.id AND company_id = p_company_id;

      v_new_id := v_existing.id;
      v_updated := v_updated + 1;
    ELSE
      IF v_sku = '' OR v_name = '' THEN
        RAISE EXCEPTION 'Fila %: para crear un producto nuevo hacen falta el SKU y el nombre.', v_label;
      END IF;
      IF pg_catalog.length(v_sku) > 50 THEN
        RAISE EXCEPTION 'Fila %: el SKU no puede superar 50 caracteres.', v_label;
      END IF;
      v_effective_unit := COALESCE(v_unit, 'unidad');
      v_effective_min := COALESCE(v_min, 0);
      IF v_effective_unit IN ('unidad', 'bulto', 'par') THEN
        IF v_effective_min <> pg_catalog.round(v_effective_min, 0) THEN
          RAISE EXCEPTION 'Fila %: la unidad "%" no admite decimales en el stock mínimo.', v_label, v_effective_unit;
        END IF;
        IF v_stock IS NOT NULL AND v_stock <> pg_catalog.round(v_stock, 0) THEN
          RAISE EXCEPTION 'Fila %: la unidad "%" no admite cantidades con decimales.', v_label, v_effective_unit;
        END IF;
      END IF;
      IF EXISTS (SELECT 1 FROM public.products p WHERE p.company_id = p_company_id AND pg_catalog.upper(pg_catalog.btrim(p.sku)) = v_sku) THEN
        RAISE EXCEPTION 'Fila %: el SKU "%" ya existe en el inventario.', v_label, v_sku;
      END IF;

      INSERT INTO public.products (
        company_id, sku, barcode, name, description, category_id, unit, selling_price, min_stock, current_stock, is_active
      ) VALUES (
        p_company_id, v_sku, v_barcode, v_name, v_desc, v_category_id, v_effective_unit,
        COALESCE(v_price, 0), v_effective_min, 0, true
      )
      RETURNING id INTO v_new_id;

      INSERT INTO public.product_costs (company_id, product_id, cost_price, updated_at, updated_by)
      VALUES (p_company_id, v_new_id, COALESCE(v_cost, 0), pg_catalog.now(), v_user_id);

      v_created := v_created + 1;
    END IF;

    -- Costo (solo si vino en la fila y el producto ya existía; en los nuevos ya se cargó)
    IF v_existing.id IS NOT NULL AND v_cost IS NOT NULL THEN
      INSERT INTO public.product_costs (company_id, product_id, cost_price, updated_at, updated_by)
      VALUES (p_company_id, v_new_id, v_cost, pg_catalog.now(), v_user_id)
      ON CONFLICT (company_id, product_id) DO UPDATE
        SET cost_price = EXCLUDED.cost_price, updated_at = pg_catalog.now(), updated_by = EXCLUDED.updated_by;
    END IF;

    -- Stock: se suma al existente, como una entrada auditable
    IF v_stock IS NOT NULL AND v_stock > 0 THEN
      SELECT pc.cost_price INTO v_effective_cost FROM public.product_costs pc
      WHERE pc.company_id = p_company_id AND pc.product_id = v_new_id;
      v_effective_cost := COALESCE(v_cost, v_effective_cost, 0);

      INSERT INTO public.stock_movements (
        company_id, product_id, direction, reason, quantity, notes, reference_doc, created_by
      ) VALUES (
        p_company_id, v_new_id, 'increase', 'import', v_stock, 'Importación desde Excel', 'IMPORT', v_user_id
      ) RETURNING id INTO v_movement_id;

      INSERT INTO public.movement_costs (company_id, movement_id, unit_cost, total_cost)
      VALUES (p_company_id, v_movement_id, v_effective_cost, pg_catalog.round(v_stock * v_effective_cost, 2));

      v_with_stock := v_with_stock + 1;
    END IF;
  END LOOP;

  v_response := pg_catalog.jsonb_build_object(
    'created', v_created,
    'updated', v_updated,
    'skipped', v_skipped,
    'stock_entries', v_with_stock,
    'categories_created', v_categories_created
  );

  UPDATE public.operation_idempotency
  SET response_payload = v_response, updated_at = pg_catalog.now()
  WHERE company_id = p_company_id AND created_by = v_user_id
    AND operation_type = 'inventory_import' AND idempotency_key = p_idempotency_key;

  RETURN v_response;
END;
$$;

REVOKE ALL ON FUNCTION public.import_inventory(UUID, UUID, JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_inventory(UUID, UUID, JSONB, JSONB) TO authenticated;

COMMENT ON FUNCTION public.import_inventory(UUID, UUID, JSONB, JSONB) IS
  'Importa inventario desde Excel: crea productos, actualiza campos y suma stock a los existentes, de forma atómica e idempotente. Requiere operar el módulo productos.';
