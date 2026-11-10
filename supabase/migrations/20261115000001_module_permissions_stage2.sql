-- ============================================================================
-- MIGRACIÓN: PERMISOS POR MÓDULO (ETAPA 2)
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
--
-- Suma cinco módulos configurables para el rol empleado, con valores por defecto que
-- reproducen lo que hoy puede hacer (las empresas existentes no cambian):
--   * productos  (por defecto: sin acceso): 'view' = ve costos; 'operate' = además crea y
--     edita productos, cambia precios y costos, ajusta stock, carga inventario y categorías.
--     El catálogo para vender lo ven todos siempre.
--   * caja       (por defecto: ver y operar): abrir, cerrar y registrar movimientos de caja;
--     con 'view' solo consulta; con 'none' no accede a la caja.
--   * clientes   (por defecto: solo ver): 'operate' = crea y edita clientes. No se puede
--     ocultar: hace falta para vender a un cliente.
--   * proveedores (por defecto: solo ver): 'operate' = crea y edita proveedores. Los nombres
--     de proveedores se siguen viendo desde Compras, Gastos y Cobros y Pagos.
--   * anular_ventas (por defecto: sin acceso): 'operate' = puede anular ventas.
--   Vender (process_sale), el catálogo, el stock visible y los movimientos de stock siguen
--   abiertos a todos los miembros. Las funciones conservan su lógica: solo cambia la línea
--   que valida el acceso.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. LISTA DE MÓDULOS Y VALORES POR DEFECTO
-- ----------------------------------------------------------------------------
ALTER TABLE public.company_module_permissions DROP CONSTRAINT IF EXISTS company_module_permissions_module_check;
ALTER TABLE public.company_module_permissions ADD CONSTRAINT company_module_permissions_module_check CHECK (module IN (
  'compras', 'finanzas', 'gastos', 'cobros_pagos', 'informes', 'maquinas', 'personal', 'fichaje',
  'productos', 'caja', 'clientes', 'proveedores', 'anular_ventas'
));

