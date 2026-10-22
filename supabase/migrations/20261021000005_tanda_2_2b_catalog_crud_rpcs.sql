-- ============================================================================
-- MIGRACIÓN OFICIAL: TANDA 2.2B (MIGRACIÓN 4) - RPCS DE CRUD DE CATÁLOGO
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
-- Base de datos: PostgreSQL 17 / Supabase
-- Alcance:
--   1. public.upsert_category(...)
--   2. public.upsert_supplier(...)
--   3. public.create_product(...) — con creación atómica de product_costs
--   4. public.update_product(...) — sin alterar current_stock
--   5. public.update_product_cost(...)
-- Seguridad:
--   - Cero mutaciones directas por PostgREST desde clientes (REVOKE mantenido).
--   - SECURITY DEFINER + SET search_path = '' + objetos calificados.
--   - Bloqueo en public.companies y revalidación post-bloqueo (anti-TOCTOU)
--     de private.assert_company_role(p_company_id, 'master_admin').
--   - Auditoría automática garantizada por los triggers tr_audit_* (Migración 1).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. FUNCIÓN RPC: public.upsert_category
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_category(
  p_company_id UUID,
  p_name TEXT,
  p_description TEXT DEFAULT NULL,
  p_category_id UUID DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT true
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clean_name TEXT;
  v_clean_desc TEXT;
  v_category_id UUID;
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

  -- 2. Normalización y validación de parámetros
  v_clean_name := pg_catalog.btrim(COALESCE(p_name, ''));
  v_clean_desc := NULLIF(pg_catalog.btrim(COALESCE(p_description, '')), '');

  IF v_clean_name = '' OR pg_catalog.length(v_clean_name) > 100 THEN
    RAISE EXCEPTION 'El nombre de la categoría es obligatorio y no puede superar 100 caracteres.';
  END IF;

  IF v_clean_desc IS NOT NULL AND pg_catalog.length(v_clean_desc) > 500 THEN
    RAISE EXCEPTION 'La descripción de la categoría no puede superar 500 caracteres.';
  END IF;

  -- 3. Alta o actualización aislada por company_id
  IF p_category_id IS NULL THEN
    INSERT INTO public.categories (
      company_id,
      name,
      description,
      is_active
    ) VALUES (
      p_company_id,
      v_clean_name,
      v_clean_desc,
      COALESCE(p_is_active, true)
    )
    RETURNING id INTO v_category_id;
  ELSE
    SELECT id INTO v_category_id
    FROM public.categories
    WHERE id = p_category_id
      AND company_id = p_company_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Categoría no encontrada en la empresa especificada.';
    END IF;

    UPDATE public.categories
    SET name = v_clean_name,
        description = v_clean_desc,
        is_active = COALESCE(p_is_active, true),
        updated_at = pg_catalog.now()
    WHERE id = v_category_id
      AND company_id = p_company_id;
  END IF;

  RETURN v_category_id;
END;
$$;

COMMENT ON FUNCTION public.upsert_category(UUID, TEXT, TEXT, UUID, BOOLEAN) IS
  'Crea o actualiza una categoría del catálogo de la empresa. Exclusivo para master_admin activo.';

-- ----------------------------------------------------------------------------
-- 2. FUNCIÓN RPC: public.upsert_supplier
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_supplier(
  p_company_id UUID,
  p_name TEXT,
  p_contact_name TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_address TEXT DEFAULT NULL,
  p_tax_id TEXT DEFAULT NULL,
  p_supplier_id UUID DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT true
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clean_name TEXT;
  v_clean_contact TEXT;
  v_clean_email TEXT;
  v_clean_phone TEXT;
  v_clean_address TEXT;
  v_clean_tax_id TEXT;
  v_supplier_id UUID;
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

  -- 2. Normalización y validación de parámetros
  v_clean_name    := pg_catalog.btrim(COALESCE(p_name, ''));
  v_clean_contact := NULLIF(pg_catalog.btrim(COALESCE(p_contact_name, '')), '');
  v_clean_email   := NULLIF(pg_catalog.btrim(COALESCE(p_email, '')), '');
  v_clean_phone   := NULLIF(pg_catalog.btrim(COALESCE(p_phone, '')), '');
  v_clean_address := NULLIF(pg_catalog.btrim(COALESCE(p_address, '')), '');
  v_clean_tax_id  := NULLIF(pg_catalog.btrim(COALESCE(p_tax_id, '')), '');

  IF v_clean_name = '' OR pg_catalog.length(v_clean_name) > 150 THEN
    RAISE EXCEPTION 'El nombre del proveedor es obligatorio y no puede superar 150 caracteres.';
  END IF;

  IF v_clean_tax_id IS NOT NULL AND NOT public.validate_cuit(v_clean_tax_id) THEN
    RAISE EXCEPTION 'El CUIT del proveedor no es válido.';
  END IF;

  IF v_clean_email IS NOT NULL AND v_clean_email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
    RAISE EXCEPTION 'El correo electrónico del proveedor no tiene un formato válido.';
  END IF;

  -- 3. Alta o actualización aislada por company_id
  IF p_supplier_id IS NULL THEN
    INSERT INTO public.suppliers (
      company_id,
      name,
      contact_name,
      email,
      phone,
      address,
      tax_id,
      is_active
    ) VALUES (
      p_company_id,
      v_clean_name,
      v_clean_contact,
      v_clean_email,
      v_clean_phone,
      v_clean_address,
      v_clean_tax_id,
      COALESCE(p_is_active, true)
    )
    RETURNING id INTO v_supplier_id;
  ELSE
    SELECT id INTO v_supplier_id
    FROM public.suppliers
    WHERE id = p_supplier_id
      AND company_id = p_company_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Proveedor no encontrado en la empresa especificada.';
    END IF;

    UPDATE public.suppliers
    SET name = v_clean_name,
        contact_name = v_clean_contact,
        email = v_clean_email,
        phone = v_clean_phone,
        address = v_clean_address,
        tax_id = v_clean_tax_id,
        is_active = COALESCE(p_is_active, true),
        updated_at = pg_catalog.now()
    WHERE id = v_supplier_id
      AND company_id = p_company_id;
  END IF;

  RETURN v_supplier_id;
END;
$$;

COMMENT ON FUNCTION public.upsert_supplier(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, BOOLEAN) IS
  'Crea o actualiza un proveedor comercial de la empresa con validación de CUIT. Exclusivo para master_admin activo.';

-- ----------------------------------------------------------------------------
-- 3. FUNCIÓN RPC: public.create_product
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_product(
  p_company_id UUID,
  p_sku TEXT,
  p_name TEXT,
  p_unit TEXT DEFAULT 'unidad',
  p_selling_price NUMERIC DEFAULT 0.00,
  p_cost_price NUMERIC DEFAULT 0.00,
  p_min_stock NUMERIC DEFAULT 0.00,
  p_barcode TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_category_id UUID DEFAULT NULL,
  p_supplier_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_clean_sku TEXT;
  v_clean_name TEXT;
  v_clean_unit TEXT;
  v_clean_barcode TEXT;
  v_clean_desc TEXT;
  v_selling NUMERIC;
  v_cost NUMERIC;
  v_min_stock NUMERIC;
  v_product_id UUID;
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

  -- 2. Normalización y validación de textos y unidad
  v_clean_sku     := pg_catalog.upper(pg_catalog.btrim(COALESCE(p_sku, '')));
  v_clean_name    := pg_catalog.btrim(COALESCE(p_name, ''));
  v_clean_unit    := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_unit, 'unidad')));
  v_clean_barcode := NULLIF(pg_catalog.btrim(COALESCE(p_barcode, '')), '');
  v_clean_desc    := NULLIF(pg_catalog.btrim(COALESCE(p_description, '')), '');

  IF v_clean_sku = '' OR pg_catalog.length(v_clean_sku) > 50 THEN
    RAISE EXCEPTION 'El código SKU es obligatorio y no puede superar 50 caracteres.';
  END IF;

  IF v_clean_name = '' OR pg_catalog.length(v_clean_name) > 200 THEN
    RAISE EXCEPTION 'El nombre del producto es obligatorio y no puede superar 200 caracteres.';
  END IF;

  IF v_clean_unit NOT IN ('unidad', 'kg', 'litro', 'metro', 'bulto', 'par') THEN
    RAISE EXCEPTION 'Unidad de medida inválida (%). Valores permitidos: unidad, kg, litro, metro, bulto, par.', v_clean_unit;
  END IF;

  IF v_clean_barcode IS NOT NULL AND pg_catalog.length(v_clean_barcode) > 50 THEN
    RAISE EXCEPTION 'El código de barras no puede superar 50 caracteres.';
  END IF;

  -- 3. Validación de importes y stock mínimo
  v_selling   := COALESCE(p_selling_price, 0.00);
  v_cost      := COALESCE(p_cost_price, 0.00);
  v_min_stock := COALESCE(p_min_stock, 0.00);

  IF v_selling < 0.00 OR pg_catalog.scale(v_selling) > 2 OR v_selling > 999999999999.99 THEN
    RAISE EXCEPTION 'El precio de venta no puede ser negativo ni tener más de 2 decimales.';
  END IF;

  IF v_cost < 0.00 OR pg_catalog.scale(v_cost) > 2 OR v_cost > 999999999999.99 THEN
    RAISE EXCEPTION 'El precio de costo no puede ser negativo ni tener más de 2 decimales.';
  END IF;

  IF v_min_stock < 0.00 OR pg_catalog.scale(v_min_stock) > 2 OR v_min_stock > 999999999.99 THEN
    RAISE EXCEPTION 'El stock mínimo no puede ser negativo ni tener más de 2 decimales.';
  END IF;

  IF v_clean_unit IN ('unidad', 'bulto', 'par') AND v_min_stock <> pg_catalog.round(v_min_stock, 0) THEN
    RAISE EXCEPTION 'La unidad de medida seleccionada no admite decimales en el stock mínimo.';
  END IF;

  -- 4. Validación de pertenencia multi-tenant de category_id y supplier_id
  IF p_category_id IS NOT NULL THEN
    PERFORM 1
    FROM public.categories
    WHERE id = p_category_id
      AND company_id = p_company_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'La categoría especificada no existe o no pertenece a la empresa.';
    END IF;
  END IF;

  IF p_supplier_id IS NOT NULL THEN
    PERFORM 1
    FROM public.suppliers
    WHERE id = p_supplier_id
      AND company_id = p_company_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'El proveedor especificado no existe o no pertenece a la empresa.';
    END IF;
  END IF;

  -- 5. Inserción atómica en public.products (current_stock = 0.00) y public.product_costs
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
    p_category_id,
    p_supplier_id,
    v_clean_unit,
    v_selling,
    v_min_stock,
    0.00,
    true
  )
  RETURNING id INTO v_product_id;

  INSERT INTO public.product_costs (
    company_id,
    product_id,
    cost_price,
    updated_at,
    updated_by
  ) VALUES (
    p_company_id,
    v_product_id,
    v_cost,
    pg_catalog.now(),
    v_user_id
  );

  RETURN v_product_id;
