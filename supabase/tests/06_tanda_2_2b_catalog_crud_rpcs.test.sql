-- ============================================================================
-- SUITE DE PRUEBAS: TANDA 2.2B (MIGRACIÓN 4) - RPCS DE CRUD DE CATÁLOGO
-- Archivo: supabase/tests/06_tanda_2_2b_catalog_crud_rpcs.test.sql
-- Objetivo: Verificar en TDD (Rojo -> Verde):
--   1. Existencia, SECURITY DEFINER, search_path = '' y ACLs de:
--      - public.upsert_category
--      - public.upsert_supplier
--      - public.create_product
--      - public.update_product
--      - public.update_product_cost
--   2. Restricción estricta a master_admin activo (employee y anon rechazados).
--   3. Creación atómica de product_costs en create_product, preservación
--      intacta de current_stock en update_product, validaciones de negocio,
--      aislamiento multi-tenant y auditoría automática en audit_log.
-- Total de aserciones: 28
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(28);

-- ============================================================================
-- 0. CONFIGURACIÓN DEL ENTORNO DE PRUEBAS (FIXTURE AISLADO)
-- ============================================================================
CREATE TEMP TABLE test_ctx_22b_m4 (
  key TEXT PRIMARY KEY,
  id UUID NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE test_ctx_22b_m4 TO authenticated, anon;

DO $$
DECLARE
  v_admin_a UUID := 'aaaa0004-0000-0000-0000-000000000001';
  v_emp_a   UUID := 'aaaa0004-0000-0000-0000-000000000002';
  v_admin_b UUID := 'bbbb0004-0000-0000-0000-000000000001';
  v_comp_a  UUID;
  v_comp_b  UUID;
  v_cat_b   UUID;
  v_sup_b   UUID;
  v_prod_b  UUID;
  v_prod_kg UUID;
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
  VALUES
    (v_admin_a, 'admin_a_m4@stockly.test', '{"full_name": "Admin A M4"}'::jsonb, now(), now()),
    (v_emp_a,   'emp_a_m4@stockly.test',   '{"full_name": "Emp A M4"}'::jsonb,   now(), now()),
    (v_admin_b, 'admin_b_m4@stockly.test', '{"full_name": "Admin B M4"}'::jsonb, now(), now());

  PERFORM set_config('request.jwt.claim.sub', v_admin_a::text, true);
  v_comp_a := public.create_company('Empresa A M4 S.A.', '30-71111111-1', 'ARS', 'America/Argentina/Buenos_Aires');

  INSERT INTO public.company_members (company_id, user_id, role, is_active)
  VALUES (v_comp_a, v_emp_a, 'employee', true);

  PERFORM set_config('request.jwt.claim.sub', v_admin_b::text, true);
  v_comp_b := public.create_company('Empresa B M4 S.A.', '30-70000004-0', 'ARS', 'America/Argentina/Buenos_Aires');

  -- Sembrar categoría, proveedor y producto en Empresa B para pruebas anti-cruce de tenant
  INSERT INTO public.categories (company_id, name, description)
  VALUES (v_comp_b, 'Categoria B M4', 'De Empresa B')
  RETURNING id INTO v_cat_b;

  INSERT INTO public.suppliers (company_id, name, tax_id)
  VALUES (v_comp_b, 'Proveedor B M4', '30-70000004-0')
  RETURNING id INTO v_sup_b;

  INSERT INTO public.products (company_id, sku, name, unit, selling_price, min_stock)
  VALUES (v_comp_b, 'PROD-B-M4', 'Producto B M4', 'unidad', 500.00, 1)
  RETURNING id INTO v_prod_b;

  -- Sembrar producto en kg en Empresa A con stock fraccionario (1.50 kg) para T-22..T-24
  INSERT INTO public.products (company_id, sku, name, unit, selling_price, min_stock)
  VALUES (v_comp_a, 'PROD-KG-M4', 'Arena a Granel', 'kg', 1200.00, 0.50)
  RETURNING id INTO v_prod_kg;

  INSERT INTO public.product_costs (company_id, product_id, cost_price, updated_by)
  VALUES (v_comp_a, v_prod_kg, 600.00, v_admin_a);

  INSERT INTO public.stock_movements (
    company_id, product_id, direction, reason, quantity, notes, created_by
  ) VALUES (
    v_comp_a, v_prod_kg, 'increase', 'initial_load', 1.50, 'Carga fraccionaria', v_admin_a
  );

  INSERT INTO test_ctx_22b_m4 VALUES
    ('comp_a', v_comp_a),
    ('comp_b', v_comp_b),
    ('cat_b', v_cat_b),
    ('sup_b', v_sup_b),
    ('prod_b', v_prod_b),
    ('prod_kg', v_prod_kg);
END $$;

-- ============================================================================
-- BLOQUE 1: EXISTENCIA, SECURITY DEFINER, SEARCH_PATH = '' Y ACLs (T-01 a T-03)
-- ============================================================================

-- T-01: Las 5 funciones existen, son SECURITY DEFINER y tienen search_path = ''
SELECT is(
  (
    SELECT count(*)::INT
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'upsert_category',
        'upsert_supplier',
        'create_product',
        'update_product',
        'update_product_cost'
      )
      AND p.prosecdef = true
      AND COALESCE('search_path=""' = ANY(p.proconfig) OR 'search_path=''''' = ANY(p.proconfig), false)
  ),
  5,
  'T-01: Las 5 RPCs de CRUD de catálogo deben existir, ser SECURITY DEFINER y fijar search_path = ''''.'
);

-- T-02: anon no tiene privilegio EXECUTE en ninguna de las 5 RPCs (y sí existen las 5)
SELECT is(
  (
    SELECT count(*)::INT
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'upsert_category',
        'upsert_supplier',
        'create_product',
        'update_product',
        'update_product_cost'
      )
      AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
  ),
  5,
  'T-02: El rol anon debe tener revocado EXECUTE en las 5 RPCs de CRUD de catálogo.'
);

-- T-03: authenticated tiene privilegio EXECUTE en las 5 RPCs
SELECT is(
  (
    SELECT count(*)::INT
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'upsert_category',
        'upsert_supplier',
        'create_product',
        'update_product',
        'update_product_cost'
      )
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
  ),
  5,
  'T-03: El rol authenticated debe tener EXECUTE concedido en las 5 RPCs de CRUD de catálogo.'
);

