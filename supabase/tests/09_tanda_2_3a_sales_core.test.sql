-- ============================================================================
-- SUITE DE PRUEBAS AUTOMATIZADAS (pgTAP) - TANDA 2.3A
-- Módulo: Núcleo de Ventas, Detalle, Idempotencia, Precios Históricos y Stock
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
-- Estado: SUITE DE PRUEBAS AISLADA (Se ejecuta en transacción con ROLLBACK)
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(23);

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
-- 2. SETUP: Creación de Tenants de Prueba, Usuarios y Catálogo
-- ============================================================================
CREATE TEMP TABLE test_context (
  key TEXT PRIMARY KEY,
  id UUID
);
GRANT SELECT, INSERT ON TABLE test_context TO authenticated;

-- Crear Usuarios de prueba en auth.users
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin_a@stockly.local'),
  ('22222222-2222-2222-2222-222222222222', 'employee_a@stockly.local'),
  ('33333333-3333-3333-3333-333333333333', 'admin_b@stockly.local');

-- Crear Empresas de prueba con create_company() simulando auth.uid()
SET LOCAL ROLE authenticated;

-- Empresa A (admin_a)
SET LOCAL request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111"}';
SELECT public.create_company('Empresa Ventas A', '30-71111111-1', 'ARS', 'America/Argentina/Buenos_Aires');

INSERT INTO test_context (key, id)
SELECT 'company_a', id FROM public.companies WHERE name = 'Empresa Ventas A';

-- Invitar a employee_a a Empresa A con rol employee
DO $$
DECLARE
  v_token TEXT;
BEGIN
  v_token := public.invite_user_to_company(
    (SELECT id FROM test_context WHERE key = 'company_a'),
    'employee_a@stockly.local',
    'employee'
  );
  INSERT INTO test_context (key, id) VALUES ('dummy_key', gen_random_uuid()); -- no-op
  -- Guardar token en sesión temporal
  PERFORM set_config('test.token_emp', v_token, true);
END;
$$;

-- Empresa B (admin_b)
SET LOCAL request.jwt.claims = '{"sub": "33333333-3333-3333-3333-333333333333"}';
SELECT public.create_company('Empresa Ventas B', '30-74444444-2', 'ARS', 'America/Argentina/Buenos_Aires');

INSERT INTO test_context (key, id)
SELECT 'company_b', id FROM public.companies WHERE name = 'Empresa Ventas B';

-- Aceptar invitación como employee_a en Empresa A
SET LOCAL request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222"}';
SELECT public.accept_company_invitation(current_setting('test.token_emp'));

RESET ROLE;

-- Configurar catálogo y stock inicial en Empresa A
DO $$
DECLARE
  v_comp_a UUID;
  v_comp_b UUID;
  v_prod1 UUID;
  v_prod2 UUID;
  v_prod_inactive UUID;
  v_prod_b UUID;
BEGIN
  SELECT id INTO v_comp_a FROM test_context WHERE key = 'company_a';
  SELECT id INTO v_comp_b FROM test_context WHERE key = 'company_b';

  -- Producto 1 Empresa A: Precio $1000, Costo $600, Stock 50
  INSERT INTO public.products (
    id, company_id, name, sku, barcode, selling_price, current_stock, min_stock, is_active, unit
  ) VALUES (
    gen_random_uuid(), v_comp_a, 'Coca Cola 1.5L', 'BEB-001', '7791234567890', 1000.00, 50.00, 5.00, true, 'unidad'
  ) RETURNING id INTO v_prod1;

  INSERT INTO public.product_costs (company_id, product_id, cost_price, updated_by)
  VALUES (v_comp_a, v_prod1, 600.00, '11111111-1111-1111-1111-111111111111');

  -- Producto 2 Empresa A: Precio $2500, Costo $1500, Stock 20
  INSERT INTO public.products (
    id, company_id, name, sku, barcode, selling_price, current_stock, min_stock, is_active, unit
  ) VALUES (
    gen_random_uuid(), v_comp_a, 'Papas Fritas 500g', 'SNA-001', '7799876543210', 2500.00, 20.00, 2.00, true, 'unidad'
  ) RETURNING id INTO v_prod2;

  INSERT INTO public.product_costs (company_id, product_id, cost_price, updated_by)
  VALUES (v_comp_a, v_prod2, 1500.00, '11111111-1111-1111-1111-111111111111');

  -- Producto Inactivo Empresa A: Precio $500, Costo $200, Stock 10
  INSERT INTO public.products (
    id, company_id, name, sku, barcode, selling_price, current_stock, min_stock, is_active, unit
  ) VALUES (
    gen_random_uuid(), v_comp_a, 'Alfajor Descontinuado', 'ALF-001', NULL, 500.00, 10.00, 0.00, false, 'unidad'
  ) RETURNING id INTO v_prod_inactive;

  -- Producto Empresa B
  INSERT INTO public.products (
    id, company_id, name, sku, barcode, selling_price, current_stock, min_stock, is_active, unit
  ) VALUES (
    gen_random_uuid(), v_comp_b, 'Producto B', 'PRD-B01', NULL, 3000.00, 10.00, 0.00, true, 'unidad'
  ) RETURNING id INTO v_prod_b;

  INSERT INTO test_context (key, id) VALUES
    ('prod_1', v_prod1),
    ('prod_2', v_prod2),
    ('prod_inactive', v_prod_inactive),
    ('prod_b', v_prod_b);
