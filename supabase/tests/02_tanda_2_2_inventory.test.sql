-- ============================================================================
-- SUITE DE PRUEBAS AUTOMATIZADAS (pgTAP) - TANDA 2.2A
-- Módulo: Catálogo, Inventario Físico, Costos, Idempotencia y Privilegios
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
-- Estado: SUITE DE PRUEBAS AISLADA (Se ejecuta en transacción con ROLLBACK)
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(26);

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
-- 2. SETUP: Creación de Tenants de Prueba y Usuarios
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
SET LOCAL "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
SET LOCAL "request.jwt.claim.email" = 'admin_a@stockly.local';

SELECT create_company('Empresa Test A', '30-71111111-1') AS company_a_id \gset
INSERT INTO test_context VALUES ('company_a', :'company_a_id');

-- Invitar y aceptar a employee_a en Empresa A
SELECT invite_user_to_company(:'company_a_id', 'employee_a@stockly.local', 'employee') AS token_emp_a \gset

SET LOCAL "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
SET LOCAL "request.jwt.claim.email" = 'employee_a@stockly.local';
SELECT accept_company_invitation(:'token_emp_a');

-- Crear Empresa B con admin_b
SET LOCAL "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
SET LOCAL "request.jwt.claim.email" = 'admin_b@stockly.local';
SELECT create_company('Empresa Test B', '30-70000004-0') AS company_b_id \gset
INSERT INTO test_context VALUES ('company_b', :'company_b_id');

RESET ROLE;

-- Contexto de IDs
DO $$
DECLARE
  v_comp_a UUID;
  v_comp_b UUID;
  v_cat_a UUID;
  v_sup_a UUID;
  v_prod_a1 UUID;
  v_prod_a2 UUID;
  v_prod_b1 UUID;
BEGIN
  SELECT id INTO v_comp_a FROM test_context WHERE key = 'company_a';
  SELECT id INTO v_comp_b FROM test_context WHERE key = 'company_b';

  -- Categoría y Proveedor en Empresa A
  INSERT INTO public.categories (company_id, name, description)
  VALUES (v_comp_a, 'Herramientas', 'Herramientas manuales')
  RETURNING id INTO v_cat_a;

  INSERT INTO public.suppliers (company_id, name, contact_name, email)
  VALUES (v_comp_a, 'Distribuidora Norte S.A.', 'Juan Perez', 'juan@distnorte.local')
  RETURNING id INTO v_sup_a;

  -- Producto A1: Indivisible (unidad), stock inicial 10.00
  INSERT INTO public.products (company_id, sku, name, category_id, supplier_id, unit, selling_price, min_stock, current_stock)
  VALUES (v_comp_a, 'TALADRO-01', 'Taladro Percutor 750W', v_cat_a, v_sup_a, 'unidad', 150000.00, 5.00, 10.00)
  RETURNING id INTO v_prod_a1;

  -- Producto A2: Fraccionario (kg), stock inicial 0.00 (para probar carga inicial)
  INSERT INTO public.products (company_id, sku, name, category_id, supplier_id, unit, selling_price, min_stock, current_stock)
  VALUES (v_comp_a, 'CLAVO-2PULG', 'Clavos de 2 Pulgadas', v_cat_a, v_sup_a, 'kg', 4500.50, 20.00, 0.00)
  RETURNING id INTO v_prod_a2;

  -- Costo de Producto A1
  INSERT INTO public.product_costs (company_id, product_id, cost_price, updated_by)
  VALUES (v_comp_a, v_prod_a1, 95000.00, '11111111-1111-1111-1111-111111111111');

  -- Producto en Empresa B
  INSERT INTO public.products (company_id, sku, name, unit, selling_price, min_stock, current_stock)
  VALUES (v_comp_b, 'AMOLADORA-B', 'Amoladora Angular B', 'unidad', 120000.00, 2.00, 5.00)
  RETURNING id INTO v_prod_b1;

  INSERT INTO test_context VALUES 
    ('cat_a', v_cat_a),
    ('sup_a', v_sup_a),
    ('prod_a1', v_prod_a1),
    ('prod_a2', v_prod_a2),
    ('prod_b1', v_prod_b1);