-- ============================================================================
-- BLOQUE 2: DENEGACIÓN A EMPLEADOS (T-04 a T-08)
-- ============================================================================

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaa0004-0000-0000-0000-000000000002', true);

-- T-04: employee rechazado en upsert_category
SELECT throws_ok(
  $$
    SELECT public.upsert_category(
      (SELECT id FROM test_ctx_22b_m4 WHERE key = 'comp_a'),
      'Categoria Empleado'
    );
  $$,
  'P0001',
  'Operación restringida a usuarios con rol master_admin en esta empresa (rol actual: employee).',
  'T-04: employee no debe poder ejecutar upsert_category.'
);

-- T-05: employee rechazado en upsert_supplier
SELECT throws_ok(
  $$
    SELECT public.upsert_supplier(
      (SELECT id FROM test_ctx_22b_m4 WHERE key = 'comp_a'),
      'Proveedor Empleado'
    );
  $$,
  'P0001',
  'Operación restringida a usuarios con rol master_admin en esta empresa (rol actual: employee).',
  'T-05: employee no debe poder ejecutar upsert_supplier.'
);

-- T-06: employee rechazado en create_product
SELECT throws_ok(
  $$
    SELECT public.create_product(
      (SELECT id FROM test_ctx_22b_m4 WHERE key = 'comp_a'),
      'SKU-EMP-01',
      'Producto Empleado'
    );
  $$,
  'P0001',
  'Operación restringida a usuarios con rol master_admin en esta empresa (rol actual: employee).',
  'T-06: employee no debe poder ejecutar create_product.'
);