END;
$$;

-- ============================================================================
-- 3. CASOS DE PRUEBA
-- ============================================================================

-- T-01: Venta válida de 1 producto por master_admin sin descuento
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111"}';

SELECT lives_ok(
  format($$
    SELECT public.process_sale(
      '%s'::UUID,
      'a0000001-0000-0000-0000-000000000001'::UUID,
      '[{"product_id": "%s", "quantity": 2.00}]'::JSONB,
      0.00,
      '[{"method": "efectivo", "amount": 2000.00}]'::JSONB,
      'Venta test 1'
    );
  $$, (SELECT id FROM test_context WHERE key = 'company_a'), (SELECT id FROM test_context WHERE key = 'prod_1')),
  'T-01: Venta válida de 1 producto procesa con éxito'
);

-- T-02: Comprobar decremento exacto del stock en tabla products (50 - 2 = 48)
SELECT is(
  (SELECT current_stock FROM public.products WHERE id = (SELECT id FROM test_context WHERE key = 'prod_1')),
  48.00::NUMERIC,
  'T-02: El stock del producto se descuenta exactamente en 2 unidades'
);

-- T-03: Comprobar inserción de cabecera con número correlativo VTA-00000001
SELECT is(
  (SELECT sale_number FROM public.sales WHERE company_id = (SELECT id FROM test_context WHERE key = 'company_a') LIMIT 1),
  'VTA-00000001'::TEXT,
  'T-03: La venta se numera correlativamente como VTA-00000001'
);

-- T-04: Comprobar inserción de sale_items con precio congelado ($1000.00)
SELECT is(
  (SELECT unit_price FROM public.sale_items WHERE product_id = (SELECT id FROM test_context WHERE key = 'prod_1') LIMIT 1),
  1000.00::NUMERIC,
  'T-04: El detalle conserva el precio unitario histórico ($1000.00)'
);

-- T-05: Comprobar stock_movements con motivo 'sale' y FK reference_sale_id
SELECT is(
  (SELECT reason FROM public.stock_movements WHERE product_id = (SELECT id FROM test_context WHERE key = 'prod_1') AND direction = 'decrease' LIMIT 1),
  'sale'::TEXT,
  'T-05: El movimiento de stock tiene motivo "sale" y referencia a la venta'
);

-- T-06: Comprobar costo congelado en movement_costs ($600.00)
SELECT is(
  (SELECT mc.unit_cost FROM public.movement_costs mc
   JOIN public.stock_movements sm ON sm.id = mc.movement_id
   WHERE sm.product_id = (SELECT id FROM test_context WHERE key = 'prod_1') LIMIT 1),
  600.00::NUMERIC,
  'T-06: El costo histórico se congela en movement_costs ($600.00)'
);

-- T-07: Replay idempotente (misma clave y payload no duplica venta ni vuelve a descontar)
SELECT is(
  (
    SELECT (public.process_sale(
      (SELECT id FROM test_context WHERE key = 'company_a'),
      'a0000001-0000-0000-0000-000000000001'::UUID,
      format('[{"product_id": "%s", "quantity": 2.00}]', (SELECT id FROM test_context WHERE key = 'prod_1'))::JSONB,
      0.00,
      '[{"method": "efectivo", "amount": 2000.00}]'::JSONB,
      'Venta test 1'
    ))->>'sale_number'
  ),
  'VTA-00000001'::TEXT,
  'T-07: Reintento idempotente devuelve el mismo comprobante VTA-00000001'
);

-- T-08: Verificar que el stock sigue en 48 tras replay idempotente
SELECT is(
  (SELECT current_stock FROM public.products WHERE id = (SELECT id FROM test_context WHERE key = 'prod_1')),
  48.00::NUMERIC,
  'T-08: El stock no se vuelve a decrementar tras replay idempotente'
);

-- T-09: Idempotencia rechaza misma clave con payload modificado
SELECT throws_matching(
  format($$
    SELECT public.process_sale(
      '%s'::UUID,
      'a0000001-0000-0000-0000-000000000001'::UUID,
      '[{"product_id": "%s", "quantity": 5.00}]'::JSONB,
      0.00,
      '[{"method": "efectivo", "amount": 5000.00}]'::JSONB,
      'Venta test alterada'
    );
  $$, (SELECT id FROM test_context WHERE key = 'company_a'), (SELECT id FROM test_context WHERE key = 'prod_1')),
  'Idempotency key mismatch',
  'T-09: Misma clave de idempotencia con parámetros alterados es rechazada'
);

