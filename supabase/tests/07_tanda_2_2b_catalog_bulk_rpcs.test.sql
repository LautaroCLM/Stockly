-- ============================================================================
-- SUITE DE PRUEBAS: TANDA 2.2B (MIGRACIÓN 5) - RPCS MASIVAS DE CATÁLOGO
-- Archivo: supabase/tests/07_tanda_2_2b_catalog_bulk_rpcs.test.sql
-- Objetivo: Verificar en TDD (Rojo -> Verde):
--   1. Existencia, SECURITY DEFINER, search_path = '' y ACLs efectivas de:
--      - public.bulk_update_prices(UUID, UUID, UUID[], NUMERIC, NUMERIC)
--      - public.import_products(UUID, JSONB, TEXT)
--   2. Autorización estricta para master_admin activo; rechazo de employee
--      y de administradores de otra empresa.
--   3. bulk_update_prices: filtro por categoría y por lista de productos,
--      combinación de porcentaje y delta fijo según especificación, redondeo
--      a 2 decimales, piso en 0.00, preservación de current_stock, aislamiento
--      multi-tenant y auditoría en audit_log.
--   4. import_products: alta masiva con creación atómica de product_costs
--      (cost_price y updated_by = auth.uid()), modos 'error', 'update'
--      (preservando current_stock) y 'skip', atomicidad ante lote inválido,
--      rechazo de referencias cruzadas entre empresas y auditoría.
-- Total de aserciones: 26
-- ============================================================================

BEGIN;
SELECT plan(26);

CREATE EXTENSION IF NOT EXISTS pgtap;