END;
$$;

COMMENT ON FUNCTION public.create_product(UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, UUID, UUID) IS
  'Crea un producto nuevo en el catálogo (current_stock = 0.00) e inicializa atómicamente su fila en product_costs. Exclusivo para master_admin activo.';

-- ----------------------------------------------------------------------------
-- 4. FUNCIÓN RPC: public.update_product
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_product(
  p_company_id UUID,
  p_product_id UUID,
  p_sku TEXT,
  p_name TEXT,
  p_unit TEXT,
  p_selling_price NUMERIC,
  p_min_stock NUMERIC,
  p_barcode TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_category_id UUID DEFAULT NULL,
  p_supplier_id UUID DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT true
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current_stock NUMERIC(12, 2);
  v_clean_sku TEXT;
  v_clean_name TEXT;
  v_clean_unit TEXT;
  v_clean_barcode TEXT;
  v_clean_desc TEXT;
BEGIN
  IF p_company_id IS NULL OR p_product_id IS NULL THEN
    RAISE EXCEPTION 'Los identificadores de empresa y producto son obligatorios.';
  END IF;

  -- 1. Autorización inicial y bloqueo de empresa + revalidación anti-TOCTOU
  PERFORM private.assert_company_role(p_company_id, 'master_admin');

  PERFORM 1
  FROM public.companies
  WHERE id = p_company_id
  FOR NO KEY UPDATE;

  PERFORM private.assert_company_role(p_company_id, 'master_admin');

  -- 2. Bloqueo pesimista del producto objetivo y lectura de current_stock actual
  SELECT current_stock INTO v_current_stock
  FROM public.products
  WHERE id = p_product_id
    AND company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto no encontrado en la empresa especificada.';
  END IF;

  -- 3. Normalización y validación de parámetros
  v_clean_sku     := pg_catalog.upper(pg_catalog.btrim(COALESCE(p_sku, '')));
  v_clean_name    := pg_catalog.btrim(COALESCE(p_name, ''));
  v_clean_unit    := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_unit, '')));
  v_clean_barcode := NULLIF(pg_catalog.btrim(COALESCE(p_barcode, '')), '');
  v_clean_desc    := NULLIF(pg_catalog.btrim(COALESCE(p_description, '')), '');

  IF v_clean_sku = '' OR pg_catalog.length(v_clean_sku) > 50 THEN
    RAISE EXCEPTION 'El código SKU es obligatorio y no puede superar 50 caracteres.';
  END IF;

  IF v_clean_name = '' OR pg_catalog.length(v_clean_name) > 200 THEN
    RAISE EXCEPTION 'El nombre del producto es obligatorio y no puede superar 200 caracteres.';
  END IF;

  IF v_clean_unit NOT IN ('unidad', 'kg', 'litro', 'metro', 'bulto', 'par') THEN
    RAISE EXCEPTION 'Unidad de medida inválida (%). Valores permitidos: unidad, kg, litro, metro, bulto, par.', v_clean_unit;
  END IF;

  IF v_clean_barcode IS NOT NULL AND pg_catalog.length(v_clean_barcode) > 50 THEN
    RAISE EXCEPTION 'El código de barras no puede superar 50 caracteres.';
  END IF;

  IF p_selling_price IS NULL OR p_selling_price < 0.00 OR pg_catalog.scale(p_selling_price) > 2 OR p_selling_price > 999999999999.99 THEN
    RAISE EXCEPTION 'El precio de venta no puede ser negativo ni tener más de 2 decimales.';
  END IF;

  IF p_min_stock IS NULL OR p_min_stock < 0.00 OR pg_catalog.scale(p_min_stock) > 2 OR p_min_stock > 999999999.99 THEN
    RAISE EXCEPTION 'El stock mínimo no puede ser negativo ni tener más de 2 decimales.';
  END IF;

  IF v_clean_unit IN ('unidad', 'bulto', 'par') THEN
    IF v_current_stock <> pg_catalog.round(v_current_stock, 0) THEN
      RAISE EXCEPTION 'No se puede cambiar a una unidad indivisible mientras el producto tenga stock fraccionario.';
    END IF;

    IF p_min_stock <> pg_catalog.round(p_min_stock, 0) THEN
      RAISE EXCEPTION 'La unidad de medida seleccionada no admite decimales en el stock mínimo.';
    END IF;
  END IF;

  -- 4. Validación de pertenencia multi-tenant de category_id y supplier_id
  IF p_category_id IS NOT NULL THEN
    PERFORM 1
    FROM public.categories
    WHERE id = p_category_id
      AND company_id = p_company_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'La categoría especificada no existe o no pertenece a la empresa.';
    END IF;
  END IF;

  IF p_supplier_id IS NOT NULL THEN
    PERFORM 1
    FROM public.suppliers
    WHERE id = p_supplier_id
      AND company_id = p_company_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'El proveedor especificado no existe o no pertenece a la empresa.';
    END IF;
  END IF;

  -- 5. Actualización de metadatos y precio de venta (sin modificar current_stock)
  UPDATE public.products
  SET sku = v_clean_sku,
      barcode = v_clean_barcode,
      name = v_clean_name,
      description = v_clean_desc,
      category_id = p_category_id,
      supplier_id = p_supplier_id,
      unit = v_clean_unit,
      selling_price = p_selling_price,
      min_stock = p_min_stock,
      is_active = COALESCE(p_is_active, true),
      updated_at = pg_catalog.now()
  WHERE id = p_product_id
    AND company_id = p_company_id;