-- T-07: employee rechazado en update_product
SELECT throws_ok(
  $$
    SELECT public.update_product(
      (SELECT id FROM test_ctx_22b_m4 WHERE key = 'comp_a'),
      (SELECT id FROM test_ctx_22b_m4 WHERE key = 'prod_kg'),
      'PROD-KG-M4',
      'Intento Empleado',
      'kg',
      1500.00,
      0.50
    );
  $$,
  'P0001',
  'Operación restringida a usuarios con rol master_admin en esta empresa (rol actual: employee).',
  'T-07: employee no debe poder ejecutar update_product.'
);

-- T-08: employee rechazado en update_product_cost
SELECT throws_ok(
  $$
    SELECT public.update_product_cost(
      (SELECT id FROM test_ctx_22b_m4 WHERE key = 'comp_a'),
      (SELECT id FROM test_ctx_22b_m4 WHERE key = 'prod_kg'),
      999.00
    );
  $$,
  'P0001',
  'Operación restringida a usuarios con rol master_admin en esta empresa (rol actual: employee).',
  'T-08: employee no debe poder ejecutar update_product_cost.'
);

-- ============================================================================
-- BLOQUE 3: CATEGORÍAS Y PROVEEDORES (T-09 a T-16)
-- ============================================================================

-- Cambiar a master_admin de Empresa A
SELECT set_config('request.jwt.claim.sub', 'aaaa0004-0000-0000-0000-000000000001', true);

-- T-09: upsert_category crea categoría nueva y luego la actualiza con p_category_id
SELECT lives_ok(
  $$
    INSERT INTO test_ctx_22b_m4 (key, id)
    VALUES (
      'cat_a',
      public.upsert_category(
        (SELECT id FROM test_ctx_22b_m4 WHERE key = 'comp_a'),
        '  Herramientas Eléctricas  ',
        'Taladros y amoladoras'
      )
    );

    SELECT public.upsert_category(
      (SELECT id FROM test_ctx_22b_m4 WHERE key = 'comp_a'),
      '  Herramientas Industriales  ',
      'Línea pesada actualizada',
      (SELECT id FROM test_ctx_22b_m4 WHERE key = 'cat_a'),
      true
    );
  $$,
  'T-09: upsert_category debe crear y actualizar una categoría para master_admin.'
);

-- T-10: Verificar en public.categories y public.audit_log el resultado de T-09 (sin invocar la RPC fuera de lives_ok)
SELECT results_eq(
  $$
    SELECT
      c.name,
      c.description,
      c.is_active,
      (
        SELECT count(*)::INT
        FROM public.audit_log a
        WHERE a.company_id = c.company_id
          AND a.table_name = 'categories'
          AND a.record_id = c.id::text
          AND a.action IN ('INSERT', 'UPDATE')
      )
    FROM public.categories c
    WHERE c.id = (SELECT id FROM test_ctx_22b_m4 WHERE key = 'cat_a')
  $$,
  $$
    VALUES (
      'Herramientas Industriales'::text,
      'Línea pesada actualizada'::text,
      true,
      2::int
    )
  $$,
  'T-10: upsert_category debe persistir nombre normalizado (btrim), descripción e is_active, y auditar INSERT + UPDATE.'
);

-- T-11: upsert_category rechaza nombre vacío o solo espacios
SELECT throws_ok(
  $$
    SELECT public.upsert_category(
      (SELECT id FROM test_ctx_22b_m4 WHERE key = 'comp_a'),
      '   ',
      'Nombre invalido'
    );
  $$,
  'P0001',
  'El nombre de la categoría es obligatorio y no puede superar 100 caracteres.',
  'T-11: upsert_category debe rechazar nombres vacíos o compuestos solo por espacios.'
);

-- T-12: upsert_category rechaza categoría de otra empresa
SELECT throws_ok(
  $$
    SELECT public.upsert_category(
      (SELECT id FROM test_ctx_22b_m4 WHERE key = 'comp_a'),
      'Intento Cruce Tenant',
      'Desc',
      (SELECT id FROM test_ctx_22b_m4 WHERE key = 'cat_b'),
      true
    );
  $$,
  'P0001',
  'Categoría no encontrada en la empresa especificada.',
  'T-12: upsert_category debe rechazar actualizar un p_category_id perteneciente a otra empresa.'
);