-- ============================================================================
-- 0. CONFIGURACIÓN DEL ENTORNO DE PRUEBAS (FIXTURE AISLADO)
-- ============================================================================
CREATE TEMP TABLE test_ctx_22b_m5 (
  key TEXT PRIMARY KEY,
  id UUID NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE test_ctx_22b_m5 TO authenticated, anon;

CREATE TEMP TABLE test_res_22b_m5 (
  key TEXT PRIMARY KEY,
  val INTEGER NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE test_res_22b_m5 TO authenticated, anon;

DO $$
DECLARE
  v_admin_a UUID := 'aaaa0005-0000-0000-0000-000000000001';
  v_emp_a   UUID := 'aaaa0005-0000-0000-0000-000000000002';
  v_admin_b UUID := 'bbbb0005-0000-0000-0000-000000000001';
  v_comp_a  UUID;
  v_comp_b  UUID;
  v_cat_a1  UUID;
  v_cat_a2  UUID;
  v_sup_a1  UUID;
  v_cat_b   UUID;
  v_sup_b   UUID;
  v_prod_a1 UUID;
  v_prod_a2 UUID;
  v_prod_a3 UUID;
  v_prod_b1 UUID;
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
  VALUES
    (v_admin_a, 'admin_a_m5@stockly.test', '{"full_name": "Admin A M5"}'::jsonb, now(), now()),
    (v_emp_a,   'emp_a_m5@stockly.test',   '{"full_name": "Emp A M5"}'::jsonb,   now(), now()),
    (v_admin_b, 'admin_b_m5@stockly.test', '{"full_name": "Admin B M5"}'::jsonb, now(), now());

  PERFORM set_config('request.jwt.claim.sub', v_admin_a::text, true);
  v_comp_a := public.create_company('Empresa A M5 S.A.', '30-71111111-1', 'ARS', 'America/Argentina/Buenos_Aires');

  INSERT INTO public.company_members (company_id, user_id, role, is_active)
  VALUES (v_comp_a, v_emp_a, 'employee', true);

  -- Categorías y proveedor en Empresa A
  v_cat_a1 := public.upsert_category(v_comp_a, 'Ferretería General', 'Categoría 1 A');
  v_cat_a2 := public.upsert_category(v_comp_a, 'Pinturería', 'Categoría 2 A');
  v_sup_a1 := public.upsert_supplier(v_comp_a, 'Proveedor Mayorista A', 'Contacto A', 'prov_a@stockly.test', '11-1111-2222', 'Calle 1', '30-71111111-1');

  -- Productos iniciales en Empresa A con stock cargado
  v_prod_a1 := public.create_product(v_comp_a, 'BULK-A1', 'Martillo Galponero', 'unidad', 1000.00, 600.00, 2, NULL, NULL, v_cat_a1, v_sup_a1);
  v_prod_a2 := public.create_product(v_comp_a, 'BULK-A2', 'Destornillador Phillips', 'unidad', 2000.00, 1100.00, 5, NULL, NULL, v_cat_a1, v_sup_a1);
  v_prod_a3 := public.create_product(v_comp_a, 'BULK-A3', 'Látex Interior 20L', 'unidad', 500.00, 300.00, 1, NULL, NULL, v_cat_a2, v_sup_a1);

  INSERT INTO public.stock_movements (company_id, product_id, direction, reason, quantity, notes, created_by)
  VALUES
    (v_comp_a, v_prod_a1, 'increase', 'initial_load', 10.00, 'Carga inicial A1', v_admin_a),
    (v_comp_a, v_prod_a2, 'increase', 'initial_load', 5.00,  'Carga inicial A2', v_admin_a),
    (v_comp_a, v_prod_a3, 'increase', 'initial_load', 3.00,  'Carga inicial A3', v_admin_a);

  -- Empresa B y sus datos aislados
  PERFORM set_config('request.jwt.claim.sub', v_admin_b::text, true);
  v_comp_b := public.create_company('Empresa B M5 S.A.', '30-70000004-0', 'ARS', 'America/Argentina/Buenos_Aires');
  v_cat_b  := public.upsert_category(v_comp_b, 'Categoría B M5', 'De Empresa B');
  v_sup_b  := public.upsert_supplier(v_comp_b, 'Proveedor B M5', NULL, NULL, NULL, NULL, '30-70000004-0');
  v_prod_b1 := public.create_product(v_comp_b, 'BULK-B1', 'Producto Empresa B', 'unidad', 900.00, 450.00, 1, NULL, NULL, v_cat_b, v_sup_b);

  INSERT INTO test_ctx_22b_m5 VALUES
    ('comp_a', v_comp_a),
    ('comp_b', v_comp_b),
    ('cat_a1', v_cat_a1),
    ('cat_a2', v_cat_a2),
    ('sup_a1', v_sup_a1),
    ('cat_b',  v_cat_b),
    ('sup_b',  v_sup_b),
    ('prod_a1', v_prod_a1),
    ('prod_a2', v_prod_a2),
    ('prod_a3', v_prod_a3),
    ('prod_b1', v_prod_b1);
END $$;

-- ============================================================================
-- BLOQUE 1: EXISTENCIA, SECURITY DEFINER, SEARCH_PATH Y ACLs (T-01 a T-04)
-- ============================================================================

-- T-01: Existencia de public.bulk_update_prices(uuid, uuid, uuid[], numeric, numeric)
SELECT has_function(
  'public',
  'bulk_update_prices',
  ARRAY['uuid', 'uuid', 'uuid[]', 'numeric', 'numeric'],
  'T-01: Debe existir la RPC public.bulk_update_prices(uuid, uuid, uuid[], numeric, numeric).'
);

-- T-02: Existencia de public.import_products(uuid, jsonb, text)
SELECT has_function(
  'public',
  'import_products',
  ARRAY['uuid', 'jsonb', 'text'],
  'T-02: Debe existir la RPC public.import_products(uuid, jsonb, text).'
);

-- T-03: Seguridad y ACL efectiva de bulk_update_prices
SELECT is(
  (
    SELECT
      p.prosecdef = true
      AND COALESCE('search_path=""' = ANY(p.proconfig) OR 'search_path=''''' = ANY(p.proconfig), false)
      AND pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
        WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
      )
    FROM pg_catalog.pg_proc p
    WHERE p.oid = pg_catalog.to_regprocedure('public.bulk_update_prices(uuid,uuid,uuid[],numeric,numeric)')
  ),
  true,
  'T-03: bulk_update_prices debe ser SECURITY DEFINER, con search_path vacío y EXECUTE exclusivo para authenticated (sin PUBLIC ni anon).'
);

-- T-04: Seguridad y ACL efectiva de import_products
SELECT is(
  (
    SELECT
      p.prosecdef = true
      AND COALESCE('search_path=""' = ANY(p.proconfig) OR 'search_path=''''' = ANY(p.proconfig), false)
      AND pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
        WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
      )
    FROM pg_catalog.pg_proc p
    WHERE p.oid = pg_catalog.to_regprocedure('public.import_products(uuid,jsonb,text)')
  ),
  true,
  'T-04: import_products debe ser SECURITY DEFINER, con search_path vacío y EXECUTE exclusivo para authenticated (sin PUBLIC ni anon).'
);

-- ============================================================================
-- BLOQUE 2: AUTORIZACIÓN Y AISLAMIENTO DE ROLES / EMPRESAS (T-05 a T-08)
-- ============================================================================

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaa0005-0000-0000-0000-000000000002', true);

-- T-05: employee no puede ejecutar bulk_update_prices
SELECT throws_ok(
  $$
    SELECT public.bulk_update_prices(
      (SELECT id FROM test_ctx_22b_m5 WHERE key = 'comp_a'),
      NULL,
      NULL,
      10.00,
      0.00
    );
  $$,
  'P0001',
  'Operación restringida a usuarios con rol master_admin en esta empresa (rol actual: employee).',
  'T-05: employee debe ser rechazado al invocar bulk_update_prices.'
);

-- T-06: employee no puede ejecutar import_products
SELECT throws_ok(
  $$
    SELECT public.import_products(
      (SELECT id FROM test_ctx_22b_m5 WHERE key = 'comp_a'),
      '[{"sku":"EMP-IMP","name":"Intento Empleado"}]'::jsonb,
      'error'
    );
  $$,
  'P0001',
  'Operación restringida a usuarios con rol master_admin en esta empresa (rol actual: employee).',
  'T-06: employee debe ser rechazado al invocar import_products.'
);

-- Cambiar a master_admin de Empresa A
SELECT set_config('request.jwt.claim.sub', 'aaaa0005-0000-0000-0000-000000000001', true);

-- T-07: master_admin de Empresa A no puede ejecutar bulk_update_prices sobre Empresa B
SELECT throws_ok(
  $$
    SELECT public.bulk_update_prices(
      (SELECT id FROM test_ctx_22b_m5 WHERE key = 'comp_b'),
      NULL,
      NULL,
      15.00,
      0.00
    );
  $$,
  'P0001',
  'El usuario no es un miembro activo de esta empresa.',
  'T-07: master_admin de Empresa A no debe poder ejecutar bulk_update_prices en Empresa B.'
);

-- T-08: master_admin de Empresa A no puede ejecutar import_products sobre Empresa B
SELECT throws_ok(
  $$
    SELECT public.import_products(
      (SELECT id FROM test_ctx_22b_m5 WHERE key = 'comp_b'),
      '[{"sku":"CROSS-B","name":"Intento en B"}]'::jsonb,
      'error'
    );
  $$,
  'P0001',
  'El usuario no es un miembro activo de esta empresa.',
  'T-08: master_admin de Empresa A no debe poder ejecutar import_products en Empresa B.'
);

-- ============================================================================
-- BLOQUE 3: COMPORTAMIENTO DE public.bulk_update_prices (T-09 a T-14)
-- ============================================================================

-- T-09: Actualización masiva por categoría combinando porcentaje (+10%) y delta fijo (+50.255)
SELECT lives_ok(
  $$
    INSERT INTO test_res_22b_m5 (key, val)
    VALUES (
      'bulk_cat_a1',
      public.bulk_update_prices(
        (SELECT id FROM test_ctx_22b_m5 WHERE key = 'comp_a'),
        (SELECT id FROM test_ctx_22b_m5 WHERE key = 'cat_a1'),
        NULL,
        10.00,
        50.255
      )
    );
  $$,
  'T-09: bulk_update_prices debe actualizar por categoría combinando porcentaje y delta fijo.'
);

-- T-10: Verificar cálculo exacto ROUND(price * (1 + pct/100) + delta, 2), stock intacto, exclusión de otra categoría y auditoría
SELECT results_eq(
  $$
    SELECT
      (SELECT val FROM test_res_22b_m5 WHERE key = 'bulk_cat_a1'),
      (SELECT selling_price FROM public.products WHERE id = (SELECT id FROM test_ctx_22b_m5 WHERE key = 'prod_a1')),
      (SELECT current_stock FROM public.products WHERE id = (SELECT id FROM test_ctx_22b_m5 WHERE key = 'prod_a1')),
      (SELECT selling_price FROM public.products WHERE id = (SELECT id FROM test_ctx_22b_m5 WHERE key = 'prod_a2')),
      (SELECT current_stock FROM public.products WHERE id = (SELECT id FROM test_ctx_22b_m5 WHERE key = 'prod_a2')),
      (SELECT selling_price FROM public.products WHERE id = (SELECT id FROM test_ctx_22b_m5 WHERE key = 'prod_a3')),
      (
        SELECT count(*)::INT
        FROM public.audit_log
        WHERE company_id = (SELECT id FROM test_ctx_22b_m5 WHERE key = 'comp_a')
          AND table_name = 'products'
          AND action = 'UPDATE'
          AND record_id IN (
            (SELECT id::text FROM test_ctx_22b_m5 WHERE key = 'prod_a1'),
            (SELECT id::text FROM test_ctx_22b_m5 WHERE key = 'prod_a2')
          )
      )
  $$,
  $$
    VALUES (
      2::int,
      1150.26::numeric(14,2),
      10.00::numeric(12,2),
      2250.26::numeric(14,2),
      5.00::numeric(12,2),
      500.00::numeric(14,2),
      2::int
    )
  $$,
  'T-10: bulk_update_prices debe retornar 2, redondear a 2 decimales (1150.26 y 2250.26), preservar current_stock, no tocar cat_a2 y auditar 2 UPDATE.'
);

-- T-11: Actualización por lista de IDs aplicando piso de 0.00 (GREATEST(0.00, ...))
SELECT lives_ok(
  $$
    INSERT INTO test_res_22b_m5 (key, val)
    VALUES (
      'bulk_floor_a3',
      public.bulk_update_prices(
        (SELECT id FROM test_ctx_22b_m5 WHERE key = 'comp_a'),
        NULL,
        ARRAY[(SELECT id FROM test_ctx_22b_m5 WHERE key = 'prod_a3')],
        -50.00,
        -1000.00
      )
    );
  $$,
  'T-11: bulk_update_prices por lista de productos con rebaja mayor al precio debe ejecutarse aplicando límite inferior 0.00.'
);

-- T-12: Verificar piso 0.00 y preservación de current_stock en prod_a3
SELECT results_eq(
  $$
    SELECT
      (SELECT val FROM test_res_22b_m5 WHERE key = 'bulk_floor_a3'),
      p.selling_price,
      p.current_stock
    FROM public.products p
    WHERE p.id = (SELECT id FROM test_ctx_22b_m5 WHERE key = 'prod_a3')
  $$,
  $$
    VALUES (
      1::int,
      0.00::numeric(14,2),
      3.00::numeric(12,2)
    )
  $$,
  'T-12: bulk_update_prices debe truncar en 0.00 el precio resultante negativo y conservar current_stock = 3.00.'
);

-- T-13: Aislamiento entre empresas al pasar p_product_ids de Empresa B o arreglo vacío desde Empresa A
SELECT lives_ok(
  $$
    INSERT INTO test_res_22b_m5 (key, val)
    VALUES (
      'bulk_cross_b1',
      public.bulk_update_prices(
        (SELECT id FROM test_ctx_22b_m5 WHERE key = 'comp_a'),
        NULL,
        ARRAY[(SELECT id FROM test_ctx_22b_m5 WHERE key = 'prod_b1')],
        99.00,
        500.00
      ) + public.bulk_update_prices(
        (SELECT id FROM test_ctx_22b_m5 WHERE key = 'comp_a'),
        NULL,
        ARRAY[]::UUID[],
        50.00,
        0.00
      )
    );
  $$,
  'T-13: bulk_update_prices con IDs de otra empresa o lista vacía debe ejecutarse retornando 0 afectados.'
);

RESET ROLE;

-- T-14: Comprobar como superusuario que prod_b1 en Empresa B sigue intacto en 900.00 y que el conteo retornado fue 0
SELECT results_eq(
  $$
    SELECT
      (SELECT val FROM test_res_22b_m5 WHERE key = 'bulk_cross_b1'),
      (SELECT selling_price FROM public.products WHERE id = (SELECT id FROM test_ctx_22b_m5 WHERE key = 'prod_b1'))
  $$,
  $$
    VALUES (
      0::int,
      900.00::numeric(14,2)
    )
  $$,
  'T-14: bulk_update_prices no debe modificar productos de otra empresa aunque se pasen sus UUIDs en p_product_ids.'
);

-- ============================================================================
-- BLOQUE 4: COMPORTAMIENTO DE public.import_products (T-15 a T-26)
-- ============================================================================

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaa0005-0000-0000-0000-000000000001', true);

-- T-15: Importación válida de varios productos nuevos con creación atómica de product_costs
SELECT lives_ok(
  $$
    INSERT INTO test_res_22b_m5 (key, val)
    VALUES (
      'imp_initial',
      public.import_products(
        (SELECT id FROM test_ctx_22b_m5 WHERE key = 'comp_a'),
        jsonb_build_array(
          jsonb_build_object(
            'sku', '  imp-001  ',
            'barcode', '7790001000011',
            'name', '  Sierra Circular 7 1/4  ',
            'description', '1400W profesional',
            'category_id', (SELECT id FROM test_ctx_22b_m5 WHERE key = 'cat_a1'),
            'supplier_id', (SELECT id FROM test_ctx_22b_m5 WHERE key = 'sup_a1'),
            'unit', 'unidad',
            'selling_price', 85000.00,
            'cost_price', 45000.50,
            'min_stock', 3
          ),
          jsonb_build_object(
            'sku', 'IMP-002',
            'name', 'Cable Subterráneo 4mm',
            'unit', 'metro',
            'selling_price', 3200.00,
            'cost_price', 1800.25,
            'min_stock', 25.50
          )
        ),
        'error'
      )
    );
  $$,
  'T-15: import_products debe importar múltiples productos nuevos en una sola operación.'
);

-- T-16: Verificar productos creados, normalización de SKU/nombre, current_stock = 0.00, product_costs atómico y audit_log
SELECT results_eq(
  $$
    SELECT
      (SELECT val FROM test_res_22b_m5 WHERE key = 'imp_initial'),
      p.sku,
      p.name,
      p.unit,
      p.selling_price,
      p.min_stock,
      p.current_stock,
      pc.cost_price,
      pc.updated_by,
      (
        SELECT count(*)::INT
        FROM public.audit_log a
        WHERE a.company_id = p.company_id
          AND a.record_id = p.id::text
          AND a.table_name IN ('products', 'product_costs')
          AND a.action = 'INSERT'
      )
    FROM public.products p
    JOIN public.product_costs pc
      ON pc.company_id = p.company_id AND pc.product_id = p.id
    WHERE p.company_id = (SELECT id FROM test_ctx_22b_m5 WHERE key = 'comp_a')
      AND p.sku IN ('IMP-001', 'IMP-002')
    ORDER BY p.sku
  $$,
  $$
    VALUES
      (2::int, 'IMP-001'::text, 'Sierra Circular 7 1/4'::text, 'unidad'::text, 85000.00::numeric(14,2), 3.00::numeric(12,2),  0.00::numeric(12,2), 45000.50::numeric(14,2), 'aaaa0005-0000-0000-0000-000000000001'::uuid, 2::int),
      (2::int, 'IMP-002'::text, 'Cable Subterráneo 4mm'::text, 'metro'::text,   3200.00::numeric(14,2), 25.50::numeric(12,2), 0.00::numeric(12,2),  1800.25::numeric(14,2), 'aaaa0005-0000-0000-0000-000000000001'::uuid, 2::int)
  $$,
  'T-16: import_products debe normalizar SKU/nombre, iniciar current_stock = 0.00, insertar product_costs con updated_by = auth.uid() y auditar los INSERT.'
);

-- T-17: Modo p_on_duplicate = 'error' aborta todo el lote si un SKU ya existe
SELECT throws_ok(
  $$
    SELECT public.import_products(
      (SELECT id FROM test_ctx_22b_m5 WHERE key = 'comp_a'),
      jsonb_build_array(
        jsonb_build_object(
          'sku', 'IMP-ROLLBACK',
          'name', 'Producto Que Debe Revertirse',
          'unit', 'unidad',
          'selling_price', 1000.00
        ),
        jsonb_build_object(
          'sku', 'IMP-001',
          'name', 'Duplicado En Lote',
          'unit', 'unidad',
          'selling_price', 90000.00
        )
      ),
      'error'
    );
  $$,
  'P0001',
  'El SKU IMP-001 ya existe en el catálogo de esta empresa',
  'T-17: import_products con p_on_duplicate = error debe lanzar excepción al encontrar un SKU existente.'
);

-- T-18: Comprobar atomicidad del lote fallido (IMP-001 existe de T-15, pero IMP-ROLLBACK fue revertido)
SELECT is(
  (
    SELECT
      EXISTS (
        SELECT 1 FROM public.products
        WHERE company_id = (SELECT id FROM test_ctx_22b_m5 WHERE key = 'comp_a')
          AND sku = 'IMP-001'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.products
        WHERE company_id = (SELECT id FROM test_ctx_22b_m5 WHERE key = 'comp_a')
          AND sku = 'IMP-ROLLBACK'
      )
  ),
  true,
  'T-18: Si un lote de import_products falla en el segundo ítem, el primer ítem (IMP-ROLLBACK) no debe quedar persistido.'
);

-- Cargar stock (8 unidades) en IMP-001 y probar modo 'update' junto con un producto nuevo IMP-003
SELECT lives_ok(
  $$
    SELECT public.register_stock_adjustment(
      (SELECT id FROM test_ctx_22b_m5 WHERE key = 'comp_a'),
      '11111111-2222-3333-4444-555555550001'::UUID,
      (SELECT id FROM public.products WHERE company_id = (SELECT id FROM test_ctx_22b_m5 WHERE key = 'comp_a') AND sku = 'IMP-001'),
      'increase',
      'physical_count',
      8,
      'Stock antes de import update',
      'ADJ-IMP-01'
    );

    INSERT INTO test_res_22b_m5 (key, val)
    VALUES (
      'imp_update',
      public.import_products(
        (SELECT id FROM test_ctx_22b_m5 WHERE key = 'comp_a'),
        jsonb_build_array(
          jsonb_build_object(
            'sku', 'imp-001',
            'name', 'Sierra Circular 7 1/4 Pro',
            'unit', 'unidad',
            'selling_price', 92000.00,
            'cost_price', 48500.00,
            'min_stock', 4
          ),
          jsonb_build_object(
            'sku', 'IMP-003',
            'name', 'Disco Dentado Widia',
            'unit', 'unidad',
            'selling_price', 15000.00,
            'cost_price', 8200.00,
            'min_stock', 2
          )
        ),
        'update'
      )
    );
  $$,
  'T-19: import_products con p_on_duplicate = update debe actualizar productos existentes y crear los nuevos.'
);

-- T-20: Verificar que el modo 'update' actualizó IMP-001 (sin alterar current_stock = 8.00) y creó IMP-003
SELECT results_eq(
  $$
    SELECT
      (SELECT val FROM test_res_22b_m5 WHERE key = 'imp_update'),
      p.sku,
      p.name,
      p.selling_price,
      p.min_stock,
      p.current_stock,
      pc.cost_price
    FROM public.products p
    JOIN public.product_costs pc
      ON pc.company_id = p.company_id AND pc.product_id = p.id
    WHERE p.company_id = (SELECT id FROM test_ctx_22b_m5 WHERE key = 'comp_a')
      AND p.sku IN ('IMP-001', 'IMP-003')
    ORDER BY p.sku
  $$,
  $$
    VALUES
      (2::int, 'IMP-001'::text, 'Sierra Circular 7 1/4 Pro'::text, 92000.00::numeric(14,2), 4.00::numeric(12,2), 8.00::numeric(12,2), 48500.00::numeric(14,2)),
      (2::int, 'IMP-003'::text, 'Disco Dentado Widia'::text,       15000.00::numeric(14,2), 2.00::numeric(12,2), 0.00::numeric(12,2),  8200.00::numeric(14,2))
  $$,
  'T-20: En modo update, import_products debe retornar 2, preservar current_stock = 8.00 en IMP-001 y dar de alta IMP-003 con su costo.'
);

-- T-21: Modo p_on_duplicate = 'skip' ignora existentes sin modificarlos e inserta únicamente los nuevos
SELECT lives_ok(
  $$
    INSERT INTO test_res_22b_m5 (key, val)
    VALUES (
      'imp_skip',
      public.import_products(
        (SELECT id FROM test_ctx_22b_m5 WHERE key = 'comp_a'),
        jsonb_build_array(
          jsonb_build_object(
            'sku', 'IMP-001',
            'name', 'Nombre Que Debe Ignorarse En Skip',
            'unit', 'unidad',
            'selling_price', 1.00,
            'cost_price', 1.00,
            'min_stock', 99
          ),
          jsonb_build_object(
            'sku', 'IMP-004',
            'name', 'Guantes Moteados',
            'unit', 'par',
            'selling_price', 2500.00,
            'cost_price', 1200.00,
            'min_stock', 10
          )
        ),
        'skip'
      )
    );
  $$,
  'T-21: import_products con p_on_duplicate = skip debe omitir SKUs existentes e insertar los nuevos.'
);

-- T-22: Verificar que 'skip' retornó 1 (solo IMP-004) y que IMP-001 no sufrió ninguna modificación
SELECT results_eq(
  $$
    SELECT
      (SELECT val FROM test_res_22b_m5 WHERE key = 'imp_skip'),
      p.sku,
      p.name,
      p.selling_price,
      p.current_stock,
      pc.cost_price
    FROM public.products p
    JOIN public.product_costs pc
      ON pc.company_id = p.company_id AND pc.product_id = p.id
    WHERE p.company_id = (SELECT id FROM test_ctx_22b_m5 WHERE key = 'comp_a')
      AND p.sku IN ('IMP-001', 'IMP-004')
    ORDER BY p.sku
  $$,
  $$
    VALUES
      (1::int, 'IMP-001'::text, 'Sierra Circular 7 1/4 Pro'::text, 92000.00::numeric(14,2), 8.00::numeric(12,2), 48500.00::numeric(14,2)),
      (1::int, 'IMP-004'::text, 'Guantes Moteados'::text,           2500.00::numeric(14,2), 0.00::numeric(12,2),  1200.00::numeric(14,2))
  $$,
  'T-22: En modo skip, import_products debe retornar 1, dejar IMP-001 intacto e insertar IMP-004 con su costo.'
);

-- T-23: Rechazo de p_on_duplicate inválido
SELECT throws_ok(
  $$
    SELECT public.import_products(
      (SELECT id FROM test_ctx_22b_m5 WHERE key = 'comp_a'),
      '[{"sku":"IMP-005","name":"Test"}]'::jsonb,
      'overwrite'
    );
  $$,
  'P0001',
  'Opción p_on_duplicate inválida: overwrite',
  'T-23: import_products debe rechazar valores de p_on_duplicate distintos de error, update o skip.'
);

-- T-24: Rechazo de campos obligatorios (sku o name vacíos/nulos)
SELECT throws_ok(
  $$
    SELECT public.import_products(
      (SELECT id FROM test_ctx_22b_m5 WHERE key = 'comp_a'),
      '[{"sku":"   ","name":"Producto Sin SKU"}]'::jsonb,
      'error'
    );
  $$,
  'P0001',
  'SKU y Nombre son campos obligatorios',
  'T-24: import_products debe rechazar ítems sin SKU o sin Nombre.'
);

-- T-25: Rechazo de category_id perteneciente a otra empresa
SELECT throws_ok(
  $$
    SELECT public.import_products(
      (SELECT id FROM test_ctx_22b_m5 WHERE key = 'comp_a'),
      jsonb_build_array(
        jsonb_build_object(
          'sku', 'IMP-CROSS-CAT',
          'name', 'Producto Con Categoria B',
          'category_id', (SELECT id FROM test_ctx_22b_m5 WHERE key = 'cat_b')
        )
      ),
      'error'
    );
  $$,
  'P0001',
  'La categoría especificada no existe o no pertenece a la empresa.',
  'T-25: import_products debe rechazar una category_id perteneciente a otra empresa.'
);

-- T-26: Rechazo de supplier_id perteneciente a otra empresa
SELECT throws_ok(
  $$
    SELECT public.import_products(
      (SELECT id FROM test_ctx_22b_m5 WHERE key = 'comp_a'),
      jsonb_build_array(
        jsonb_build_object(
          'sku', 'IMP-CROSS-SUP',
          'name', 'Producto Con Proveedor B',
          'supplier_id', (SELECT id FROM test_ctx_22b_m5 WHERE key = 'sup_b')
        )
      ),
      'error'
    );
  $$,
  'P0001',
  'El proveedor especificado no existe o no pertenece a la empresa.',
  'T-26: import_products debe rechazar un supplier_id perteneciente a otra empresa.'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