END;
$$;

-- ============================================================================
-- 3. TEST SUITE: pgTAP
-- ============================================================================

-- T-01: Privilegios de Tabla - Cliente authenticated NO puede hacer UPDATE directo a current_stock
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';

SELECT throws_ok(
  format('UPDATE public.products SET current_stock = 999.00 WHERE id = ''%s''', (SELECT id FROM test_context WHERE key = 'prod_a1')),
  '42501',
  NULL,
  'T-01: UPDATE directo a current_stock debe ser rechazado por falta de privilegios (42501).'
);

-- T-02: Privilegios de Tabla - Cliente authenticated NO puede hacer INSERT directo en stock_movements
SELECT throws_ok(
  format('INSERT INTO public.stock_movements (company_id, product_id, direction, reason, quantity, previous_stock, new_stock, created_by) VALUES (''%s'', ''%s'', ''increase'', ''initial_load'', 10, 0, 10, ''11111111-1111-1111-1111-111111111111'')',
    (SELECT id FROM test_context WHERE key = 'company_a'), (SELECT id FROM test_context WHERE key = 'prod_a1')),
  '42501',
  NULL,
  'T-02: INSERT directo a stock_movements debe ser rechazado por falta de privilegios (42501).'
);

-- T-03: Privilegios de Tabla - Cliente authenticated NO puede hacer INSERT directo en operation_idempotency
SELECT throws_ok(
  format('INSERT INTO public.operation_idempotency (company_id, operation_type, idempotency_key, request_hash, created_by) VALUES (''%s'', ''stock_adjustment'', gen_random_uuid(), ''abc'', ''11111111-1111-1111-1111-111111111111'')',
    (SELECT id FROM test_context WHERE key = 'company_a')),
  '42501',
  NULL,
  'T-03: INSERT directo a operation_idempotency debe ser rechazado por falta de privilegios (42501).'
);

-- T-04: RLS - Aislamiento entre Empresas (Admin A no puede ver productos de Empresa B)
SELECT is(
  (SELECT count(*)::INT FROM public.products WHERE company_id = (SELECT id FROM test_context WHERE key = 'company_b')),
  0,
  'T-04: RLS debe ocultar absolutamente los productos de Empresa B a un miembro de Empresa A.'
);

-- T-05: RLS - Ocultamiento de Costos para Rol employee
SET LOCAL "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
SET LOCAL "request.jwt.claim.email" = 'employee_a@stockly.local';

SELECT is(
  (SELECT count(*)::INT FROM public.product_costs WHERE company_id = (SELECT id FROM test_context WHERE key = 'company_a')),
  0,
  'T-05: RLS debe ocultar filas de product_costs al rol employee (0 filas devueltas).'
);

-- T-06: RLS - employee NO puede ejecutar RPC register_stock_adjustment (Exclusivo master_admin)
SELECT throws_ok(
  format('SELECT public.register_stock_adjustment(''%s'', gen_random_uuid(), ''%s'', ''increase'', ''physical_count'', 1.00)',
    (SELECT id FROM test_context WHERE key = 'company_a'), (SELECT id FROM test_context WHERE key = 'prod_a1')),
  'P0001',
  'Operación restringida a usuarios con rol master_admin en esta empresa (rol actual: employee).',
  'T-06: RPC register_stock_adjustment debe fallar si es invocada por employee.'
);

-- T-07: Validación de Motivos - Rechazo de motivos comerciales en ajuste manual
SET LOCAL "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
SET LOCAL "request.jwt.claim.email" = 'admin_a@stockly.local';

