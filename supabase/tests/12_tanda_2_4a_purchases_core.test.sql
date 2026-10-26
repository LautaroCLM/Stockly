-- ============================================================================
-- SUITE DE PRUEBAS AUTOMATIZADAS (pgTAP) - TANDA 2.4A
-- Módulo: Núcleo de Compras a Proveedores, Idempotencia, Costos y Stock
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
-- Archivo: 12_tanda_2_4a_purchases_core.test.sql
-- Estado: SUITE DE PRUEBAS AISLADA (Se ejecuta en transacción con ROLLBACK)
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(22);

-- ============================================================================
-- 1. ESTRATEGIA DE PERMISOS PARA EL ARNÉS DE PRUEBAS (TEST HARNESS)
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
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO authenticated, anon;', v_schema);
  END IF;

  FOR r IN
    SELECT n.nspname AS schema_name, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_catalog.pg_depend d ON d.objid = p.oid
    JOIN pg_catalog.pg_extension e ON e.oid = d.refobjid
    WHERE e.extname = 'pgtap'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated, anon;', r.schema_name, r.proname, r.args);
  END LOOP;
END;
$$;

-- ============================================================================
-- 2. SETUP DE CONTEXTO AISLADO
-- ============================================================================
CREATE TEMPORARY TABLE test_context (
  key TEXT PRIMARY KEY,
  id UUID,
  str TEXT
);
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE test_context TO authenticated, anon;

-- Usuarios de prueba en auth.users
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin_purchases_a@stockly.local'),
  ('22222222-2222-2222-2222-222222222222', 'emp_purchases_a@stockly.local'),
  ('33333333-3333-3333-3333-333333333333', 'admin_purchases_b@stockly.local'),
  ('44444444-4444-4444-4444-444444444444', 'intruder@stockly.local')
ON CONFLICT (id) DO NOTHING;

-- Crear Empresa A con CUIT verificado bajo Módulo 11 (30-71111111-1)
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111"}';
SELECT public.create_company('Empresa Compras A', '30-71111111-1', 'ARS', 'America/Argentina/Buenos_Aires');

INSERT INTO test_context (key, id)
SELECT 'company_a', id FROM public.companies WHERE name = 'Empresa Compras A';

-- Invitar a emp_purchases_a a Empresa A como employee
DO $$
DECLARE
  v_token TEXT;
BEGIN
  v_token := public.invite_user_to_company(
    (SELECT id FROM test_context WHERE key = 'company_a'),
    'emp_purchases_a@stockly.local',
    'employee'
  );
  PERFORM set_config('test.token_emp', v_token, true);
END;
$$;

-- Crear Empresa B con CUIT verificado (30-74444444-2)
SET LOCAL request.jwt.claims = '{"sub": "33333333-3333-3333-3333-333333333333"}';
SELECT public.create_company('Empresa Compras B', '30-74444444-2', 'ARS', 'America/Argentina/Buenos_Aires');

INSERT INTO test_context (key, id)
SELECT 'company_b', id FROM public.companies WHERE name = 'Empresa Compras B';

-- Aceptar invitación como emp_purchases_a en Empresa A
SET LOCAL request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222"}';
SELECT public.accept_company_invitation(current_setting('test.token_emp'));

RESET ROLE;

-- Configurar catálogo, proveedores y stock inicial en Empresa A y B
DO $$
DECLARE
  v_comp_a UUID;
  v_comp_b UUID;
  v_cat_a UUID;
  v_cat_b UUID;
  v_supp_active_a UUID;
  v_supp_inactive_a UUID;
  v_supp_b UUID;
  v_prod_1 UUID;
  v_prod_2 UUID;
  v_prod_inactive UUID;
  v_prod_b UUID;
