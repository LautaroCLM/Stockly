-- ============================================================================
-- MIGRACIÓN OFICIAL: TANDA 2.2B (MIGRACIÓN 8) - ORDEN CANÓNICO DE BLOQUEOS EN CATÁLOGO
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
-- Base de datos: PostgreSQL 17 / Supabase
-- Alcance:
--   1. public.import_products(UUID, JSONB, TEXT)
--      - Pre-bloqueo pesimista determinístico de productos existentes en public.products
--        ordenado canónicamente por id ASC (FOR UPDATE).
--      - Iteración canónica ordenada por upper(btrim(sku)) ASC para inserciones deterministas.
--      - Alineación con el orden global lineal (id ASC) utilizado en import_initial_stock
--        y bulk_update_prices para prevenir interbloqueos circulares (deadlocks - SQLSTATE 40P01).
-- Seguridad:
--   - SECURITY DEFINER + SET search_path = '' + objetos calificados.
--   - Serialización de tenant con FOR NO KEY UPDATE en public.companies.
--   - Revalidación de membresía activa de master_admin.
--   - Preservación íntegra de la lógica de negocio, validaciones y auditoría.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ACTUALIZACIÓN DE RPC: public.import_products
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

  -- 2.1. Bloqueo determinístico canónico de productos existentes (ORDER BY id ASC FOR UPDATE)
  --      Previene ciclos de espera e interbloqueos (deadlocks) con import_initial_stock,
  --      bulk_update_prices u otras import_products concurrentes garantizando orden global lineal.
  PERFORM id
  FROM public.products
  WHERE company_id = p_company_id
    AND upper(btrim(sku)) IN (
      SELECT pg_catalog.upper(pg_catalog.btrim(x.sku))
      FROM pg_catalog.jsonb_to_recordset(p_products) AS x(sku TEXT)
      WHERE x.sku IS NOT NULL AND pg_catalog.btrim(x.sku) <> ''
    )
  ORDER BY id ASC
  FOR UPDATE;

  -- 3. Procesamiento transaccional ordenado canónicamente por SKU (con desempate por orden de entrada original)
  FOR v_prod IN
    SELECT 
      x.sku,
      x.barcode,
      x.name,
      x.description,
      x.category_id,
      x.supplier_id,
      x.unit,
      x.selling_price,
      x.cost_price,
      x.min_stock
    FROM ROWS FROM (
      pg_catalog.jsonb_to_recordset(p_products) AS (
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
    ) WITH ORDINALITY AS x(
      sku,
      barcode,
      name,
      description,
      category_id,
      supplier_id,
      unit,
      selling_price,
      cost_price,
      min_stock,
      ord
    )
    ORDER BY pg_catalog.upper(pg_catalog.btrim(x.sku)) ASC, x.ord ASC
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
  'Importa o actualiza masivamente productos del catálogo con pre-bloqueo determinístico (id ASC) y ordenamiento por SKU para prevención de deadlocks. Exclusivo master_admin.';

REVOKE ALL ON FUNCTION public.import_products(UUID, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_products(UUID, JSONB, TEXT) TO authenticated;