SELECT throws_ok(
  format('SELECT public.register_stock_adjustment(''%s'', gen_random_uuid(), ''%s'', ''decrease'', ''sale'', 1.00)',
    (SELECT id FROM test_context WHERE key = 'company_a'), (SELECT id FROM test_context WHERE key = 'prod_a1')),
  'P0001',
  'Motivo no autorizado para ajuste manual: sale. Motivos permitidos: physical_count, loss_damage, internal_use.',
  'T-07: Ajuste manual debe rechazar terminantemente motivos comerciales como ''sale''.'
);

-- T-08: Validación de Precisión Numérica - Rechazo de escala mayor a 2 sin redondeo silencioso
SELECT throws_ok(
  format('SELECT public.register_stock_adjustment(''%s'', gen_random_uuid(), ''%s'', ''increase'', ''physical_count'', 2.555)',
    (SELECT id FROM test_context WHERE key = 'company_a'), (SELECT id FROM test_context WHERE key = 'prod_a1')),
  'P0001',
  'La cantidad excede los 2 decimales permitidos: 2.555',
  'T-08: Cantidad con más de 2 decimales debe ser rechazada explícitamente.'
);

-- T-09: Validación de Unidades Indivisibles - Rechazo de fracciones en 'unidad'
SELECT throws_ok(
  format('SELECT public.register_stock_adjustment(''%s'', gen_random_uuid(), ''%s'', ''increase'', ''physical_count'', 1.50)',
    (SELECT id FROM test_context WHERE key = 'company_a'), (SELECT id FROM test_context WHERE key = 'prod_a1')),
  'P0001',
  'La unidad unidad es indivisible y no admite cantidades fraccionarias: 1.50',
  'T-09: Producto con unidad ''unidad'' debe rechazar cantidades fraccionarias como 1.50.'
);

-- T-10: Ajuste Exitoso y Atomicidad de Saldo Único (Trigger sincroniza stock exactamente 1 vez)
-- Stock inicial A1 = 10.00. Ajustamos +5.00 -> Debe resultar en exactamente 15.00
SELECT register_stock_adjustment(
  (SELECT id FROM test_context WHERE key = 'company_a'),
  'aaaa1111-aaaa-1111-aaaa-111111111111'::UUID,
  (SELECT id FROM test_context WHERE key = 'prod_a1'),
  'increase',
  'physical_count',
  5.00,
  'Recuento trimestral'
) AS adj_res_1 \gset

SELECT is(
  (SELECT current_stock FROM public.products WHERE id = (SELECT id FROM test_context WHERE key = 'prod_a1')),
  15.00,
  'T-10: El stock resultante debe ser exactamente 15.00 (el trigger actualiza 1 sola vez sin duplicar).'
);

-- T-11: Idempotencia - Replay idéntico devuelve la respuesta previa sin duplicar stock ni movimientos
SELECT is(
  public.register_stock_adjustment(
    (SELECT id FROM test_context WHERE key = 'company_a'),
    'aaaa1111-aaaa-1111-aaaa-111111111111'::UUID,
    (SELECT id FROM test_context WHERE key = 'prod_a1'),
    'increase',
    'physical_count',
    5.00,
    'Recuento trimestral'
  )->>'movement_id',
  :'adj_res_1'::jsonb->>'movement_id',
  'T-11: Replay con misma clave y parámetros debe devolver el mismo payload original.'
);

-- T-12: Idempotencia - Stock y movimientos permanecen intactos tras replay
SELECT is(
  (SELECT current_stock FROM public.products WHERE id = (SELECT id FROM test_context WHERE key = 'prod_a1')),
  15.00,
  'T-12: El stock no debe alterarse en un replay de idempotencia.'
);

SELECT is(
  (SELECT count(*)::INT FROM public.stock_movements WHERE notes = 'Recuento trimestral'),
  1,
  'T-12b: Debe existir exactamente 1 movimiento registrado tras el replay de idempotencia.'
);

