-- ============================================================================
-- MIGRACIÓN OFICIAL: TANDA 2.2B (MIGRACIÓN 5) - RPCS MASIVAS DE CATÁLOGO
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
-- Base de datos: PostgreSQL 17 / Supabase
-- Alcance:
--   1. public.bulk_update_prices(UUID, UUID, UUID[], NUMERIC, NUMERIC)
--   2. public.import_products(UUID, JSONB, TEXT)
-- Seguridad:
--   - SECURITY DEFINER + SET search_path = '' + objetos calificados.
--   - Bloqueo en public.companies y revalidación post-bloqueo (anti-TOCTOU)
--     de private.assert_company_role(p_company_id, 'master_admin').
--   - Creación/actualización atómica de public.product_costs con updated_by = auth.uid().
--   - Preservación estricta de current_stock y auditoría automática vía triggers.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. FUNCIÓN RPC: public.bulk_update_prices
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bulk_update_prices(
  p_company_id UUID,
  p_category_id UUID DEFAULT NULL,
  p_product_ids UUID[] DEFAULT NULL,
  p_percentage NUMERIC DEFAULT 0.00,
  p_fixed_delta NUMERIC DEFAULT 0.00
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated_count INTEGER := 0;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'El identificador de empresa (p_company_id) es obligatorio.';
  END IF;

  -- 1. Autorización inicial y bloqueo de empresa + revalidación anti-TOCTOU
  PERFORM private.assert_company_role(p_company_id, 'master_admin');

  PERFORM 1
  FROM public.companies
  WHERE id = p_company_id
  FOR NO KEY UPDATE;

  PERFORM private.assert_company_role(p_company_id, 'master_admin');

  -- 2. Bloqueo determinístico (ORDER BY id FOR UPDATE) y actualización de selling_price
  WITH target_products AS (
    SELECT id, selling_price
    FROM public.products
    WHERE company_id = p_company_id
      AND (p_category_id IS NULL OR category_id = p_category_id)
      AND (p_product_ids IS NULL OR id = ANY(p_product_ids))
    ORDER BY id
    FOR UPDATE
  ),
  updated AS (
    UPDATE public.products p
    SET
      selling_price = GREATEST(
        0.00,
        pg_catalog.round(
          p.selling_price * (1 + COALESCE(p_percentage, 0.00) / 100) + COALESCE(p_fixed_delta, 0.00),
          2
        )
      ),
      updated_at = pg_catalog.now()
    FROM target_products tp
    WHERE p.id = tp.id
      AND p.company_id = p_company_id
    RETURNING p.id
  )
  SELECT count(*)::INTEGER INTO v_updated_count FROM updated;

  RETURN COALESCE(v_updated_count, 0);
END;
$$;

COMMENT ON FUNCTION public.bulk_update_prices(UUID, UUID, UUID[], NUMERIC, NUMERIC) IS
  'Actualiza masivamente precios de venta por categoría y/o lista de IDs aplicando porcentaje y delta fijo, redondeando a 2 decimales con piso 0.00. Exclusivo master_admin.';

-- ----------------------------------------------------------------------------
-- 2. FUNCIÓN RPC: public.import_products
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.import_products(
  p_company_id UUID,
  p_products JSONB,
  p_on_duplicate TEXT DEFAULT 'error'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_prod RECORD;
  v_count INTEGER := 0;
  v_clean_sku TEXT;
  v_clean_name TEXT;
  v_clean_barcode TEXT;
  v_clean_desc TEXT;
  v_clean_unit TEXT;
  v_effective_unit TEXT;
  v_effective_min_stock NUMERIC;
  v_existing_id UUID;
  v_existing_unit TEXT;
  v_existing_stock NUMERIC(12, 2);
  v_existing_min_stock NUMERIC(12, 2);
  v_new_id UUID;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'El identificador de empresa (p_company_id) es obligatorio.';
  END IF;

  -- 1. Autorización inicial y bloqueo de empresa + revalidación anti-TOCTOU
  PERFORM private.assert_company_role(p_company_id, 'master_admin');

  PERFORM 1
  FROM public.companies
  WHERE id = p_company_id
  FOR NO KEY UPDATE;

  PERFORM private.assert_company_role(p_company_id, 'master_admin');
  v_user_id := auth.uid();

  -- 2. Validación de modo de duplicados y estructura JSONB
  IF p_on_duplicate IS NULL OR p_on_duplicate NOT IN ('error', 'update', 'skip') THEN
    RAISE EXCEPTION 'Opción p_on_duplicate inválida: %', p_on_duplicate;
  END IF;

  IF p_products IS NULL OR pg_catalog.jsonb_typeof(p_products) <> 'array' THEN
    RAISE EXCEPTION 'El parámetro p_products debe ser un arreglo JSON válido.';
  END IF;

  -- 3. Procesamiento transaccional ítem por ítem
  FOR v_prod IN
    SELECT *
    FROM pg_catalog.jsonb_to_recordset(p_products) AS x(
      sku TEXT,
      barcode TEXT,
      name TEXT,
      description TEXT,
      category_id UUID,
      supplier_id UUID,
      unit TEXT,
      selling_price NUMERIC,
      cost_price NUMERIC,
      min_stock NUMERIC
    )
  LOOP
    IF v_prod.sku IS NULL OR pg_catalog.btrim(v_prod.sku) = ''
       OR v_prod.name IS NULL OR pg_catalog.btrim(v_prod.name) = '' THEN
      RAISE EXCEPTION 'SKU y Nombre son campos obligatorios';
    END IF;

    v_clean_sku     := pg_catalog.upper(pg_catalog.btrim(v_prod.sku));
    v_clean_name    := pg_catalog.btrim(v_prod.name);
    v_clean_barcode := NULLIF(pg_catalog.btrim(COALESCE(v_prod.barcode, '')), '');
    v_clean_desc    := NULLIF(pg_catalog.btrim(COALESCE(v_prod.description, '')), '');
    v_clean_unit    := NULLIF(pg_catalog.lower(pg_catalog.btrim(COALESCE(v_prod.unit, ''))), '');

    IF pg_catalog.length(v_clean_sku) > 50 THEN
      RAISE EXCEPTION 'El código SKU es obligatorio y no puede superar 50 caracteres.';
    END IF;

    IF pg_catalog.length(v_clean_name) > 200 THEN
      RAISE EXCEPTION 'El nombre del producto es obligatorio y no puede superar 200 caracteres.';
    END IF;

    IF v_clean_barcode IS NOT NULL AND pg_catalog.length(v_clean_barcode) > 50 THEN
      RAISE EXCEPTION 'El código de barras no puede superar 50 caracteres.';
    END IF;

    IF v_clean_unit IS NOT NULL AND v_clean_unit NOT IN ('unidad', 'kg', 'litro', 'metro', 'bulto', 'par') THEN
      RAISE EXCEPTION 'Unidad de medida inválida (%). Valores permitidos: unidad, kg, litro, metro, bulto, par.', v_clean_unit;
    END IF;

    IF v_prod.selling_price IS NOT NULL AND (
      v_prod.selling_price < 0.00 OR pg_catalog.scale(v_prod.selling_price) > 2 OR v_prod.selling_price > 999999999999.99
    ) THEN
      RAISE EXCEPTION 'El precio de venta no puede ser negativo ni tener más de 2 decimales.';
    END IF;

    IF v_prod.cost_price IS NOT NULL AND (
      v_prod.cost_price < 0.00 OR pg_catalog.scale(v_prod.cost_price) > 2 OR v_prod.cost_price > 999999999999.99
    ) THEN
      RAISE EXCEPTION 'El precio de costo no puede ser negativo ni tener más de 2 decimales.';
    END IF;

    IF v_prod.min_stock IS NOT NULL AND (
      v_prod.min_stock < 0.00 OR pg_catalog.scale(v_prod.min_stock) > 2 OR v_prod.min_stock > 999999999.99
    ) THEN
      RAISE EXCEPTION 'El stock mínimo no puede ser negativo ni tener más de 2 decimales.';
    END IF;

    -- Validación de pertenencia multi-tenant de category_id y supplier_id
    IF v_prod.category_id IS NOT NULL THEN
      PERFORM 1
      FROM public.categories
      WHERE id = v_prod.category_id
        AND company_id = p_company_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'La categoría especificada no existe o no pertenece a la empresa.';
      END IF;
    END IF;

    IF v_prod.supplier_id IS NOT NULL THEN
      PERFORM 1
      FROM public.suppliers
      WHERE id = v_prod.supplier_id
        AND company_id = p_company_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'El proveedor especificado no existe o no pertenece a la empresa.';
      END IF;
    END IF;

    -- Buscar producto existente en la empresa por SKU normalizado
    v_existing_id := NULL;
    SELECT id, unit, current_stock, min_stock
    INTO v_existing_id, v_existing_unit, v_existing_stock, v_existing_min_stock
    FROM public.products
    WHERE company_id = p_company_id
      AND pg_catalog.upper(pg_catalog.btrim(sku)) = v_clean_sku
    FOR UPDATE;

    IF v_existing_id IS NOT NULL THEN
      IF p_on_duplicate = 'error' THEN
        RAISE EXCEPTION 'El SKU % ya existe en el catálogo de esta empresa', v_clean_sku;
      ELSIF p_on_duplicate = 'skip' THEN
        CONTINUE;
      ELSIF p_on_duplicate = 'update' THEN
        v_effective_unit      := COALESCE(v_clean_unit, v_existing_unit);
        v_effective_min_stock := COALESCE(v_prod.min_stock, v_existing_min_stock);

        IF v_effective_unit IN ('unidad', 'bulto', 'par') THEN
          IF v_existing_stock <> pg_catalog.round(v_existing_stock, 0) THEN
            RAISE EXCEPTION 'No se puede cambiar a una unidad indivisible mientras el producto tenga stock fraccionario.';
          END IF;

          IF v_effective_min_stock <> pg_catalog.round(v_effective_min_stock, 0) THEN
            RAISE EXCEPTION 'La unidad de medida seleccionada no admite decimales en el stock mínimo.';
          END IF;
        END IF;

        UPDATE public.products
        SET
          barcode       = COALESCE(v_clean_barcode, barcode),
          name          = v_clean_name,
          description   = COALESCE(v_clean_desc, description),
          category_id   = COALESCE(v_prod.category_id, category_id),
          supplier_id   = COALESCE(v_prod.supplier_id, supplier_id),
          unit          = v_effective_unit,
          selling_price = COALESCE(v_prod.selling_price, selling_price),
          min_stock     = v_effective_min_stock,
          updated_at    = pg_catalog.now()
        WHERE id = v_existing_id
          AND company_id = p_company_id;

        IF v_prod.cost_price IS NOT NULL THEN
          INSERT INTO public.product_costs (
            company_id,
            product_id,
            cost_price,
            updated_at,
            updated_by
          ) VALUES (
            p_company_id,
            v_existing_id,
            v_prod.cost_price,
            pg_catalog.now(),
            v_user_id
          )
          ON CONFLICT (company_id, product_id) DO UPDATE
          SET cost_price = EXCLUDED.cost_price,
              updated_at = pg_catalog.now(),
              updated_by = EXCLUDED.updated_by;
        END IF;

        v_count := v_count + 1;
      END IF;
    ELSE
      v_effective_unit      := COALESCE(v_clean_unit, 'unidad');
      v_effective_min_stock := COALESCE(v_prod.min_stock, 0.00);

      IF v_effective_unit IN ('unidad', 'bulto', 'par') AND v_effective_min_stock <> pg_catalog.round(v_effective_min_stock, 0) THEN
        RAISE EXCEPTION 'La unidad de medida seleccionada no admite decimales en el stock mínimo.';
      END IF;

      INSERT INTO public.products (
        company_id,
        sku,
        barcode,
        name,
        description,
        category_id,
        supplier_id,
        unit,
        selling_price,
        min_stock,
        current_stock,
        is_active
      ) VALUES (
        p_company_id,
        v_clean_sku,
        v_clean_barcode,
        v_clean_name,
        v_clean_desc,
        v_prod.category_id,
        v_prod.supplier_id,
        v_effective_unit,
        COALESCE(v_prod.selling_price, 0.00),
        v_effective_min_stock,
        0.00,
        true
      )
      RETURNING id INTO v_new_id;

      INSERT INTO public.product_costs (
        company_id,
        product_id,
        cost_price,
        updated_at,
        updated_by
      ) VALUES (
        p_company_id,
        v_new_id,
        COALESCE(v_prod.cost_price, 0.00),
        pg_catalog.now(),
        v_user_id
      );

      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.import_products(UUID, JSONB, TEXT) IS
  'Importa o actualiza masivamente productos del catálogo con creación atómica de product_costs y soporte de modos error, update y skip. Exclusivo master_admin.';

-- ----------------------------------------------------------------------------
-- 3. PRIVILEGIOS DE EJECUCIÓN (DEFENSA EN PROFUNDIDAD)
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.bulk_update_prices(UUID, UUID, UUID[], NUMERIC, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_update_prices(UUID, UUID, UUID[], NUMERIC, NUMERIC) TO authenticated;

REVOKE ALL ON FUNCTION public.import_products(UUID, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_products(UUID, JSONB, TEXT) TO authenticated;