-- T-13: upsert_supplier crea y actualiza proveedor con CUIT válido
SELECT lives_ok(
  $$
    INSERT INTO test_ctx_22b_m4 (key, id)
    VALUES (
      'sup_a',
      public.upsert_supplier(
        (SELECT id FROM test_ctx_22b_m4 WHERE key = 'comp_a'),
        '  Distribuidora Sur S.R.L.  ',
        'Juan Pérez',
        'ventas@distsur.com.ar',
        '11-4444-5555',
        'Av. Mitre 1234',
        '30-71111111-1'
      )
    );

    SELECT public.upsert_supplier(
      (SELECT id FROM test_ctx_22b_m4 WHERE key = 'comp_a'),
      '  Distribuidora Sur S.R.L.  ',
      'María Gómez',
      'ventas@distsur.com.ar',
      '11-4444-5555',
      'Av. Mitre 1234',
      '30-71111111-1',
      (SELECT id FROM test_ctx_22b_m4 WHERE key = 'sup_a'),
      true
    );
  $$,
  'T-13: upsert_supplier debe crear y actualizar un proveedor válido con CUIT verificado.'
);

-- T-14: Verificar en public.suppliers y public.audit_log el resultado de T-13
SELECT results_eq(
  $$
    SELECT
      s.name,
      s.contact_name,
      s.tax_id,
      (
        SELECT count(*)::INT
        FROM public.audit_log a
        WHERE a.company_id = s.company_id
          AND a.table_name = 'suppliers'
          AND a.record_id = s.id::text
          AND a.action IN ('INSERT', 'UPDATE')
      )
    FROM public.suppliers s
    WHERE s.id = (SELECT id FROM test_ctx_22b_m4 WHERE key = 'sup_a')
  $$,
  $$
    VALUES (
      'Distribuidora Sur S.R.L.'::text,
      'María Gómez'::text,
      '30-71111111-1'::text,
      2::int
    )
  $$,
  'T-14: upsert_supplier debe persistir nombre normalizado (btrim), contacto y CUIT, y auditar INSERT + UPDATE.'
);

-- T-15: upsert_supplier rechaza CUIT inválido con P0001
SELECT throws_ok(
  $$
    SELECT public.upsert_supplier(
      (SELECT id FROM test_ctx_22b_m4 WHERE key = 'comp_a'),
      'Proveedor CUIT Malo',
      NULL,
      NULL,
      NULL,
      NULL,
      '20-12345678-9'
    );
  $$,
  'P0001',
  'El CUIT del proveedor no es válido.',
  'T-15: upsert_supplier debe rechazar un CUIT inválido con mensaje claro.'
);

-- T-16: upsert_supplier rechaza proveedor de otra empresa
SELECT throws_ok(
  $$
    SELECT public.upsert_supplier(
      (SELECT id FROM test_ctx_22b_m4 WHERE key = 'comp_a'),
      'Intento Cruce Proveedor',
      NULL,
      NULL,
      NULL,
      NULL,
      '30-71111111-1',
      (SELECT id FROM test_ctx_22b_m4 WHERE key = 'sup_b'),
      true
    );
  $$,
  'P0001',
  'Proveedor no encontrado en la empresa especificada.',
  'T-16: upsert_supplier debe rechazar actualizar un p_supplier_id perteneciente a otra empresa.'
);

-- ============================================================================
-- BLOQUE 4: PRODUCTOS Y COSTOS (T-17 a T-28)
-- ============================================================================

-- T-17: create_product crea producto + product_costs atómicamente con SKU normalizado y current_stock = 0.00
SELECT lives_ok(
  $$
    INSERT INTO test_ctx_22b_m4 (key, id)
    VALUES (
      'prod_a',
      public.create_product(
        (SELECT id FROM test_ctx_22b_m4 WHERE key = 'comp_a'),
        '  tal-001  ',
        '  Taladro Percutor 750W  ',
        'unidad',
        125000.00,
        82500.50,
        5,
        '7791234567890',
        'Taladro industrial con maletín',
        (SELECT id FROM test_ctx_22b_m4 WHERE key = 'cat_a'),
        (SELECT id FROM test_ctx_22b_m4 WHERE key = 'sup_a')
      )
    );
  $$,
  'T-17: create_product debe dar de alta el producto y su costo inicial en una única transacción.'
);

