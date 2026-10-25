-- ============================================================================
-- SUITE PGTAP: TANDA 2.3C - INTEGRACIÓN DE CLIENTES EN VENTAS TRANSACCIONALES
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
-- Archivo: 11_tanda_2_3c_sales_customer_integration.test.sql
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(19);

-- ============================================================================
-- 1. SETUP DE CONTEXTO AISLADO
-- ============================================================================
CREATE TEMPORARY TABLE test_context (
  key TEXT PRIMARY KEY,
  id UUID,
  str TEXT
);
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE test_context TO authenticated, anon;

-- Usuarios de prueba en auth.users
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin_sales@stockly.local'),
  ('22222222-2222-2222-2222-222222222222', 'emp_sales@stockly.local'),
  ('33333333-3333-3333-3333-333333333333', 'admin_other@stockly.local'),
  ('44444444-4444-4444-4444-444444444444', 'intruder@stockly.local')
ON CONFLICT (id) DO NOTHING;

-- Crear Empresa A con CUIT verificado bajo Módulo 11 (30-71111111-1)
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111"}';
SELECT public.create_company('Empresa Ventas Clientes A', '30-71111111-1', 'ARS', 'America/Argentina/Buenos_Aires');

INSERT INTO test_context (key, id)
SELECT 'company_a', id FROM public.companies WHERE name = 'Empresa Ventas Clientes A';

-- Invitar a emp_sales a Empresa A como employee
DO $$
DECLARE
  v_token TEXT;
BEGIN
  v_token := public.invite_user_to_company(
    (SELECT id FROM test_context WHERE key = 'company_a'),
    'emp_sales@stockly.local',
    'employee'
  );
  PERFORM set_config('test.token_emp', v_token, true);
END;
$$;

-- Crear Empresa B con CUIT verificado (30-74444444-2)
SET LOCAL request.jwt.claims = '{"sub": "33333333-3333-3333-3333-333333333333"}';
SELECT public.create_company('Empresa Ventas Clientes B', '30-74444444-2', 'ARS', 'America/Argentina/Buenos_Aires');

INSERT INTO test_context (key, id)
SELECT 'company_b', id FROM public.companies WHERE name = 'Empresa Ventas Clientes B';

-- Aceptar invitación como emp_sales en Empresa A
SET LOCAL request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222"}';
SELECT public.accept_company_invitation(current_setting('test.token_emp'));

RESET ROLE;

-- Setup de Productos y Categoría en Empresa A
DO $$
DECLARE
  v_comp_a UUID;
  v_cat_id UUID;
  v_prod_1 UUID;
  v_prod_2 UUID;
BEGIN
  SELECT id INTO v_comp_a FROM test_context WHERE key = 'company_a';

  INSERT INTO public.categories (company_id, name)
  VALUES (v_comp_a, 'Ferretería')
  RETURNING id INTO v_cat_id;

  INSERT INTO public.products (company_id, category_id, name, sku, unit, selling_price, current_stock, is_active)
  VALUES (v_comp_a, v_cat_id, 'Taladro Percutor 750W', 'TAL-001', 'unidad', 50000.00, 100.00, true)
  RETURNING id INTO v_prod_1;

  INSERT INTO public.product_costs (company_id, product_id, cost_price, updated_by)
  VALUES (v_comp_a, v_prod_1, 30000.00, '11111111-1111-1111-1111-111111111111');

  INSERT INTO public.products (company_id, category_id, name, sku, unit, selling_price, current_stock, is_active)
  VALUES (v_comp_a, v_cat_id, 'Amoladora Angular 4 1/2', 'AMO-002', 'unidad', 45000.00, 50.00, true)
  RETURNING id INTO v_prod_2;

  INSERT INTO public.product_costs (company_id, product_id, cost_price, updated_by)
  VALUES (v_comp_a, v_prod_2, 27000.00, '11111111-1111-1111-1111-111111111111');

  INSERT INTO test_context (key, id) VALUES
    ('prod_1', v_prod_1),
    ('prod_2', v_prod_2);
END;
$$;

-- Setup de Clientes
DO $$
DECLARE
  v_comp_a UUID;
  v_comp_b UUID;
  v_cust_act_a UUID;
  v_cust_inact_a UUID;
  v_cust_b UUID;