BEGIN
  SELECT id INTO v_comp_a FROM test_context WHERE key = 'company_a';
  SELECT id INTO v_comp_b FROM test_context WHERE key = 'company_b';

  -- Categorías
  INSERT INTO public.categories (company_id, name)
  VALUES (v_comp_a, 'Ferretería General')
  RETURNING id INTO v_cat_a;

  INSERT INTO public.categories (company_id, name)
  VALUES (v_comp_b, 'Herramientas B')
  RETURNING id INTO v_cat_b;

  -- Proveedores Empresa A (Activo e Inactivo)
  INSERT INTO public.suppliers (company_id, name, contact_name, tax_id, is_active)
  VALUES (v_comp_a, 'Distribuidora Mayorista S.A.', 'Carlos Pérez', '30-71111111-1', true)
  RETURNING id INTO v_supp_active_a;

  INSERT INTO public.suppliers (company_id, name, contact_name, is_active)
  VALUES (v_comp_a, 'Proveedor Inactivo S.R.L.', 'Juan Inactivo', false)
  RETURNING id INTO v_supp_inactive_a;

  -- Proveedor Empresa B
  INSERT INTO public.suppliers (company_id, name, contact_name, tax_id, is_active)
  VALUES (v_comp_b, 'Proveedor Regional B S.A.', 'Martín B', '30-74444444-2', true)
  RETURNING id INTO v_supp_b;

  INSERT INTO test_context (key, id) VALUES
    ('supp_active_a', v_supp_active_a),
    ('supp_inactive_a', v_supp_inactive_a),
    ('supp_b', v_supp_b);

  -- Productos Empresa A:
  -- prod_1: unidad indivisible, stock inicial 10.00, costo inicial 30000.00
  INSERT INTO public.products (company_id, category_id, supplier_id, name, sku, unit, selling_price, current_stock, is_active)
  VALUES (v_comp_a, v_cat_a, v_supp_active_a, 'Taladro Percutor 750W', 'TAL-001', 'unidad', 50000.00, 10.00, true)
  RETURNING id INTO v_prod_1;

  INSERT INTO public.product_costs (company_id, product_id, cost_price, updated_by)
  VALUES (v_comp_a, v_prod_1, 30000.00, '11111111-1111-1111-1111-111111111111');

  -- prod_2: litros continuo, stock inicial 50.00, costo inicial 15000.00
  INSERT INTO public.products (company_id, category_id, supplier_id, name, sku, unit, selling_price, current_stock, is_active)
  VALUES (v_comp_a, v_cat_a, v_supp_active_a, 'Pintura Látex Interior 20L', 'PIN-001', 'litro', 25000.00, 50.00, true)
  RETURNING id INTO v_prod_2;

  INSERT INTO public.product_costs (company_id, product_id, cost_price, updated_by)
  VALUES (v_comp_a, v_prod_2, 15000.00, '11111111-1111-1111-1111-111111111111');

  -- prod_inactive: inactivo
  INSERT INTO public.products (company_id, category_id, supplier_id, name, sku, unit, selling_price, current_stock, is_active)
  VALUES (v_comp_a, v_cat_a, v_supp_active_a, 'Amoladora Obsoleta', 'AMO-OBS', 'unidad', 35000.00, 0.00, false)
  RETURNING id INTO v_prod_inactive;

  -- Producto Empresa B
  INSERT INTO public.products (company_id, category_id, supplier_id, name, sku, unit, selling_price, current_stock, is_active)
  VALUES (v_comp_b, v_cat_b, v_supp_b, 'Sierra Circular B', 'SIE-001', 'unidad', 60000.00, 5.00, true)
  RETURNING id INTO v_prod_b;

  INSERT INTO public.product_costs (company_id, product_id, cost_price, updated_by)
  VALUES (v_comp_b, v_prod_b, 40000.00, '33333333-3333-3333-3333-333333333333');

  INSERT INTO test_context (key, id) VALUES
    ('prod_1', v_prod_1),
    ('prod_2', v_prod_2),
    ('prod_inactive', v_prod_inactive),
    ('prod_b', v_prod_b);
END;
$$;

-- ============================================================================
-- 3. EJECUCIÓN DE PRUEBAS UNITARIAS Y DE INTEGRACIÓN (pgTAP)
-- ============================================================================

-- Configurar sesión como master_admin de Empresa A
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111"}';

-- ----------------------------------------------------------------------------
-- TEST 01: Compra válida con varios productos (process_purchase)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_res JSONB;
BEGIN
  v_res := public.process_purchase(
    p_company_id := (SELECT id FROM test_context WHERE key = 'company_a'),
    p_idempotency_key := 'b0000001-0000-0000-0000-000000000001'::UUID,
    p_supplier_id := (SELECT id FROM test_context WHERE key = 'supp_active_a'),
    p_items := jsonb_build_array(
      jsonb_build_object(
        'product_id', (SELECT id FROM test_context WHERE key = 'prod_1'),
        'quantity', 5.00,
        'unit_cost', 32000.00
      ),
      jsonb_build_object(
        'product_id', (SELECT id FROM test_context WHERE key = 'prod_2'),
        'quantity', 10.50,
        'unit_cost', 16000.00
      )
    ),
    p_invoice_number := 'FC-A 0001-00004567',
    p_purchase_date := CURRENT_DATE,
    p_notes := 'Compra inicial para reposición de stock'
  );

  INSERT INTO test_context (key, id, str)
  VALUES ('purchase_1_id', (v_res->>'purchase_id')::UUID, v_res->>'purchase_number');