-- T-18: Verificar datos del producto creado y su fila atómica en product_costs + audit_log
SELECT results_eq(
  $$
    SELECT
      p.sku,
      p.name,
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
    WHERE p.id = (SELECT id FROM test_ctx_22b_m4 WHERE key = 'prod_a')
  $$,
  $$
    VALUES (
      'TAL-001'::text,
      'Taladro Percutor 750W'::text,
      0.00::numeric(12,2),
      82500.50::numeric(14,2),
      'aaaa0004-0000-0000-0000-000000000001'::uuid,
      2::int
    )
  $$,
  'T-18: create_product debe normalizar SKU y nombre, fijar current_stock = 0.00, poblar product_costs y auditar ambos INSERT.'
);

-- T-19: create_product rechaza category_id de otra empresa
SELECT throws_ok(
  $$
    SELECT public.create_product(
      (SELECT id FROM test_ctx_22b_m4 WHERE key = 'comp_a'),
      'SKU-CROSS-CAT',
      'Producto Cat Ajena',
      'unidad',
      1000.00,
      500.00,
      0,
      NULL,
      NULL,
      (SELECT id FROM test_ctx_22b_m4 WHERE key = 'cat_b'),
      NULL
    );
  $$,
  'P0001',
  'La categoría especificada no existe o no pertenece a la empresa.',
  'T-19: create_product debe rechazar una category_id perteneciente a otra empresa.'
);

-- T-20: create_product rechaza supplier_id de otra empresa
SELECT throws_ok(
  $$
    SELECT public.create_product(
      (SELECT id FROM test_ctx_22b_m4 WHERE key = 'comp_a'),
      'SKU-CROSS-SUP',
      'Producto Sup Ajeno',
      'unidad',
      1000.00,
      500.00,
      0,
      NULL,
      NULL,
      NULL,
      (SELECT id FROM test_ctx_22b_m4 WHERE key = 'sup_b')
    );
  $$,
  'P0001',
  'El proveedor especificado no existe o no pertenece a la empresa.',
  'T-20: create_product debe rechazar un supplier_id perteneciente a otra empresa.'
);

-- T-21: create_product rechaza min_stock decimal en unidad indivisible ('unidad')
SELECT throws_ok(
  $$
    SELECT public.create_product(
      (SELECT id FROM test_ctx_22b_m4 WHERE key = 'comp_a'),
      'SKU-DEC-MIN',
      'Producto Unidad con Decimal',
      'unidad',
      1000.00,
      500.00,
      2.50
    );
  $$,
  'P0001',
  'La unidad de medida seleccionada no admite decimales en el stock mínimo.',
  'T-21: create_product debe rechazar min_stock con decimales para unidades indivisibles.'
);

-- T-22: update_product ejecuta dentro de lives_ok para no abortar la suite en fase roja
SELECT lives_ok(
  $$
    SELECT public.update_product(
      (SELECT id FROM test_ctx_22b_m4 WHERE key = 'comp_a'),
      (SELECT id FROM test_ctx_22b_m4 WHERE key = 'prod_kg'),
      '  prod-kg-m4-new  ',
      '  Arena Fina Lavada  ',
      'kg',
      1850.00,
      2.00,
      '7790000111222',
      'Bolsones o granel',
      (SELECT id FROM test_ctx_22b_m4 WHERE key = 'cat_a'),
      (SELECT id FROM test_ctx_22b_m4 WHERE key = 'sup_a'),
      false
    );
  $$,
  'T-22: update_product debe ejecutarse sin error para un master_admin activo.'
);