BEGIN
  SELECT id INTO v_comp_a FROM test_context WHERE key = 'company_a';
  SELECT id INTO v_comp_b FROM test_context WHERE key = 'company_b';

  -- Cliente activo en Empresa A (CUIT válido: 20-30405060-9)
  INSERT INTO public.customers (company_id, name, identification_type, tax_id, email, phone, is_active)
  VALUES (v_comp_a, 'Constructora Los Andes S.A.', 'CUIT', '20-30405060-9', 'compras@losandes.com', '+54 11 4111-2222', true)
  RETURNING id INTO v_cust_act_a;

  -- Cliente inactivo en Empresa A
  INSERT INTO public.customers (company_id, name, identification_type, tax_id, email, is_active)
  VALUES (v_comp_a, 'Servicios Industriales Expirados', 'DNI', '12345678', 'contacto@inactivo.com', false)
  RETURNING id INTO v_cust_inact_a;

  -- Cliente activo exclusivo en Empresa B
  INSERT INTO public.customers (company_id, name, identification_type, tax_id, is_active)
  VALUES (v_comp_b, 'Cliente Foráneo Empresa B', 'DNI', '98765432', true)
  RETURNING id INTO v_cust_b;

  INSERT INTO test_context (key, id) VALUES
    ('cust_active_a', v_cust_act_a),
    ('cust_inactive_a', v_cust_inact_a),
    ('cust_b', v_cust_b);
END;
$$;

-- ============================================================================
-- 2. EJECUCIÓN DE PRUEBAS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TEST 1: Venta válida con cliente activo por master_admin
-- ----------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111"}';

SELECT lives_ok(
  format($$
    SELECT public.process_sale(
      %L::UUID,
      'b0000001-0000-0000-0000-000000000001'::UUID,
      format('[{"product_id": "%%s", "quantity": 2.00}]', %L)::JSONB,
      0.00,
      '[{"method": "efectivo", "amount": 100000.00}]'::JSONB,
      'Venta con cliente corporativo',
      %L::UUID
    );
  $$,
    (SELECT id FROM test_context WHERE key = 'company_a'),
    (SELECT id FROM test_context WHERE key = 'prod_1'),
    (SELECT id FROM test_context WHERE key = 'cust_active_a')
  ),
  'Test 1: master_admin puede registrar una venta asociando un cliente activo de la empresa'
);

-- ----------------------------------------------------------------------------
-- TEST 2: Persistencia correcta en sales.customer_id
-- ----------------------------------------------------------------------------
SELECT is(
  (
    SELECT customer_id
    FROM public.sales
    WHERE company_id = (SELECT id FROM test_context WHERE key = 'company_a')
      AND sale_number = 'VTA-00000001'
  ),
  (SELECT id FROM test_context WHERE key = 'cust_active_a'),
  'Test 2: sales.customer_id se persiste correctamente con el UUID del cliente asociado'
);

-- ----------------------------------------------------------------------------
-- TEST 3: Venta a consumidor final con customer_id = NULL
-- ----------------------------------------------------------------------------
SELECT lives_ok(
  format($$
    SELECT public.process_sale(
      %L::UUID,
      'b0000002-0000-0000-0000-000000000002'::UUID,
      format('[{"product_id": "%%s", "quantity": 1.00}]', %L)::JSONB,
      0.00,
      '[{"method": "transferencia", "amount": 50000.00}]'::JSONB,
      'Venta mostrador consumidor final',
      NULL
    );
  $$,
    (SELECT id FROM test_context WHERE key = 'company_a'),
    (SELECT id FROM test_context WHERE key = 'prod_1')
  ),
  'Test 3: Venta a consumidor final con customer_id = NULL se procesa exitosamente'
);

-- ----------------------------------------------------------------------------
-- TEST 4: Persistencia de venta con customer_id nulo
-- ----------------------------------------------------------------------------
SELECT is(
  (
    SELECT customer_id
    FROM public.sales
    WHERE company_id = (SELECT id FROM test_context WHERE key = 'company_a')
      AND sale_number = 'VTA-00000002'
  ),
  NULL,
  'Test 4: La venta a consumidor final persiste customer_id = NULL'
);

