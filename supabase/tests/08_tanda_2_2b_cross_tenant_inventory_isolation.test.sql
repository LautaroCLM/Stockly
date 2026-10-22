-- ============================================================================
-- SUITE DE PRUEBAS TDD (pgTAP) - TANDA 2.2B (PASO 21)
-- Módulo: Aislamiento Cross-Tenant de Productos en register_stock_adjustment
--         e import_initial_stock
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
-- Estado: SUITE AISLADA E INDEPENDIENTE (Transacción con ROLLBACK)
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(10);

-- ============================================================================
-- 1. ARNÉS DE PERMISOS PARA EJECUCIÓN DE ASERCIONES BAJO ROL authenticated
-- ============================================================================
DO $$
DECLARE
  r RECORD;
  v_schema TEXT;
BEGIN
  SELECT n.nspname INTO v_schema
  FROM pg_catalog.pg_extension e
  JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pgtap';

  IF v_schema IS NOT NULL THEN
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO authenticated;', v_schema);
  END IF;

  FOR r IN
    SELECT n.nspname AS schema_name, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_catalog.pg_depend d ON d.objid = p.oid
    JOIN pg_catalog.pg_extension e ON e.oid = d.refobjid
    WHERE e.extname = 'pgtap'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated;', r.schema_name, r.proname, r.args);
  END LOOP;
END;
$$;

-- ============================================================================
-- 2. SETUP INDEPENDIENTE: Dos Empresas (A y B) con sus Propios Productos
-- ============================================================================
CREATE TEMP TABLE test_ctx_22b_s08 (
  key TEXT PRIMARY KEY,
  id UUID
);
GRANT SELECT, INSERT, UPDATE ON TABLE test_ctx_22b_s08 TO authenticated;

INSERT INTO auth.users (id, email) VALUES
  ('aaaa0008-0000-0000-0000-000000000001', 'admin_s08_a@stockly.local'),
  ('aaaa0008-0000-0000-0000-000000000002', 'admin_s08_b@stockly.local');

-- Crear Empresa A (admin_s08_a)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0008-0000-0000-0000-000000000001';
SET LOCAL "request.jwt.claim.email" = 'admin_s08_a@stockly.local';

SELECT public.create_company('Empresa S08 Alpha', '30-71111111-1') AS comp_s08_a_id \gset
INSERT INTO test_ctx_22b_s08 VALUES ('comp_a', :'comp_s08_a_id');

-- Crear Empresa B (admin_s08_b)
SET LOCAL "request.jwt.claim.sub" = 'aaaa0008-0000-0000-0000-000000000002';
SET LOCAL "request.jwt.claim.email" = 'admin_s08_b@stockly.local';

SELECT public.create_company('Empresa S08 Beta', '30-70000004-0') AS comp_s08_b_id \gset
INSERT INTO test_ctx_22b_s08 VALUES ('comp_b', :'comp_s08_b_id');

RESET ROLE;

DO $$
DECLARE
  v_comp_a UUID := (SELECT id FROM test_ctx_22b_s08 WHERE key = 'comp_a');
  v_comp_b UUID := (SELECT id FROM test_ctx_22b_s08 WHERE key = 'comp_b');
  v_prod_a_init UUID;
  v_prod_b_adj UUID;
  v_prod_b_init UUID;
BEGIN
  -- Producto en Empresa A con stock 0.00 (para probar lote mixto en import_initial_stock)
  INSERT INTO public.products (company_id, sku, name, unit, selling_price, min_stock, current_stock)
  VALUES (v_comp_a, 'S08-A-INIT', 'Producto Propio A Stock Cero', 'unidad', 1000.00, 0.00, 0.00)
  RETURNING id INTO v_prod_a_init;

  -- Producto en Empresa B con stock 10.00 (para probar register_stock_adjustment cross-tenant)
  INSERT INTO public.products (company_id, sku, name, unit, selling_price, min_stock, current_stock)
  VALUES (v_comp_b, 'S08-B-ADJ', 'Producto Ajeno B Con Stock', 'unidad', 2500.00, 2.00, 10.00)
  RETURNING id INTO v_prod_b_adj;

  INSERT INTO public.product_costs (company_id, product_id, cost_price, updated_by)
  VALUES (v_comp_b, v_prod_b_adj, 1200.00, 'aaaa0008-0000-0000-0000-000000000002');

  -- Producto en Empresa B con stock 0.00 y sin movimientos (para probar import_initial_stock cross-tenant)
  INSERT INTO public.products (company_id, sku, name, unit, selling_price, min_stock, current_stock)
  VALUES (v_comp_b, 'S08-B-INIT', 'Producto Ajeno B Stock Cero', 'unidad', 1800.00, 0.00, 0.00)
  RETURNING id INTO v_prod_b_init;

  INSERT INTO test_ctx_22b_s08 VALUES
    ('prod_a_init', v_prod_a_init),
    ('prod_b_adj', v_prod_b_adj),
    ('prod_b_init', v_prod_b_init),
    ('key_adj_inc', '88880000-0000-0000-0000-000000000001'::UUID),
    ('key_adj_dec', '88880000-0000-0000-0000-000000000002'::UUID),
    ('key_init_single', '88880000-0000-0000-0000-000000000003'::UUID),
    ('key_init_mixed', '88880000-0000-0000-0000-000000000004'::UUID);