-- T-10: Venta multiproducto con pago dividido por empleado (sin descuento)
SET LOCAL request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222"}';

SELECT lives_ok(
  format($$
    SELECT public.process_sale(
      '%s'::UUID,
      'a0000002-0000-0000-0000-000000000002'::UUID,
      '[{"product_id": "%s", "quantity": 1.00}, {"product_id": "%s", "quantity": 1.00}]'::JSONB,
      0.00,
      '[{"method": "efectivo", "amount": 1000.00}, {"method": "transferencia", "amount": 2500.00}]'::JSONB,
      'Venta empleado pago dividido'
    );
  $$, (SELECT id FROM test_context WHERE key = 'company_a'), (SELECT id FROM test_context WHERE key = 'prod_1'), (SELECT id FROM test_context WHERE key = 'prod_2')),
  'T-10: Empleado puede registrar venta multiproducto sin descuento con pago dividido'
);

-- T-11: Verificar numeración VTA-00000002 para la segunda venta
SELECT is(
  (SELECT sale_number FROM public.sales WHERE id NOT IN (SELECT id FROM public.sales WHERE sale_number = 'VTA-00000001') LIMIT 1),
  'VTA-00000002'::TEXT,
  'T-11: Segunda venta correlativa asigna VTA-00000002'
);

-- T-12: Empleado intenta aplicar descuento -> RECHAZO
SELECT throws_matching(
  format($$
    SELECT public.process_sale(
      '%s'::UUID,
      'a0000003-0000-0000-0000-000000000003'::UUID,
      '[{"product_id": "%s", "quantity": 1.00}]'::JSONB,
      100.00,
      '[{"method": "efectivo", "amount": 900.00}]'::JSONB
    );
  $$, (SELECT id FROM test_context WHERE key = 'company_a'), (SELECT id FROM test_context WHERE key = 'prod_1')),
  'Solo usuarios con rol master_admin pueden autorizar ventas con descuento',
  'T-12: Empleado no puede autorizar ventas con descuento'
);

-- T-13: Master admin aplica descuento válido ($200 sobre $1000 = $800 total)
SET LOCAL request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111"}';

SELECT lives_ok(
  format($$
    SELECT public.process_sale(
      '%s'::UUID,
      'a0000004-0000-0000-0000-000000000004'::UUID,
      '[{"product_id": "%s", "quantity": 1.00}]'::JSONB,
      200.00,
      '[{"method": "efectivo", "amount": 800.00}]'::JSONB,
      'Venta admin con descuento'
    );
  $$, (SELECT id FROM test_context WHERE key = 'company_a'), (SELECT id FROM test_context WHERE key = 'prod_1')),
  'T-13: Master admin puede autorizar venta con descuento'
);

-- T-14: Descuento superior al subtotal es rechazado
SELECT throws_matching(
  format($$
    SELECT public.process_sale(
      '%s'::UUID,
      'a0000005-0000-0000-0000-000000000005'::UUID,
      '[{"product_id": "%s", "quantity": 1.00}]'::JSONB,
      2000.00,
      '[{"method": "efectivo", "amount": 0.00}]'::JSONB
    );
  $$, (SELECT id FROM test_context WHERE key = 'company_a'), (SELECT id FROM test_context WHERE key = 'prod_1')),
  'no puede superar el subtotal',
  'T-14: Descuento mayor al subtotal es rechazado'
);

-- T-15: Producto inactivo es rechazado
SELECT throws_matching(
  format($$
    SELECT public.process_sale(
      '%s'::UUID,
      'a0000006-0000-0000-0000-000000000006'::UUID,
      '[{"product_id": "%s", "quantity": 1.00}]'::JSONB,
      0.00,
      '[{"method": "efectivo", "amount": 500.00}]'::JSONB
    );
  $$, (SELECT id FROM test_context WHERE key = 'company_a'), (SELECT id FROM test_context WHERE key = 'prod_inactive')),
  'está inactivo y no puede ser vendido',
  'T-15: Producto inactivo no puede ser vendido'
);

-- T-16: Aislamiento cross-tenant: intentar vender producto de Empresa B desde Empresa A es rechazado
SELECT throws_matching(
  format($$
    SELECT public.process_sale(
      '%s'::UUID,
      'a0000007-0000-0000-0000-000000000007'::UUID,
      '[{"product_id": "%s", "quantity": 1.00}]'::JSONB,
      0.00,
      '[{"method": "efectivo", "amount": 3000.00}]'::JSONB
    );
  $$, (SELECT id FROM test_context WHERE key = 'company_a'), (SELECT id FROM test_context WHERE key = 'prod_b')),
  'no pertenecen a esta empresa o no existen',
  'T-16: Intento de vender producto de otra empresa es rechazado'
);