-- ----------------------------------------------------------------------------
-- TEST 5: Rechazo de cliente inexistente (UUID ficticio)
-- ----------------------------------------------------------------------------
SELECT throws_matching(
  format($$
    SELECT public.process_sale(
      %L::UUID,
      'b0000003-0000-0000-0000-000000000003'::UUID,
      format('[{"product_id": "%%s", "quantity": 1.00}]', %L)::JSONB,
      0.00,
      '[{"method": "efectivo", "amount": 50000.00}]'::JSONB,
      'Venta cliente inexistente',
      'ffffffff-ffff-ffff-ffff-ffffffffffff'::UUID
    );
  $$,
    (SELECT id FROM test_context WHERE key = 'company_a'),
    (SELECT id FROM test_context WHERE key = 'prod_1')
  ),
  'El cliente especificado no existe o no pertenece a esta empresa',
  'Test 5: Rechazo de venta cuando el cliente no existe en la base de datos'
);

-- ----------------------------------------------------------------------------
-- TEST 6: Rechazo de cliente inactivo
-- ----------------------------------------------------------------------------
SELECT throws_matching(
  format($$
    SELECT public.process_sale(
      %L::UUID,
      'b0000004-0000-0000-0000-000000000004'::UUID,
      format('[{"product_id": "%%s", "quantity": 1.00}]', %L)::JSONB,
      0.00,
      '[{"method": "efectivo", "amount": 50000.00}]'::JSONB,
      'Venta cliente inactivo',
      %L::UUID
    );
  $$,
    (SELECT id FROM test_context WHERE key = 'company_a'),
    (SELECT id FROM test_context WHERE key = 'prod_1'),
    (SELECT id FROM test_context WHERE key = 'cust_inactive_a')
  ),
  'No se pueden registrar ventas asociadas a un cliente inactivo',
  'Test 6: Rechazo de venta al intentar asociar un cliente marcado como inactivo'
);

-- ----------------------------------------------------------------------------
-- TEST 7: Rechazo de cliente perteneciente a otra empresa (Cross-tenant)
-- ----------------------------------------------------------------------------
SELECT throws_matching(
  format($$
    SELECT public.process_sale(
      %L::UUID,
      'b0000005-0000-0000-0000-000000000005'::UUID,
      format('[{"product_id": "%%s", "quantity": 1.00}]', %L)::JSONB,
      0.00,
      '[{"method": "efectivo", "amount": 50000.00}]'::JSONB,
      'Intento cross tenant cliente',
      %L::UUID
    );
  $$,
    (SELECT id FROM test_context WHERE key = 'company_a'),
    (SELECT id FROM test_context WHERE key = 'prod_1'),
    (SELECT id FROM test_context WHERE key = 'cust_b')
  ),
  'El cliente especificado no existe o no pertenece a esta empresa',
  'Test 7: Rechazo de venta cuando el cliente pertenece a otra empresa (aislamiento cross-tenant)'
);

-- ----------------------------------------------------------------------------
-- TEST 8: Empleado activo puede registrar venta asociando cliente de su empresa
-- ----------------------------------------------------------------------------
SET LOCAL request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222"}';

SELECT lives_ok(
  format($$
    SELECT public.process_sale(
      %L::UUID,
      'b0000006-0000-0000-0000-000000000006'::UUID,
      format('[{"product_id": "%%s", "quantity": 1.00}]', %L)::JSONB,
      0.00,
      '[{"method": "debito", "amount": 45000.00}]'::JSONB,
      'Venta operada por empleado con cliente',
      %L::UUID
    );
  $$,
    (SELECT id FROM test_context WHERE key = 'company_a'),
    (SELECT id FROM test_context WHERE key = 'prod_2'),
    (SELECT id FROM test_context WHERE key = 'cust_active_a')
  ),
  'Test 8: Un usuario con rol employee de la empresa puede asociar un cliente activo a la venta'
);

-- ----------------------------------------------------------------------------
-- TEST 9: Rechazo de venta por usuario ajeno a la empresa (intruder)
-- ----------------------------------------------------------------------------
SET LOCAL request.jwt.claims = '{"sub": "44444444-4444-4444-4444-444444444444"}';

SELECT throws_matching(
  format($$
    SELECT public.process_sale(
      %L::UUID,
      'b0000007-0000-0000-0000-000000000007'::UUID,
      format('[{"product_id": "%%s", "quantity": 1.00}]', %L)::JSONB,
      0.00,
      '[{"method": "efectivo", "amount": 45000.00}]'::JSONB,
      'Intento no autorizado',
      %L::UUID
    );
  $$,
    (SELECT id FROM test_context WHERE key = 'company_a'),
    (SELECT id FROM test_context WHERE key = 'prod_2'),
    (SELECT id FROM test_context WHERE key = 'cust_active_a')
  ),
  'El usuario no es un miembro activo de esta empresa',
  'Test 9: Rechazo de venta si el usuario no es miembro activo de la empresa'
);