END;
$$;

-- ============================================================================
-- 3. ASERCIONES: AISLAMIENTO CROSS-TENANT EN register_stock_adjustment
-- ============================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0008-0000-0000-0000-000000000001';
SET LOCAL "request.jwt.claim.email" = 'admin_s08_a@stockly.local';

-- T-01: Admin de Empresa A intenta incrementar stock de un product_id de Empresa B
SELECT throws_ok(
  format(
    'SELECT public.register_stock_adjustment(%L::UUID, %L::UUID, %L::UUID, ''increase'', ''physical_count'', 5.00, ''Intento cross-tenant increase'')',
    (SELECT id FROM test_ctx_22b_s08 WHERE key = 'comp_a'),
    (SELECT id FROM test_ctx_22b_s08 WHERE key = 'key_adj_inc'),
    (SELECT id FROM test_ctx_22b_s08 WHERE key = 'prod_b_adj')
  ),
  'P0001',
  format(
    'Producto %s no encontrado en la empresa %s para sincronización de stock.',
    (SELECT id FROM test_ctx_22b_s08 WHERE key = 'prod_b_adj'),
    (SELECT id FROM test_ctx_22b_s08 WHERE key = 'comp_a')
  ),
  'T-01: register_stock_adjustment (increase) debe rechazar un product_id perteneciente a otra empresa.'
);

-- T-02: Admin de Empresa A intenta decrementar stock de un product_id de Empresa B
SELECT throws_ok(
  format(
    'SELECT public.register_stock_adjustment(%L::UUID, %L::UUID, %L::UUID, ''decrease'', ''loss_damage'', 3.00, ''Intento cross-tenant decrease'')',
    (SELECT id FROM test_ctx_22b_s08 WHERE key = 'comp_a'),
    (SELECT id FROM test_ctx_22b_s08 WHERE key = 'key_adj_dec'),
    (SELECT id FROM test_ctx_22b_s08 WHERE key = 'prod_b_adj')
  ),
  'P0001',
  format(
    'Producto %s no encontrado en la empresa %s para sincronización de stock.',
    (SELECT id FROM test_ctx_22b_s08 WHERE key = 'prod_b_adj'),
    (SELECT id FROM test_ctx_22b_s08 WHERE key = 'comp_a')
  ),
  'T-02: register_stock_adjustment (decrease) debe rechazar un product_id perteneciente a otra empresa.'
);

RESET ROLE;

-- T-03: El saldo de prod_b_adj en Empresa B debe permanecer intacto (10.00)
SELECT is(
  (SELECT current_stock FROM public.products WHERE id = (SELECT id FROM test_ctx_22b_s08 WHERE key = 'prod_b_adj')),
  10.00,
  'T-03: El rechazo cross-tenant en register_stock_adjustment no debe alterar current_stock del producto de Empresa B.'
);

-- T-04: No deben haberse creado movimientos en stock_movements ni en movement_costs
SELECT is(
  (
    SELECT count(*)::INT
    FROM public.stock_movements
    WHERE product_id = (SELECT id FROM test_ctx_22b_s08 WHERE key = 'prod_b_adj')
       OR company_id = (SELECT id FROM test_ctx_22b_s08 WHERE key = 'comp_a')
  ),
  0,
  'T-04: El rechazo cross-tenant en register_stock_adjustment no debe crear filas en stock_movements.'
);

-- T-05: No deben persistir registros en operation_idempotency para las claves fallidas
SELECT is(
  (
    SELECT count(*)::INT
    FROM public.operation_idempotency
    WHERE idempotency_key IN (
      (SELECT id FROM test_ctx_22b_s08 WHERE key = 'key_adj_inc'),
      (SELECT id FROM test_ctx_22b_s08 WHERE key = 'key_adj_dec')
    )
  ),
  0,
  'T-05: El rechazo cross-tenant en register_stock_adjustment debe revertir cualquier reserva en operation_idempotency.'
);

-- ============================================================================
-- 4. ASERCIONES: AISLAMIENTO CROSS-TENANT EN import_initial_stock
-- ============================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0008-0000-0000-0000-000000000001';
SET LOCAL "request.jwt.claim.email" = 'admin_s08_a@stockly.local';