END;
$$;

SELECT is(
  (SELECT str FROM test_context WHERE key = 'purchase_1_id'),
  'COM-00000001',
  'T-01: Compra válida multi-producto devuelve comprobante COM-00000001'
);

-- ----------------------------------------------------------------------------
-- TEST 02: Incremento correcto de stock en producto 1 (10 + 5 = 15.00)
-- ----------------------------------------------------------------------------
SELECT is(
  (SELECT current_stock FROM public.products WHERE id = (SELECT id FROM test_context WHERE key = 'prod_1')),
  15.00::NUMERIC,
  'T-02: El stock del producto 1 se incrementó exactamente en 5 unidades (10 -> 15)'
);

-- ----------------------------------------------------------------------------
-- TEST 03: Incremento correcto de stock en producto 2 continuo (50 + 10.50 = 60.50)
-- ----------------------------------------------------------------------------
SELECT is(
  (SELECT current_stock FROM public.products WHERE id = (SELECT id FROM test_context WHERE key = 'prod_2')),
  60.50::NUMERIC,
  'T-03: El stock del producto 2 se incrementó con decimales (50 -> 60.50)'
);

-- ----------------------------------------------------------------------------
-- TEST 04: Movimientos de stock vinculados a la compra
-- ----------------------------------------------------------------------------
SELECT is(
  (
    SELECT count(*)::INTEGER
    FROM public.stock_movements
    WHERE reference_purchase_id = (SELECT id FROM test_context WHERE key = 'purchase_1_id')
      AND direction = 'increase'
      AND reason = 'purchase'
  ),
  2,
  'T-04: Se registraron 2 movimientos de inventario de entrada por compra vinculados a la compra'
);

-- ----------------------------------------------------------------------------
-- TEST 05: Congelamiento de costos históricos en movement_costs
-- ----------------------------------------------------------------------------
SELECT is(
  (
    SELECT count(*)::INTEGER
    FROM public.movement_costs mc
    JOIN public.stock_movements sm ON sm.company_id = mc.company_id AND sm.id = mc.movement_id
    WHERE sm.reference_purchase_id = (SELECT id FROM test_context WHERE key = 'purchase_1_id')
      AND (
        (sm.product_id = (SELECT id FROM test_context WHERE key = 'prod_1') AND mc.unit_cost = 32000.00 AND mc.total_cost = 160000.00) OR
        (sm.product_id = (SELECT id FROM test_context WHERE key = 'prod_2') AND mc.unit_cost = 16000.00 AND mc.total_cost = 168000.00)
      )
  ),
  2,
  'T-05: movement_costs contiene los costos unitarios y totales congelados de la compra'
);

-- ----------------------------------------------------------------------------
-- TEST 06: Detalle histórico en purchase_items
-- ----------------------------------------------------------------------------
SELECT is(
  (
    SELECT count(*)::INTEGER
    FROM public.purchase_items
    WHERE purchase_id = (SELECT id FROM test_context WHERE key = 'purchase_1_id')
      AND (
        (product_id = (SELECT id FROM test_context WHERE key = 'prod_1') AND quantity = 5.00 AND unit_cost = 32000.00 AND subtotal = 160000.00) OR
        (product_id = (SELECT id FROM test_context WHERE key = 'prod_2') AND quantity = 10.50 AND unit_cost = 16000.00 AND subtotal = 168000.00)
      )
  ),
  2,
  'T-06: purchase_items contiene las 2 líneas con cantidades, costos y subtotales históricos exactos'
);

-- ----------------------------------------------------------------------------
-- TEST 07: Actualización de costo de reposición en product_costs
-- ----------------------------------------------------------------------------
SELECT is(
  (
    SELECT cost_price
    FROM public.product_costs
    WHERE company_id = (SELECT id FROM test_context WHERE key = 'company_a')
      AND product_id = (SELECT id FROM test_context WHERE key = 'prod_1')
  ),
  32000.00::NUMERIC,
  'T-07: product_costs se actualizó con el último costo de compra ($32000.00)'
);