-- ----------------------------------------------------------------------------
-- TEST 10: Replay idempotente con el mismo cliente reproduce la venta sin duplicar
-- ----------------------------------------------------------------------------
SET LOCAL request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222"}';

SELECT is(
  (
    SELECT (public.process_sale(
      (SELECT id FROM test_context WHERE key = 'company_a'),
      'b0000006-0000-0000-0000-000000000006'::UUID,
      format('[{"product_id": "%s", "quantity": 1.00}]', (SELECT id FROM test_context WHERE key = 'prod_2'))::JSONB,
      0.00,
      '[{"method": "debito", "amount": 45000.00}]'::JSONB,
      'Venta operada por empleado con cliente',
      (SELECT id FROM test_context WHERE key = 'cust_active_a')
    ))->>'sale_number'
  ),
  'VTA-00000003'::TEXT,
  'Test 10: Replay con misma clave y mismo cliente retorna el mismo comprobante sin duplicar'
);

-- ----------------------------------------------------------------------------
-- TEST 11: Idempotency mismatch: misma clave con un cliente diferente es rechazada
-- ----------------------------------------------------------------------------
RESET ROLE;

-- Crear un segundo cliente activo para la colisión
DO $$
DECLARE
  v_comp_a UUID;
  v_cust2 UUID;
BEGIN
  SELECT id INTO v_comp_a FROM test_context WHERE key = 'company_a';

  INSERT INTO public.customers (company_id, name, identification_type, is_active)
  VALUES (v_comp_a, 'Segundo Cliente Activo', 'DNI', true)
  RETURNING id INTO v_cust2;

  INSERT INTO test_context (key, id) VALUES ('cust_active_2', v_cust2);
END;
$$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222"}';

SELECT throws_matching(
  format($$
    SELECT public.process_sale(
      %L::UUID,
      'b0000006-0000-0000-0000-000000000006'::UUID,
      format('[{"product_id": "%%s", "quantity": 1.00}]', %L)::JSONB,
      0.00,
      '[{"method": "debito", "amount": 45000.00}]'::JSONB,
      'Venta operada por empleado con cliente',
      %L::UUID
    );
  $$,
    (SELECT id FROM test_context WHERE key = 'company_a'),
    (SELECT id FROM test_context WHERE key = 'prod_2'),
    (SELECT id FROM test_context WHERE key = 'cust_active_2')
  ),
  'Idempotency key mismatch: clave de venta reutilizada con distintos parámetros',
  'Test 11: Reutilizar clave de idempotencia cambiando el cliente es rechazado por mismatch de hash'
);

-- ----------------------------------------------------------------------------
-- TEST 12: Compatibilidad de replay para ventas con cliente nulo (sin mismatch)
-- ----------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111"}';

SELECT is(
  (
    SELECT (public.process_sale(
      (SELECT id FROM test_context WHERE key = 'company_a'),
      'b0000002-0000-0000-0000-000000000002'::UUID,
      format('[{"product_id": "%s", "quantity": 1.00}]', (SELECT id FROM test_context WHERE key = 'prod_1'))::JSONB,
      0.00,
      '[{"method": "transferencia", "amount": 50000.00}]'::JSONB,
      'Venta mostrador consumidor final',
      NULL
    ))->>'sale_number'
  ),
  'VTA-00000002'::TEXT,
  'Test 12: Replay de venta con customer_id = NULL preserva el hash canónico idéntico a tanda 2.3A'
);

-- ----------------------------------------------------------------------------
-- TEST 13: Privilegios de ejecución revocados para anon
-- ----------------------------------------------------------------------------
SET LOCAL ROLE anon;

SELECT throws_ok(
  format($$
    SELECT public.process_sale(
      %L::UUID,
      'b0000008-0000-0000-0000-000000000008'::UUID,
      format('[{"product_id": "%%s", "quantity": 1.00}]', %L)::JSONB,
      0.00,
      '[{"method": "efectivo", "amount": 50000.00}]'::JSONB,
      'Intento anon',
      NULL
    );
  $$,
    (SELECT id FROM test_context WHERE key = 'company_a'),
    (SELECT id FROM test_context WHERE key = 'prod_1')
  ),
  '42501',
  NULL,
  'Test 13: Rol anon no tiene privilegios de ejecución (permission denied 42501) sobre process_sale'
);