END;
$$;

COMMENT ON FUNCTION public.update_product(UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, UUID, BOOLEAN) IS
  'Actualiza los datos de catálogo y precio de venta de un producto sin modificar jamás current_stock. Exclusivo para master_admin activo.';

-- ----------------------------------------------------------------------------
-- 5. FUNCIÓN RPC: public.update_product_cost
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_product_cost(
  p_company_id UUID,
  p_product_id UUID,
  p_cost_price NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  IF p_company_id IS NULL OR p_product_id IS NULL THEN
    RAISE EXCEPTION 'Los identificadores de empresa y producto son obligatorios.';
  END IF;

  -- 1. Autorización inicial y bloqueo de empresa + revalidación anti-TOCTOU
  PERFORM private.assert_company_role(p_company_id, 'master_admin');

  PERFORM 1
  FROM public.companies
  WHERE id = p_company_id
  FOR NO KEY UPDATE;

  PERFORM private.assert_company_role(p_company_id, 'master_admin');
  v_user_id := auth.uid();

  -- 2. Validación de precio de costo
  IF p_cost_price IS NULL OR p_cost_price < 0.00 OR pg_catalog.scale(p_cost_price) > 2 OR p_cost_price > 999999999999.99 THEN
    RAISE EXCEPTION 'El precio de costo no puede ser negativo ni tener más de 2 decimales.';
  END IF;

  -- 3. Verificar y bloquear el producto dentro de la misma empresa
  PERFORM 1
  FROM public.products
  WHERE id = p_product_id
    AND company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto no encontrado en la empresa especificada.';
  END IF;

  -- 4. Upsert en public.product_costs registrando updated_by = auth.uid()
  INSERT INTO public.product_costs (
    company_id,
    product_id,
    cost_price,
    updated_at,
    updated_by
  ) VALUES (
    p_company_id,
    p_product_id,
    p_cost_price,
    pg_catalog.now(),
    v_user_id
  )
  ON CONFLICT (company_id, product_id) DO UPDATE
  SET cost_price = EXCLUDED.cost_price,
      updated_at = pg_catalog.now(),
      updated_by = EXCLUDED.updated_by;
END;
$$;

COMMENT ON FUNCTION public.update_product_cost(UUID, UUID, NUMERIC) IS
  'Actualiza el costo confidencial de reposición de un producto registrando el usuario autor. Exclusivo para master_admin activo.';

-- ----------------------------------------------------------------------------
-- 6. PRIVILEGIOS DE EJECUCIÓN (DEFENSA EN PROFUNDIDAD)
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.upsert_category(UUID, TEXT, TEXT, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_category(UUID, TEXT, TEXT, UUID, BOOLEAN) TO authenticated;

REVOKE ALL ON FUNCTION public.upsert_supplier(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_supplier(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, BOOLEAN) TO authenticated;

REVOKE ALL ON FUNCTION public.create_product(UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_product(UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.update_product(UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_product(UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, UUID, BOOLEAN) TO authenticated;

REVOKE ALL ON FUNCTION public.update_product_cost(UUID, UUID, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_product_cost(UUID, UUID, NUMERIC) TO authenticated;