-- Lo que puede hacer un empleado en un módulo cuando nadie lo configuró (= comportamiento histórico)
CREATE OR REPLACE FUNCTION private.default_module_level(p_module TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_module
    WHEN 'fichaje' THEN 'operate'
    WHEN 'caja' THEN 'operate'
    WHEN 'clientes' THEN 'view'
    WHEN 'proveedores' THEN 'view'
    ELSE 'none'
  END;
$$;

REVOKE ALL ON FUNCTION private.default_module_level(TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.module_level(p_company_id UUID, p_module TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role TEXT;
  v_level TEXT;
BEGIN
  SELECT cm.role INTO v_role
  FROM public.company_members cm
  JOIN public.companies c ON c.id = cm.company_id
  WHERE cm.company_id = p_company_id AND cm.user_id = auth.uid() AND cm.is_active = true AND c.is_active = true;

  IF v_role IS NULL THEN
    RETURN 'none';
  END IF;
  IF v_role = 'master_admin' THEN
    RETURN 'operate';
  END IF;

  SELECT p.employee_level INTO v_level
  FROM public.company_module_permissions p
  WHERE p.company_id = p_company_id AND p.module = p_module;

  RETURN COALESCE(v_level, private.default_module_level(p_module));
END;
$$;

REVOKE ALL ON FUNCTION private.module_level(UUID, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_module_permissions(p_company_id UUID)
RETURNS TABLE (module TEXT, employee_level TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  PERFORM private.assert_company_role(p_company_id, NULL);

  RETURN QUERY
  SELECT m.module, COALESCE(p.employee_level, private.default_module_level(m.module))
  FROM pg_catalog.unnest(ARRAY[
    'compras', 'cobros_pagos', 'gastos', 'finanzas', 'informes', 'maquinas', 'personal', 'fichaje',
    'productos', 'caja', 'clientes', 'proveedores', 'anular_ventas'
  ]) WITH ORDINALITY AS m(module, ord)
  LEFT JOIN public.company_module_permissions p ON p.company_id = p_company_id AND p.module = m.module
  ORDER BY m.ord;
END;
$$;

REVOKE ALL ON FUNCTION public.get_module_permissions(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_module_permissions(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_module_permissions(p_company_id UUID, p_levels JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item RECORD;
  v_level TEXT;
  v_count INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  PERFORM private.assert_company_role(p_company_id, 'master_admin');

  IF p_levels IS NULL OR pg_catalog.jsonb_typeof(p_levels) <> 'object' THEN
    RAISE EXCEPTION 'Los permisos deben indicarse como un objeto {módulo: nivel}.';
  END IF;

  FOR v_item IN SELECT e.key AS module, e.value AS level FROM pg_catalog.jsonb_each(p_levels) AS e LOOP
    IF v_item.module NOT IN (
      'compras', 'finanzas', 'gastos', 'cobros_pagos', 'informes', 'maquinas', 'personal', 'fichaje',
      'productos', 'caja', 'clientes', 'proveedores', 'anular_ventas'
    ) THEN
      RAISE EXCEPTION 'Módulo inválido: %.', v_item.module;
    END IF;
    IF pg_catalog.jsonb_typeof(v_item.level) <> 'string' OR (v_item.level #>> '{}') NOT IN ('none', 'view', 'operate') THEN
      RAISE EXCEPTION 'Nivel inválido para el módulo %.', v_item.module;
    END IF;
    v_level := v_item.level #>> '{}';
    IF v_item.module = 'clientes' AND v_level = 'none' THEN
      RAISE EXCEPTION 'Clientes no se puede ocultar: hace falta para vender a un cliente.';
    END IF;

    INSERT INTO public.company_module_permissions (company_id, module, employee_level, updated_by)
    VALUES (p_company_id, v_item.module, v_level, auth.uid())
    ON CONFLICT (company_id, module) DO UPDATE
      SET employee_level = EXCLUDED.employee_level, updated_by = EXCLUDED.updated_by, updated_at = now()
      WHERE public.company_module_permissions.employee_level IS DISTINCT FROM EXCLUDED.employee_level;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.set_module_permissions(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_module_permissions(UUID, JSONB) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. OPERACIONES: del rol fijo al permiso por módulo
--    (cada función conserva su lógica; solo cambia la línea que valida el acceso)
-- ----------------------------------------------------------------------------

-- create_product(uuid,text,text,text,numeric,numeric,numeric,text,text,uuid,uuid): productos (operate) [2 verificación(es)]
CREATE OR REPLACE FUNCTION public.create_product(p_company_id uuid, p_sku text, p_name text, p_unit text DEFAULT 'unidad'::text, p_selling_price numeric DEFAULT 0.00, p_cost_price numeric DEFAULT 0.00, p_min_stock numeric DEFAULT 0.00, p_barcode text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_category_id uuid DEFAULT NULL::uuid, p_supplier_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  PERFORM private.assert_module_access(p_company_id, ARRAY['productos'], 'operate');

  PERFORM 1
  FROM public.companies
  WHERE id = p_company_id
  FOR NO KEY UPDATE;

  PERFORM private.assert_module_access(p_company_id, ARRAY['productos'], 'operate');
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
$function$;

-- update_product(uuid,uuid,text,text,text,numeric,numeric,text,text,uuid,uuid,boolean): productos (operate) [2 verificación(es)]
CREATE OR REPLACE FUNCTION public.update_product(p_company_id uuid, p_product_id uuid, p_sku text, p_name text, p_unit text, p_selling_price numeric, p_min_stock numeric, p_barcode text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_category_id uuid DEFAULT NULL::uuid, p_supplier_id uuid DEFAULT NULL::uuid, p_is_active boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  PERFORM private.assert_module_access(p_company_id, ARRAY['productos'], 'operate');

  PERFORM 1
  FROM public.companies
  WHERE id = p_company_id
  FOR NO KEY UPDATE;

  PERFORM private.assert_module_access(p_company_id, ARRAY['productos'], 'operate');

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
$function$;

-- update_product_cost(uuid,uuid,numeric): productos (operate) [2 verificación(es)]
CREATE OR REPLACE FUNCTION public.update_product_cost(p_company_id uuid, p_product_id uuid, p_cost_price numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id UUID;
BEGIN
  IF p_company_id IS NULL OR p_product_id IS NULL THEN
    RAISE EXCEPTION 'Los identificadores de empresa y producto son obligatorios.';
  END IF;

  -- 1. Autorización inicial y bloqueo de empresa + revalidación anti-TOCTOU
  PERFORM private.assert_module_access(p_company_id, ARRAY['productos'], 'operate');

  PERFORM 1
  FROM public.companies
  WHERE id = p_company_id
  FOR NO KEY UPDATE;

  PERFORM private.assert_module_access(p_company_id, ARRAY['productos'], 'operate');
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
$function$;

-- bulk_update_prices(uuid,uuid,uuid[],numeric,numeric): productos (operate) [2 verificación(es)]
CREATE OR REPLACE FUNCTION public.bulk_update_prices(p_company_id uuid, p_category_id uuid DEFAULT NULL::uuid, p_product_ids uuid[] DEFAULT NULL::uuid[], p_percentage numeric DEFAULT 0.00, p_fixed_delta numeric DEFAULT 0.00)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_updated_count INTEGER := 0;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'El identificador de empresa (p_company_id) es obligatorio.';
  END IF;

  -- 1. Autorización inicial y bloqueo de empresa + revalidación anti-TOCTOU
  PERFORM private.assert_module_access(p_company_id, ARRAY['productos'], 'operate');

  PERFORM 1
  FROM public.companies
  WHERE id = p_company_id
  FOR NO KEY UPDATE;

  PERFORM private.assert_module_access(p_company_id, ARRAY['productos'], 'operate');

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
$function$;

-- upsert_category(uuid,text,text,uuid,boolean): productos (operate) [2 verificación(es)]
CREATE OR REPLACE FUNCTION public.upsert_category(p_company_id uuid, p_name text, p_description text DEFAULT NULL::text, p_category_id uuid DEFAULT NULL::uuid, p_is_active boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_clean_name TEXT;
  v_clean_desc TEXT;
  v_category_id UUID;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'El identificador de empresa (p_company_id) es obligatorio.';
  END IF;

  -- 1. Autorización inicial y bloqueo de empresa + revalidación anti-TOCTOU
  PERFORM private.assert_module_access(p_company_id, ARRAY['productos'], 'operate');

  PERFORM 1
  FROM public.companies
  WHERE id = p_company_id
  FOR NO KEY UPDATE;

  PERFORM private.assert_module_access(p_company_id, ARRAY['productos'], 'operate');

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
$function$;

-- import_products(uuid,jsonb,text): productos (operate) [2 verificación(es)]
CREATE OR REPLACE FUNCTION public.import_products(p_company_id uuid, p_products jsonb, p_on_duplicate text DEFAULT 'error'::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  PERFORM private.assert_module_access(p_company_id, ARRAY['productos'], 'operate');

  PERFORM 1
  FROM public.companies
  WHERE id = p_company_id
  FOR NO KEY UPDATE;

  PERFORM private.assert_module_access(p_company_id, ARRAY['productos'], 'operate');
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
$function$;

-- import_initial_stock(uuid,uuid,jsonb): productos (operate) [2 verificación(es)]
CREATE OR REPLACE FUNCTION public.import_initial_stock(p_company_id uuid, p_idempotency_key uuid, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_company_active BOOLEAN;
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

  -- 1.1 Validación inicial rápida de membresía y rol (falla rápido antes del bloqueo)
  PERFORM private.assert_module_access(p_company_id, ARRAY['productos'], 'operate');

  -- 1.2 Bloqueo pesimista de fila en public.companies (FOR NO KEY UPDATE)
  --     Serializa contra transacciones administrativas concurrentes (p. ej. deactivate_member con FOR UPDATE)
  --     y verifica explícitamente la existencia y vigencia de la empresa.
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

  -- 1.3 Revalidación obligatoria de membresía y rol tras adquirir el bloqueo de empresa
  --     Si una desactivación concurrente confirmó antes de que este bloqueo se liberara,
  --     el llamador verá is_active = false y será rechazado inmediatamente.
  PERFORM private.assert_module_access(p_company_id, ARRAY['productos'], 'operate');

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
$function$;

-- register_stock_adjustment(uuid,uuid,uuid,text,text,numeric,text,text): productos (operate) [2 verificación(es)]
CREATE OR REPLACE FUNCTION public.register_stock_adjustment(p_company_id uuid, p_idempotency_key uuid, p_product_id uuid, p_direction text, p_reason text, p_quantity numeric, p_notes text DEFAULT NULL::text, p_reference_doc text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_company_active BOOLEAN;
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

  -- 1.1 Validación inicial rápida de membresía y rol (falla rápido antes del bloqueo)
  PERFORM private.assert_module_access(p_company_id, ARRAY['productos'], 'operate');

  -- 1.2 Bloqueo pesimista de fila en public.companies (FOR NO KEY UPDATE)
  --     Serializa contra transacciones administrativas concurrentes (p. ej. deactivate_member con FOR UPDATE)
  --     y verifica explícitamente la existencia y vigencia de la empresa.
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

  -- 1.3 Revalidación obligatoria de membresía y rol tras adquirir el bloqueo de empresa
  --     Si una desactivación concurrente confirmó antes de que este bloqueo se liberara,
  --     el llamador verá is_active = false y será rechazado inmediatamente.
  PERFORM private.assert_module_access(p_company_id, ARRAY['productos'], 'operate');

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
$function$;

-- register_physical_count(uuid,uuid,uuid,numeric,text,text): productos (operate) [2 verificación(es)]
CREATE OR REPLACE FUNCTION public.register_physical_count(p_company_id uuid, p_idempotency_key uuid, p_product_id uuid, p_counted_quantity numeric, p_notes text DEFAULT NULL::text, p_reference_doc text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  PERFORM private.assert_module_access(p_company_id, ARRAY['productos'], 'operate');

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
  PERFORM private.assert_module_access(p_company_id, ARRAY['productos'], 'operate');

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
$function$;

-- upsert_customer(uuid,text,text,text,text,text,text,text,uuid,boolean): clientes (operate) [2 verificación(es)]
CREATE OR REPLACE FUNCTION public.upsert_customer(p_company_id uuid, p_name text, p_identification_type text DEFAULT 'DNI'::text, p_tax_id text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_address text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_customer_id uuid DEFAULT NULL::uuid, p_is_active boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_caller_id UUID := auth.uid();
  v_clean_name TEXT;
  v_clean_id_type TEXT;
  v_clean_tax_id TEXT;
  v_clean_email TEXT;
  v_clean_phone TEXT;
  v_clean_address TEXT;
  v_clean_notes TEXT;
  v_customer_id UUID;
  v_old_customer RECORD;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Acceso denegado: usuario no autenticado.';
  END IF;

  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'El identificador de empresa (p_company_id) es obligatorio.';
  END IF;

  -- 1. Autorización estricta: Exclusivo para master_admin activo de la empresa
  PERFORM private.assert_module_access(p_company_id, ARRAY['clientes'], 'operate');

  -- Bloqueo anti-TOCTOU
  PERFORM 1 FROM public.companies WHERE id = p_company_id FOR NO KEY UPDATE;
  PERFORM private.assert_module_access(p_company_id, ARRAY['clientes'], 'operate');

  -- 2. Limpieza y normalización
  v_clean_name    := pg_catalog.btrim(COALESCE(p_name, ''));
  v_clean_id_type := pg_catalog.upper(pg_catalog.btrim(COALESCE(p_identification_type, 'DNI')));
  v_clean_tax_id  := NULLIF(pg_catalog.btrim(COALESCE(p_tax_id, '')), '');
  v_clean_email   := NULLIF(pg_catalog.lower(pg_catalog.btrim(COALESCE(p_email, ''))), '');
  v_clean_phone   := NULLIF(pg_catalog.btrim(COALESCE(p_phone, '')), '');
  v_clean_address := NULLIF(pg_catalog.btrim(COALESCE(p_address, '')), '');
  v_clean_notes   := NULLIF(pg_catalog.btrim(COALESCE(p_notes, '')), '');

  -- 3. Validaciones
  IF v_clean_name = '' OR pg_catalog.length(v_clean_name) > 200 THEN
    RAISE EXCEPTION 'El nombre del cliente es obligatorio y no puede superar 200 caracteres.';
  END IF;

  IF v_clean_id_type NOT IN ('DNI', 'CUIT', 'CUIL', 'PASAPORTE', 'OTRO', 'EXTRANJERO') THEN
    RAISE EXCEPTION 'Tipo de identificación inválido: %. Solo se permiten DNI, CUIT, CUIL, PASAPORTE, OTRO o EXTRANJERO.', v_clean_id_type;
  END IF;

  IF v_clean_tax_id IS NOT NULL THEN
    IF pg_catalog.length(v_clean_tax_id) > 30 THEN
      RAISE EXCEPTION 'El número de identificación no puede superar 30 caracteres.';
    END IF;

    IF v_clean_id_type IN ('CUIT', 'CUIL') AND NOT public.validate_cuit(v_clean_tax_id) THEN
      RAISE EXCEPTION 'El CUIT/CUIL ingresado no es válido según el algoritmo oficial.';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.customers
      WHERE company_id = p_company_id
        AND tax_id = v_clean_tax_id
        AND (p_customer_id IS NULL OR id != p_customer_id)
    ) THEN
      RAISE EXCEPTION 'Ya existe un cliente registrado con la identificación % en esta empresa.', v_clean_tax_id;
    END IF;
  END IF;

  IF v_clean_email IS NOT NULL AND v_clean_email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
    RAISE EXCEPTION 'El correo electrónico del cliente no tiene un formato válido.';
  END IF;

  -- 4. Operación atómica de inserción o actualización
  IF p_customer_id IS NULL THEN
    INSERT INTO public.customers (
      company_id,
      name,
      identification_type,
      tax_id,
      email,
      phone,
      address,
      notes,
      is_active,
      created_by
    ) VALUES (
      p_company_id,
      v_clean_name,
      v_clean_id_type,
      v_clean_tax_id,
      v_clean_email,
      v_clean_phone,
      v_clean_address,
      v_clean_notes,
      COALESCE(p_is_active, true),
      v_caller_id
    )
    RETURNING id INTO v_customer_id;

    -- Auditoría atómica de alta
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
      'customers',
      v_customer_id::TEXT,
      'INSERT',
      pg_catalog.jsonb_build_object(
        'name', v_clean_name,
        'identification_type', v_clean_id_type,
        'tax_id', v_clean_tax_id,
        'is_active', COALESCE(p_is_active, true)
      ),
      v_caller_id,
      'master_admin'
    );
  ELSE
    SELECT * INTO v_old_customer
    FROM public.customers
    WHERE id = p_customer_id
      AND company_id = p_company_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cliente no encontrado en la empresa especificada.';
    END IF;

    UPDATE public.customers
    SET name = v_clean_name,
        identification_type = v_clean_id_type,
        tax_id = v_clean_tax_id,
        email = v_clean_email,
        phone = v_clean_phone,
        address = v_clean_address,
        notes = v_clean_notes,
        is_active = COALESCE(p_is_active, true),
        updated_at = pg_catalog.now()
    WHERE id = p_customer_id
      AND company_id = p_company_id
    RETURNING id INTO v_customer_id;

    -- Auditoría atómica de actualización
    INSERT INTO public.audit_log (
      company_id,
      table_name,
      record_id,
      action,
      old_data,
      new_data,
      performed_by,
      actor_role
    ) VALUES (
      p_company_id,
      'customers',
      v_customer_id::TEXT,
      'UPDATE',
      pg_catalog.jsonb_build_object(
        'name', v_old_customer.name,
        'identification_type', v_old_customer.identification_type,
        'tax_id', v_old_customer.tax_id,
        'is_active', v_old_customer.is_active
      ),
      pg_catalog.jsonb_build_object(
        'name', v_clean_name,
        'identification_type', v_clean_id_type,
        'tax_id', v_clean_tax_id,
        'is_active', COALESCE(p_is_active, true)
      ),
      v_caller_id,
      'master_admin'
    );
  END IF;

  RETURN v_customer_id;
END;
$function$;

-- upsert_supplier(uuid,text,text,text,text,text,text,uuid,boolean): proveedores (operate) [2 verificación(es)]
CREATE OR REPLACE FUNCTION public.upsert_supplier(p_company_id uuid, p_name text, p_contact_name text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_address text DEFAULT NULL::text, p_tax_id text DEFAULT NULL::text, p_supplier_id uuid DEFAULT NULL::uuid, p_is_active boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  PERFORM private.assert_module_access(p_company_id, ARRAY['proveedores'], 'operate');

  PERFORM 1
  FROM public.companies
  WHERE id = p_company_id
  FOR NO KEY UPDATE;

  PERFORM private.assert_module_access(p_company_id, ARRAY['proveedores'], 'operate');

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
$function$;

-- private.lock_company_for_cash(uuid): caja (operate) [2 verificación(es)]
CREATE OR REPLACE FUNCTION private.lock_company_for_cash(p_company_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_company_active BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'Falta indicar la empresa.';
  END IF;

  PERFORM private.assert_module_access(p_company_id, ARRAY['caja'], 'operate');

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

  -- Revalidación tras el bloqueo
  PERFORM private.assert_module_access(p_company_id, ARRAY['caja'], 'operate');
END;
$function$;

-- cancel_sale: exige el módulo anular_ventas (operar)
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

-- ----------------------------------------------------------------------------
-- 3. LECTURAS (RLS): del rol fijo al permiso por módulo
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "cash_sessions_select_member" ON public.cash_sessions;
DROP POLICY IF EXISTS "cash_sessions_select_module" ON public.cash_sessions;
CREATE POLICY "cash_sessions_select_module" ON public.cash_sessions FOR SELECT TO authenticated
  USING (company_id IN (SELECT private.my_accessible_company_ids()) AND private.has_module_level(company_id, ARRAY['caja'], 'view'));

DROP POLICY IF EXISTS "cash_movements_select_member" ON public.cash_movements;
DROP POLICY IF EXISTS "cash_movements_select_module" ON public.cash_movements;
CREATE POLICY "cash_movements_select_module" ON public.cash_movements FOR SELECT TO authenticated
  USING (company_id IN (SELECT private.my_accessible_company_ids()) AND private.has_module_level(company_id, ARRAY['caja'], 'view'));

DROP POLICY IF EXISTS "product_costs_select_admin" ON public.product_costs;
DROP POLICY IF EXISTS "product_costs_select_module" ON public.product_costs;
CREATE POLICY "product_costs_select_module" ON public.product_costs FOR SELECT TO authenticated
  USING (company_id IN (SELECT private.my_active_company_ids()) AND private.has_module_level(company_id, ARRAY['productos'], 'view'));

DROP POLICY IF EXISTS "movement_costs_select_admin" ON public.movement_costs;
DROP POLICY IF EXISTS "movement_costs_select_module" ON public.movement_costs;
CREATE POLICY "movement_costs_select_module" ON public.movement_costs FOR SELECT TO authenticated
  USING (company_id IN (SELECT private.my_active_company_ids()) AND private.has_module_level(company_id, ARRAY['productos'], 'view'));

DROP POLICY IF EXISTS "suppliers_select_member" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_select_module" ON public.suppliers;
CREATE POLICY "suppliers_select_module" ON public.suppliers FOR SELECT TO authenticated
  USING (company_id IN (SELECT private.my_accessible_company_ids()) AND private.has_module_level(company_id, ARRAY['proveedores', 'compras', 'gastos', 'cobros_pagos'], 'view'));