-- T-23: Verificar en public.products y public.audit_log el resultado de T-22 (incluyendo current_stock intacto)
SELECT results_eq(
  $$
    SELECT
      p.sku,
      p.name,
      p.selling_price,
      p.is_active,
      p.current_stock,
      (
        SELECT count(*)::INT
        FROM public.audit_log a
        WHERE a.company_id = p.company_id
          AND a.table_name = 'products'
          AND a.record_id = p.id::text
          AND a.action = 'UPDATE'
      )
    FROM public.products p
    WHERE p.id = (SELECT id FROM test_ctx_22b_m4 WHERE key = 'prod_kg')
  $$,
  $$
    VALUES (
      'PROD-KG-M4-NEW'::text,
      'Arena Fina Lavada'::text,
      1850.00::numeric(14,2),
      false,
      1.50::numeric(12,2),
      1::int
    )
  $$,
  'T-23: update_product debe actualizar SKU, nombre, precio e is_active, auditar el UPDATE y conservar intacto current_stock = 1.50.'
);

-- T-24: update_product rechaza cambiar unit a 'unidad' cuando current_stock tiene decimales (1.50)
SELECT throws_ok(
  $$
    SELECT public.update_product(
      (SELECT id FROM test_ctx_22b_m4 WHERE key = 'comp_a'),
      (SELECT id FROM test_ctx_22b_m4 WHERE key = 'prod_kg'),
      'PROD-KG-M4-NEW',
      'Arena Fina Lavada',
      'unidad',
      1850.00,
      2.00
    );
  $$,
  'P0001',
  'No se puede cambiar a una unidad indivisible mientras el producto tenga stock fraccionario.',
  'T-24: update_product debe impedir cambiar a unidad indivisible si current_stock es fraccionario.'
);

-- T-25: update_product rechaza operar sobre otra empresa
SELECT throws_ok(
  $$
    SELECT public.update_product(
      (SELECT id FROM test_ctx_22b_m4 WHERE key = 'comp_b'),
      (SELECT id FROM test_ctx_22b_m4 WHERE key = 'prod_b'),
      'PROD-B-M4',
      'Hack B',
      'unidad',
      1.00,
      0
    );
  $$,
  'P0001',
  'El usuario no es un miembro activo de esta empresa.',
  'T-25: update_product debe rechazar a un master_admin de Empresa A intentando editar Empresa B.'
);

-- T-26: update_product_cost ejecuta dentro de lives_ok para no abortar la suite en fase roja
SELECT lives_ok(
  $$
    SELECT public.update_product_cost(
      (SELECT id FROM test_ctx_22b_m4 WHERE key = 'comp_a'),
      (SELECT id FROM test_ctx_22b_m4 WHERE key = 'prod_a'),
      91200.75
    );
  $$,
  'T-26: update_product_cost debe ejecutarse sin error para un master_admin activo.'
);

-- T-27: Verificar en public.product_costs y public.audit_log el resultado de T-26
SELECT results_eq(
  $$
    SELECT
      pc.cost_price,
      pc.updated_by,
      (
        SELECT count(*)::INT
        FROM public.audit_log a
        WHERE a.company_id = pc.company_id
          AND a.table_name = 'product_costs'
          AND a.record_id = pc.product_id::text
          AND a.action = 'UPDATE'
      )
    FROM public.product_costs pc
    WHERE pc.company_id = (SELECT id FROM test_ctx_22b_m4 WHERE key = 'comp_a')
      AND pc.product_id = (SELECT id FROM test_ctx_22b_m4 WHERE key = 'prod_a')
  $$,
  $$
    VALUES (
      91200.75::numeric(14,2),
      'aaaa0004-0000-0000-0000-000000000001'::uuid,
      1::int
    )
  $$,
  'T-27: update_product_cost debe actualizar cost_price, registrar updated_by y auditar el UPDATE en product_costs.'
);

-- T-28: update_product_cost rechaza costo negativo
SELECT throws_ok(
  $$
    SELECT public.update_product_cost(
      (SELECT id FROM test_ctx_22b_m4 WHERE key = 'comp_a'),
      (SELECT id FROM test_ctx_22b_m4 WHERE key = 'prod_a'),
      -10.00
    );
  $$,
  'P0001',
  'El precio de costo no puede ser negativo ni tener más de 2 decimales.',
  'T-28: update_product_cost debe rechazar valores negativos o con más de 2 decimales.'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