-- ----------------------------------------------------------------------------
-- TEST 08: Replay idempotente (misma clave y mismo payload no duplica compra ni stock)
-- ----------------------------------------------------------------------------
SELECT is(
  (
    SELECT (public.process_purchase(
      p_company_id := (SELECT id FROM test_context WHERE key = 'company_a'),
      p_idempotency_key := 'b0000001-0000-0000-0000-000000000001'::UUID,
      p_supplier_id := (SELECT id FROM test_context WHERE key = 'supp_active_a'),
      p_items := jsonb_build_array(
        jsonb_build_object(
          'product_id', (SELECT id FROM test_context WHERE key = 'prod_1'),
          'quantity', 5.00,
          'unit_cost', 32000.00
        ),
        jsonb_build_object(
          'product_id', (SELECT id FROM test_context WHERE key = 'prod_2'),
          'quantity', 10.50,
          'unit_cost', 16000.00
        )
      ),
      p_invoice_number := 'FC-A 0001-00004567',
      p_purchase_date := CURRENT_DATE,
      p_notes := 'Compra inicial para reposición de stock'
    ))->>'purchase_number'
  ),
  'COM-00000001',
  'T-08: Reintento idempotente devuelve el mismo comprobante COM-00000001'
);

-- ----------------------------------------------------------------------------
-- TEST 09: El stock no se incrementa nuevamente tras replay idempotente
-- ----------------------------------------------------------------------------
SELECT is(
  (SELECT current_stock FROM public.products WHERE id = (SELECT id FROM test_context WHERE key = 'prod_1')),
  15.00::NUMERIC,
  'T-09: El stock de prod_1 no se volvió a incrementar tras replay idempotente (permanece en 15.00)'
);

-- ----------------------------------------------------------------------------
-- TEST 10: Idempotencia rechaza misma clave con payload modificado (mismatch)
-- ----------------------------------------------------------------------------
SELECT throws_matching(
  format($$
    SELECT public.process_purchase(
      p_company_id := '%s'::UUID,
      p_idempotency_key := 'b0000001-0000-0000-0000-000000000001'::UUID,
      p_supplier_id := '%s'::UUID,
      p_items := jsonb_build_array(
        jsonb_build_object('product_id', '%s'::UUID, 'quantity', 99.00, 'unit_cost', 10.00)
      )
    );
  $$,
  (SELECT id FROM test_context WHERE key = 'company_a'),
  (SELECT id FROM test_context WHERE key = 'supp_active_a'),
  (SELECT id FROM test_context WHERE key = 'prod_1')),
  'Idempotency key mismatch',
  'T-10: Idempotency key mismatch lanza excepción ante payload modificado'
);

-- ----------------------------------------------------------------------------
-- TEST 11: Numeración correlativa independiente por empresa (COM-00000001 en Empresa B)
-- ----------------------------------------------------------------------------
SET LOCAL request.jwt.claims = '{"sub": "33333333-3333-3333-3333-333333333333"}';

SELECT is(
  (
    SELECT (public.process_purchase(
      p_company_id := (SELECT id FROM test_context WHERE key = 'company_b'),
      p_idempotency_key := 'b0000002-0000-0000-0000-000000000001'::UUID,
      p_supplier_id := (SELECT id FROM test_context WHERE key = 'supp_b'),
      p_items := jsonb_build_array(
        jsonb_build_object(
          'product_id', (SELECT id FROM test_context WHERE key = 'prod_b'),
          'quantity', 2.00,
          'unit_cost', 42000.00
        )
      )
    ))->>'purchase_number'
  ),
  'COM-00000001',
  'T-11: Empresa B genera su propia numeración COM-00000001 de forma independiente'
);

-- Regresar a admin de Empresa A
SET LOCAL request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111"}';

-- ----------------------------------------------------------------------------
-- TEST 12: Rechazo de proveedor inexistente
-- ----------------------------------------------------------------------------
SELECT throws_matching(
  format($$
    SELECT public.process_purchase(
      p_company_id := '%s'::UUID,
      p_idempotency_key := 'b0000003-0000-0000-0000-000000000001'::UUID,
      p_supplier_id := 'ffffffff-ffff-ffff-ffff-ffffffffffff'::UUID,
      p_items := jsonb_build_array(
        jsonb_build_object('product_id', '%s'::UUID, 'quantity', 1.00, 'unit_cost', 1000.00)
      )
    );
  $$,
  (SELECT id FROM test_context WHERE key = 'company_a'),
  (SELECT id FROM test_context WHERE key = 'prod_1')),
  'El proveedor especificado no existe o no pertenece a esta empresa',
  'T-12: Proveedor inexistente es rechazado con código P0001'
);