-- T-13: Idempotencia - Rechazo de misma clave con parámetros distintos (Mismatch)
SELECT throws_ok(
  format('SELECT public.register_stock_adjustment(''%s'', ''aaaa1111-aaaa-1111-aaaa-111111111111''::UUID, ''%s'', ''increase'', ''physical_count'', 10.00)',
    (SELECT id FROM test_context WHERE key = 'company_a'), (SELECT id FROM test_context WHERE key = 'prod_a1')),
  'P0001',
  'Idempotency key mismatch: clave reutilizada con distintos parámetros.',
  'T-13: Reutilización de clave con diferente cantidad debe ser abortada con mismatch.'
);

-- T-14: Control de Stock Negativo - Rechazo en empresa restrictiva (allow_negative_stock = false)
-- Asegurar explícitamente allow_negative_stock = false en company_a para probar el bloqueo con independencia del DEFAULT de la tabla
RESET ROLE;
UPDATE public.companies SET allow_negative_stock = false WHERE id = (SELECT id FROM test_context WHERE key = 'company_a');
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
SET LOCAL "request.jwt.claim.email" = 'admin_a@stockly.local';

-- Stock actual = 15.00. Intentamos salida de 20.00
SELECT throws_ok(
  format('SELECT public.register_stock_adjustment(''%s'', gen_random_uuid(), ''%s'', ''decrease'', ''loss_damage'', 20.00)',
    (SELECT id FROM test_context WHERE key = 'company_a'), (SELECT id FROM test_context WHERE key = 'prod_a1')),
  'P0001',
  format('Stock insuficiente para el producto %s. Existencia actual: 15.00, solicitada: 20.00',
    (SELECT id FROM test_context WHERE key = 'prod_a1')),
  'T-14: Salida que deje saldo < 0 debe abortar con P0001 y mensaje exacto si allow_negative_stock = false.'
);

-- T-15: Rollback Completo - Verificar que tras el error de stock insuficiente no hubo cambios
SELECT is(
  (SELECT current_stock FROM public.products WHERE id = (SELECT id FROM test_context WHERE key = 'prod_a1')),
  15.00,
  'T-15: Tras error de stock insuficiente el balance de stock permanece intacto.'
);

-- T-16: Control de Stock Negativo - Permitido si allow_negative_stock = true
RESET ROLE;
UPDATE public.companies SET allow_negative_stock = true WHERE id = (SELECT id FROM test_context WHERE key = 'company_a');
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';

SELECT lives_ok(
  format('SELECT public.register_stock_adjustment(''%s'', gen_random_uuid(), ''%s'', ''decrease'', ''loss_damage'', 20.00)',
    (SELECT id FROM test_context WHERE key = 'company_a'), (SELECT id FROM test_context WHERE key = 'prod_a1')),
  'T-16: Con allow_negative_stock = true, la salida debe completarse permitiendo saldo negativo.'
);

SELECT is(
  (SELECT current_stock FROM public.products WHERE id = (SELECT id FROM test_context WHERE key = 'prod_a1')),
  -5.00,
  'T-16b: El saldo resultante en la base debe ser -5.00.'
);

-- T-17: Carga Inicial - Rechazo si lote está vacío
SELECT throws_ok(
  format('SELECT public.import_initial_stock(''%s'', gen_random_uuid(), ''[]''::jsonb)',
    (SELECT id FROM test_context WHERE key = 'company_a')),
  'P0001',
  'El lote de carga inicial no puede estar vacío.',
  'T-17: Carga inicial debe rechazar lote vacío.'
);