-- ----------------------------------------------------------------------------
-- TEST 14: Integridad de ítems, movimientos de stock y congelamiento de costos
-- ----------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111"}';

-- Verificar que se crearon los sale_items, stock_movements y movement_costs para la venta VTA-00000001
SELECT is(
  (
    SELECT count(*)::INT
    FROM public.sale_items si
    JOIN public.sales s ON s.id = si.sale_id
    WHERE s.company_id = (SELECT id FROM test_context WHERE key = 'company_a')
      AND s.sale_number = 'VTA-00000001'
  ),
  1,
  'Test 14.1: sale_items registrado correctamente en la venta nominada'
);

SELECT is(
  (
    SELECT sm.quantity
    FROM public.stock_movements sm
    JOIN public.sales s ON s.id = sm.reference_sale_id
    WHERE s.company_id = (SELECT id FROM test_context WHERE key = 'company_a')
      AND s.sale_number = 'VTA-00000001'
  ),
  2.00::NUMERIC,
  'Test 14.2: stock_movements descontó la cantidad exacta (2 unidades) asociando la venta'
);

SELECT is(
  (
    SELECT mc.unit_cost
    FROM public.movement_costs mc
    JOIN public.stock_movements sm ON sm.id = mc.movement_id
    JOIN public.sales s ON s.id = sm.reference_sale_id
    WHERE s.company_id = (SELECT id FROM test_context WHERE key = 'company_a')
      AND s.sale_number = 'VTA-00000001'
  ),
  30000.00::NUMERIC,
  'Test 14.3: movement_costs congeló el costo unitario histórico de $30.000,00'
);

-- ----------------------------------------------------------------------------
-- TEST 15: Rollback atómico completo ante fallo intermedio
-- ----------------------------------------------------------------------------
RESET ROLE;
UPDATE public.companies SET allow_negative_stock = false WHERE id = (SELECT id FROM test_context WHERE key = 'company_a');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111"}';

-- Intentar vender 500 unidades cuando solo hay 97 en stock (allow_negative_stock = false)
SELECT throws_matching(
  format($$
    SELECT public.process_sale(
      %L::UUID,
      'b0000009-0000-0000-0000-000000000009'::UUID,
      format('[{"product_id": "%%s", "quantity": 500.00}]', %L)::JSONB,
      0.00,
      '[{"method": "efectivo", "amount": 25000000.00}]'::JSONB,
      'Venta exceso stock',
      %L::UUID
    );
  $$,
    (SELECT id FROM test_context WHERE key = 'company_a'),
    (SELECT id FROM test_context WHERE key = 'prod_1'),
    (SELECT id FROM test_context WHERE key = 'cust_active_a')
  ),
  'Stock insuficiente',
  'Test 15.1: Venta que excede existencias es rechazada cuando allow_negative_stock = false'
);

-- Comprobar que NO se insertó la venta ni la clave en operation_idempotency
SELECT is(
  (
    SELECT count(*)::INT
    FROM public.sales
    WHERE company_id = (SELECT id FROM test_context WHERE key = 'company_a')
      AND notes = 'Venta exceso stock'
  ),
  0,
  'Test 15.2: Rollback atómico: no se persistió ninguna venta parcial'
);

-- ----------------------------------------------------------------------------
-- TEST 16: Vinculación relacional directa consultable (JOIN sales -> customers)
-- ----------------------------------------------------------------------------
SELECT is(
  (
    SELECT c.name
    FROM public.sales s
    JOIN public.customers c ON c.id = s.customer_id AND c.company_id = s.company_id
    WHERE s.company_id = (SELECT id FROM test_context WHERE key = 'company_a')
      AND s.sale_number = 'VTA-00000001'
  ),
  'Constructora Los Andes S.A.'::TEXT,
  'Test 16: La venta VTA-00000001 se relaciona directamente con el cliente nominativo'
);

-- ============================================================================
-- 3. FINALIZACIÓN Y ROLLBACK DE LA SUITE
-- ============================================================================
SELECT * FROM finish();
ROLLBACK;