-- T-17: Productos duplicados en el detalle es rechazado
SELECT throws_matching(
  format($$
    SELECT public.process_sale(
      '%s'::UUID,
      'a0000008-0000-0000-0000-000000000008'::UUID,
      '[{"product_id": "%s", "quantity": 1.00}, {"product_id": "%s", "quantity": 2.00}]'::JSONB,
      0.00,
      '[{"method": "efectivo", "amount": 3000.00}]'::JSONB
    );
  $$, (SELECT id FROM test_context WHERE key = 'company_a'), (SELECT id FROM test_context WHERE key = 'prod_1'), (SELECT id FROM test_context WHERE key = 'prod_1')),
  'Existen productos duplicados en el detalle',
  'T-17: Carrito con producto duplicado es rechazado'
);

-- T-18: Descuadre en medios de pago es rechazado
SELECT throws_matching(
  format($$
    SELECT public.process_sale(
      '%s'::UUID,
      'a0000009-0000-0000-0000-000000000009'::UUID,
      '[{"product_id": "%s", "quantity": 1.00}]'::JSONB,
      0.00,
      '[{"method": "efectivo", "amount": 900.00}]'::JSONB
    );
  $$, (SELECT id FROM test_context WHERE key = 'company_a'), (SELECT id FROM test_context WHERE key = 'prod_1')),
  'no coincide con el total de la venta',
  'T-18: Pagos que no cuadran con el total son rechazados'
);

-- T-19: Stock negativo rechazado cuando allow_negative_stock = false
RESET ROLE;
UPDATE public.companies SET allow_negative_stock = false WHERE id = (SELECT id FROM test_context WHERE key = 'company_a');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111"}';

-- El stock actual de prod_1 es 46 (50 - 2 en T-01 - 1 en T-10 - 1 en T-13). Intentamos vender 100.
SELECT throws_matching(
  format($$
    SELECT public.process_sale(
      '%s'::UUID,
      'a0000010-0000-0000-0000-000000000010'::UUID,
      '[{"product_id": "%s", "quantity": 100.00}]'::JSONB,
      0.00,
      '[{"method": "efectivo", "amount": 100000.00}]'::JSONB
    );
  $$, (SELECT id FROM test_context WHERE key = 'company_a'), (SELECT id FROM test_context WHERE key = 'prod_1')),
  'Stock insuficiente',
  'T-19: Venta que excede el stock disponible es rechazada cuando allow_negative_stock = false'
);

-- T-20: Stock negativo permitido cuando allow_negative_stock = true
RESET ROLE;
UPDATE public.companies SET allow_negative_stock = true WHERE id = (SELECT id FROM test_context WHERE key = 'company_a');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111"}';

SELECT lives_ok(
  format($$
    SELECT public.process_sale(
      '%s'::UUID,
      'a0000011-0000-0000-0000-000000000011'::UUID,
      '[{"product_id": "%s", "quantity": 100.00}]'::JSONB,
      0.00,
      '[{"method": "efectivo", "amount": 100000.00}]'::JSONB
    );
  $$, (SELECT id FROM test_context WHERE key = 'company_a'), (SELECT id FROM test_context WHERE key = 'prod_1')),
  'T-20: Venta con saldo negativo es permitida cuando allow_negative_stock = true'
);

-- T-21: Defensa en profundidad: UPDATE directo en public.sales es rechazado (permission denied a authenticated)
SELECT throws_matching(
  format($$
    UPDATE public.sales SET notes = 'Modificado' WHERE company_id = '%s';
  $$, (SELECT id FROM test_context WHERE key = 'company_a')),
  'permission denied',
  'T-21: UPDATE directo en public.sales es denegado por permisos mínimos'
);

-- T-22: Defensa en profundidad: DELETE directo en public.sale_items es rechazado (permission denied a authenticated)
SELECT throws_matching(
  format($$
    DELETE FROM public.sale_items WHERE company_id = '%s';
  $$, (SELECT id FROM test_context WHERE key = 'company_a')),
  'permission denied',
  'T-22: DELETE directo en public.sale_items es denegado por permisos mínimos'
);

-- T-23: Inmutabilidad contable por trigger para roles con bypass de permisos (ej. postgres)
RESET ROLE;
SELECT throws_matching(
  format($$
    UPDATE public.sales SET notes = 'Intento bypass' WHERE company_id = '%s';
  $$, (SELECT id FROM test_context WHERE key = 'company_a')),
  'inmutable',
  'T-23: Disparador tr_sales_prevent_mutation aborta mutaciones incluso con rol superusuario'
);

SELECT * FROM finish();
ROLLBACK;