-- T-18: Carga Inicial - Rechazo de duplicados en el lote
SELECT throws_ok(
  format('SELECT public.import_initial_stock(''%s'', gen_random_uuid(), ''[{"product_id": "%s", "quantity": 10, "unit_cost": 50}, {"product_id": "%s", "quantity": 5, "unit_cost": 50}]''::jsonb)',
    (SELECT id FROM test_context WHERE key = 'company_a'), 
    (SELECT id FROM test_context WHERE key = 'prod_a2'), 
    (SELECT id FROM test_context WHERE key = 'prod_a2')),
  'P0001',
  'El lote contiene productos duplicados (mismo product_id repetido).',
  'T-18: Carga inicial debe rechazar lote con el mismo producto repetido.'
);

-- T-19: Carga Inicial - Rechazo si producto ya posee movimientos o stock previo
-- prod_a1 ya tuvo movimientos y stock (-5.00 tras T-16). No debe permitirse carga inicial sobre él.
SELECT throws_ok(
  format('SELECT public.import_initial_stock(''%s'', gen_random_uuid(), ''[{"product_id": "%s", "quantity": 10, "unit_cost": 50}]''::jsonb)',
    (SELECT id FROM test_context WHERE key = 'company_a'), (SELECT id FROM test_context WHERE key = 'prod_a1')),
  'P0001',
  format('El producto %s ya posee existencias registradas (-5.00). La carga inicial solo admite productos con stock cero.',
    (SELECT id FROM test_context WHERE key = 'prod_a1')),
  'T-19: Carga inicial debe ser rechazada con P0001 y mensaje exacto sobre productos que ya tienen stock o movimientos.'
);

-- T-20: Carga Inicial Exitosa e Idempotente sobre Producto Nuevo (prod_a2: stock 0 sin movimientos)
SELECT lives_ok(
  format('SELECT public.import_initial_stock(''%s'', ''bbbb2222-bbbb-2222-bbbb-222222222222''::UUID, ''[{"product_id": "%s", "quantity": 50.50, "unit_cost": 3200.00}]''::jsonb)',
    (SELECT id FROM test_context WHERE key = 'company_a'), (SELECT id FROM test_context WHERE key = 'prod_a2')),
  'T-20: Carga inicial sobre prod_a2 (fraccionario kg con stock cero) debe ejecutarse con éxito.'
);

SELECT is(
  (SELECT current_stock FROM public.products WHERE id = (SELECT id FROM test_context WHERE key = 'prod_a2')),
  50.50,
  'T-20b: El stock de prod_a2 tras la carga inicial debe ser exactamente 50.50.'
);

-- T-21a: Inmutabilidad (Capa Privilegios) - Cliente authenticated NO puede hacer UPDATE en stock_movements (42501)
SELECT throws_ok(
  format('UPDATE public.stock_movements SET quantity = 999.00 WHERE company_id = ''%s''', (SELECT id FROM test_context WHERE key = 'company_a')),
  '42501',
  NULL,
  'T-21a: UPDATE directo sobre stock_movements por authenticated debe fallar con 42501.'
);

-- T-21b: Inmutabilidad (Capa Trigger) - Como dueño de la tabla (RESET ROLE), el trigger bloquea el UPDATE sobre filas existentes
RESET ROLE;
SELECT throws_ok(
  format('UPDATE public.stock_movements SET quantity = 999.00 WHERE company_id = ''%s''', (SELECT id FROM test_context WHERE key = 'company_a')),
  'P0001',
  'La tabla stock_movements es inmutable: no se permiten modificaciones ni eliminaciones.',
  'T-21b: UPDATE sobre stock_movements como dueño debe ser bloqueado por prevent_immutable_modification().'
);

-- T-22: Integridad Referencial - Restricción de eliminación de Categoría con productos asociados
RESET ROLE;
SELECT throws_ok(
  format('DELETE FROM public.categories WHERE id = ''%s''', (SELECT id FROM test_context WHERE key = 'cat_a')),
  '23503',
  NULL,
  'T-22: DELETE sobre categoría con productos debe ser rechazado con violación de clave foránea (23503 ON DELETE RESTRICT).'
);

SELECT * FROM finish();

ROLLBACK;