-- ----------------------------------------------------------------------------
-- TEST 13: Rechazo de proveedor inactivo
-- ----------------------------------------------------------------------------
SELECT throws_matching(
  format($$
    SELECT public.process_purchase(
      p_company_id := '%s'::UUID,
      p_idempotency_key := 'b0000004-0000-0000-0000-000000000001'::UUID,
      p_supplier_id := '%s'::UUID,
      p_items := jsonb_build_array(
        jsonb_build_object('product_id', '%s'::UUID, 'quantity', 1.00, 'unit_cost', 1000.00)
      )
    );
  $$,
  (SELECT id FROM test_context WHERE key = 'company_a'),
  (SELECT id FROM test_context WHERE key = 'supp_inactive_a'),
  (SELECT id FROM test_context WHERE key = 'prod_1')),
  'No se pueden registrar compras a un proveedor inactivo',
  'T-13: Proveedor inactivo es rechazado'
);

-- ----------------------------------------------------------------------------
-- TEST 14: Rechazo de proveedor de otra empresa (Cross-tenant supplier)
-- ----------------------------------------------------------------------------
SELECT throws_matching(
  format($$
    SELECT public.process_purchase(
      p_company_id := '%s'::UUID,
      p_idempotency_key := 'b0000005-0000-0000-0000-000000000001'::UUID,
      p_supplier_id := '%s'::UUID,
      p_items := jsonb_build_array(
        jsonb_build_object('product_id', '%s'::UUID, 'quantity', 1.00, 'unit_cost', 1000.00)
      )
    );
  $$,
  (SELECT id FROM test_context WHERE key = 'company_a'),
  (SELECT id FROM test_context WHERE key = 'supp_b'),
  (SELECT id FROM test_context WHERE key = 'prod_1')),
  'El proveedor especificado no existe o no pertenece a esta empresa',
  'T-14: Proveedor de otra empresa es rechazado por aislamiento multiempresa'
);

-- ----------------------------------------------------------------------------
-- TEST 15: Rechazo de producto de otra empresa (Cross-tenant product)
-- ----------------------------------------------------------------------------
SELECT throws_matching(
  format($$
    SELECT public.process_purchase(
      p_company_id := '%s'::UUID,
      p_idempotency_key := 'b0000006-0000-0000-0000-000000000001'::UUID,
      p_supplier_id := '%s'::UUID,
      p_items := jsonb_build_array(
        jsonb_build_object('product_id', '%s'::UUID, 'quantity', 1.00, 'unit_cost', 1000.00)
      )
    );
  $$,
  (SELECT id FROM test_context WHERE key = 'company_a'),
  (SELECT id FROM test_context WHERE key = 'supp_active_a'),
  (SELECT id FROM test_context WHERE key = 'prod_b')),
  'Uno o más productos del detalle no pertenecen a esta empresa o no existen',
  'T-15: Producto de otra empresa es rechazado'
);

-- ----------------------------------------------------------------------------
-- TEST 16: Rechazo de producto inactivo
-- ----------------------------------------------------------------------------
SELECT throws_matching(
  format($$
    SELECT public.process_purchase(
      p_company_id := '%s'::UUID,
      p_idempotency_key := 'b0000007-0000-0000-0000-000000000001'::UUID,
      p_supplier_id := '%s'::UUID,
      p_items := jsonb_build_array(
        jsonb_build_object('product_id', '%s'::UUID, 'quantity', 1.00, 'unit_cost', 1000.00)
      )
    );
  $$,
  (SELECT id FROM test_context WHERE key = 'company_a'),
  (SELECT id FROM test_context WHERE key = 'supp_active_a'),
  (SELECT id FROM test_context WHERE key = 'prod_inactive')),
  'está inactivo y no puede ser comprado',
  'T-16: Producto inactivo es rechazado'
);

-- ----------------------------------------------------------------------------
-- TEST 17: Rechazo de unidad indivisible con cantidad fraccionaria
-- ----------------------------------------------------------------------------
SELECT throws_matching(
  format($$
    SELECT public.process_purchase(
      p_company_id := '%s'::UUID,
      p_idempotency_key := 'b0000008-0000-0000-0000-000000000001'::UUID,
      p_supplier_id := '%s'::UUID,
      p_items := jsonb_build_array(
        jsonb_build_object('product_id', '%s'::UUID, 'quantity', 2.50, 'unit_cost', 1000.00)
      )
    );
  $$,
  (SELECT id FROM test_context WHERE key = 'company_a'),
  (SELECT id FROM test_context WHERE key = 'supp_active_a'),
  (SELECT id FROM test_context WHERE key = 'prod_1')),
  'La unidad unidad es indivisible y no admite cantidades fraccionarias',
  'T-17: Cantidad decimal en producto con unidad entera lanza excepción'
);