-- T-06: Admin de Empresa A intenta carga inicial sobre un producto de Empresa B
SELECT throws_ok(
  format(
    'SELECT public.import_initial_stock(%L::UUID, %L::UUID, jsonb_build_array(jsonb_build_object(''product_id'', %L::UUID, ''quantity'', 20.00, ''unit_cost'', 500.00)))',
    (SELECT id FROM test_ctx_22b_s08 WHERE key = 'comp_a'),
    (SELECT id FROM test_ctx_22b_s08 WHERE key = 'key_init_single'),
    (SELECT id FROM test_ctx_22b_s08 WHERE key = 'prod_b_init')
  ),
  'P0001',
  format(
    'Producto %s no encontrado o no pertenece a la empresa %s.',
    (SELECT id FROM test_ctx_22b_s08 WHERE key = 'prod_b_init'),
    (SELECT id FROM test_ctx_22b_s08 WHERE key = 'comp_a')
  ),
  'T-06: import_initial_stock debe rechazar un product_id perteneciente a otra empresa.'
);

-- T-07: Admin de Empresa A intenta carga inicial con lote mixto (prod_a_init válido + prod_b_init ajeno)
SELECT throws_ok(
  format(
    'SELECT public.import_initial_stock(%L::UUID, %L::UUID, jsonb_build_array(jsonb_build_object(''product_id'', %L::UUID, ''quantity'', 15.00, ''unit_cost'', 400.00), jsonb_build_object(''product_id'', %L::UUID, ''quantity'', 25.00, ''unit_cost'', 600.00)))',
    (SELECT id FROM test_ctx_22b_s08 WHERE key = 'comp_a'),
    (SELECT id FROM test_ctx_22b_s08 WHERE key = 'key_init_mixed'),
    (SELECT id FROM test_ctx_22b_s08 WHERE key = 'prod_a_init'),
    (SELECT id FROM test_ctx_22b_s08 WHERE key = 'prod_b_init')
  ),
  'P0001',
  format(
    'Producto %s no encontrado o no pertenece a la empresa %s.',
    (SELECT id FROM test_ctx_22b_s08 WHERE key = 'prod_b_init'),
    (SELECT id FROM test_ctx_22b_s08 WHERE key = 'comp_a')
  ),
  'T-07: import_initial_stock debe abortar todo el lote si incluye un product_id perteneciente a otra empresa.'
);

RESET ROLE;

-- T-08: Tanto prod_b_init (Empresa B) como prod_a_init (Empresa A) deben conservar current_stock = 0.00
SELECT is(
  (
    SELECT ARRAY[
      (SELECT current_stock FROM public.products WHERE id = (SELECT id FROM test_ctx_22b_s08 WHERE key = 'prod_a_init')),
      (SELECT current_stock FROM public.products WHERE id = (SELECT id FROM test_ctx_22b_s08 WHERE key = 'prod_b_init'))
    ]
  ),
  ARRAY[0.00, 0.00]::NUMERIC[],
  'T-08: El rechazo en import_initial_stock debe preservar intacto el saldo 0.00 tanto del producto ajeno como del propio en lote mixto.'
);

-- T-09: No deben existir movimientos ni costos creados para prod_a_init ni prod_b_init
SELECT is(
  (
    SELECT (
      (SELECT count(*)::INT FROM public.stock_movements WHERE product_id IN (
        (SELECT id FROM test_ctx_22b_s08 WHERE key = 'prod_a_init'),
        (SELECT id FROM test_ctx_22b_s08 WHERE key = 'prod_b_init')
      )) +
      (SELECT count(*)::INT FROM public.product_costs WHERE product_id IN (
        (SELECT id FROM test_ctx_22b_s08 WHERE key = 'prod_a_init'),
        (SELECT id FROM test_ctx_22b_s08 WHERE key = 'prod_b_init')
      ))
    )
  ),
  0,
  'T-09: El rechazo en import_initial_stock no debe crear movimientos ni costos de producto.'
);

-- T-10: No deben persistir filas en operation_idempotency para las claves de import_initial_stock fallidas
SELECT is(
  (
    SELECT count(*)::INT
    FROM public.operation_idempotency
    WHERE idempotency_key IN (
      (SELECT id FROM test_ctx_22b_s08 WHERE key = 'key_init_single'),
      (SELECT id FROM test_ctx_22b_s08 WHERE key = 'key_init_mixed')
    )
  ),
  0,
  'T-10: El rechazo cross-tenant en import_initial_stock no debe dejar filas persistidas en operation_idempotency.'
);

SELECT * FROM finish();

ROLLBACK;