-- ----------------------------------------------------------------------------
-- TEST 18: Reversión completa (Rollback) cuando falla un renglón
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  -- Intentar compra atómica donde el primer ítem es válido y el segundo tiene costo negativo
  BEGIN
    PERFORM public.process_purchase(
      p_company_id := (SELECT id FROM test_context WHERE key = 'company_a'),
      p_idempotency_key := 'b0000009-0000-0000-0000-000000000001'::UUID,
      p_supplier_id := (SELECT id FROM test_context WHERE key = 'supp_active_a'),
      p_items := jsonb_build_array(
        jsonb_build_object(
          'product_id', (SELECT id FROM test_context WHERE key = 'prod_1'),
          'quantity', 10.00,
          'unit_cost', 32000.00
        ),
        jsonb_build_object(
          'product_id', (SELECT id FROM test_context WHERE key = 'prod_2'),
          'quantity', 5.00,
          'unit_cost', -50.00
        )
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- Capturar excepción esperada
    NULL;
  END;
END;
$$;

SELECT is(
  (SELECT current_stock FROM public.products WHERE id = (SELECT id FROM test_context WHERE key = 'prod_1')),
  15.00::NUMERIC,
  'T-18: El stock de prod_1 no cambió tras fallar la transacción por ítem inválido (rollback atómico)'
);

-- ----------------------------------------------------------------------------
-- TEST 19: Permisos - Rol employee no tiene permiso para process_purchase
-- ----------------------------------------------------------------------------
SET LOCAL request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222"}';

SELECT throws_matching(
  format($$
    SELECT public.process_purchase(
      p_company_id := '%s'::UUID,
      p_idempotency_key := 'b0000010-0000-0000-0000-000000000001'::UUID,
      p_supplier_id := '%s'::UUID,
      p_items := jsonb_build_array(
        jsonb_build_object('product_id', '%s'::UUID, 'quantity', 1.00, 'unit_cost', 1000.00)
      )
    );
  $$,
  (SELECT id FROM test_context WHERE key = 'company_a'),
  (SELECT id FROM test_context WHERE key = 'supp_active_a'),
  (SELECT id FROM test_context WHERE key = 'prod_1')),
  'Operación restringida a usuarios con rol master_admin',
  'T-19: Empleado no puede registrar compras (requiere master_admin)'
);

-- ----------------------------------------------------------------------------
-- TEST 20: RLS - Rol employee no puede leer purchases ni purchase_items (costos ocultos)
-- ----------------------------------------------------------------------------
SELECT is(
  (SELECT count(*)::INTEGER FROM public.purchases WHERE company_id = (SELECT id FROM test_context WHERE key = 'company_a')),
  0,
  'T-20: RLS bloquea lectura de purchases para rol employee (retorna 0 filas)'
);

-- ----------------------------------------------------------------------------
-- TEST 21: RLS - Aislamiento multiempresa entre administradores
-- ----------------------------------------------------------------------------
SET LOCAL request.jwt.claims = '{"sub": "33333333-3333-3333-3333-333333333333"}';

SELECT is(
  (SELECT count(*)::INTEGER FROM public.purchases WHERE company_id = (SELECT id FROM test_context WHERE key = 'company_a')),
  0,
  'T-21: Admin de Empresa B no puede ver las compras de Empresa A bajo RLS'
);

-- ----------------------------------------------------------------------------
-- TEST 22: Integridad de auditoría inmutable
-- ----------------------------------------------------------------------------
SET LOCAL request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111"}';

SELECT is(
  (
    SELECT count(*)::INTEGER
    FROM public.audit_log
    WHERE company_id = (SELECT id FROM test_context WHERE key = 'company_a')
      AND table_name = 'purchases'
      AND record_id = (SELECT id::TEXT FROM test_context WHERE key = 'purchase_1_id')
      AND action = 'INSERT'
      AND actor_role = 'master_admin'
  ),
  1,
  'T-22: Se registró el evento de auditoría correspondiente a la compra en audit_log'
);

SELECT * FROM finish();
ROLLBACK;
