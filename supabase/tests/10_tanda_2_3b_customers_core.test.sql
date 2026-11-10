-- ============================================================================
-- SUITE DE PRUEBAS AUTOMATIZADAS (pgTAP) - TANDA 2.3B
-- Módulo: Núcleo de Clientes, Gobernanza Multiempresa, FK Sales y Auditoría
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
-- Estado: SUITE DE PRUEBAS AISLADA (Se ejecuta en transacción con ROLLBACK)
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(18);

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
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE test_context TO authenticated;

-- Crear Usuarios de prueba en auth.users
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin_a@stockly.local'),
  ('22222222-2222-2222-2222-222222222222', 'employee_a@stockly.local'),
  ('33333333-3333-3333-3333-333333333333', 'admin_b@stockly.local')
ON CONFLICT (id) DO NOTHING;

SET LOCAL ROLE authenticated;

-- Empresa A (admin_a)
SET LOCAL request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111"}';
SELECT public.create_company('Empresa Clientes A', '30-71111111-1', 'ARS', 'America/Argentina/Buenos_Aires');

INSERT INTO test_context (key, id)
SELECT 'company_a', id FROM public.companies WHERE name = 'Empresa Clientes A';

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
  PERFORM set_config('test.token_emp', v_token, true);
END;
$$;

-- Empresa B (admin_b)
SET LOCAL request.jwt.claims = '{"sub": "33333333-3333-3333-3333-333333333333"}';
SELECT public.create_company('Empresa Clientes B', '30-74444444-2', 'ARS', 'America/Argentina/Buenos_Aires');

INSERT INTO test_context (key, id)
SELECT 'company_b', id FROM public.companies WHERE name = 'Empresa Clientes B';

-- Aceptar invitación como employee_a en Empresa A
SET LOCAL request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222"}';
SELECT public.accept_company_invitation(current_setting('test.token_emp'));

RESET ROLE;

-- ============================================================================
-- 3. EJECUCIÓN DE PRUEBAS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TEST 1: Creación y persistencia de un cliente válido por master_admin
-- ----------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111"}';

DO $$
DECLARE
  v_comp_a UUID;
  v_cust_id UUID;
BEGIN
  SELECT id INTO v_comp_a FROM test_context WHERE key = 'company_a';

  -- CUIT válido: 20-30405060-9
  v_cust_id := public.upsert_customer(
    p_company_id := v_comp_a,
    p_name := 'Comercializadora del Sur S.R.L.',
    p_identification_type := 'CUIT',
    p_tax_id := '20-30405060-9',
    p_email := 'contacto@comercializadoradelsur.com',
    p_phone := '+54 11 4321-0000',
    p_address := 'Av. Corrientes 1234, CABA',
    p_notes := 'Cliente mayorista corporativo',
    p_is_active := true
  );

  INSERT INTO test_context (key, id) VALUES ('customer_1', v_cust_id);
END;
$$;

SELECT ok(
  EXISTS(
    SELECT 1 FROM public.customers
    WHERE id = (SELECT id FROM test_context WHERE key = 'customer_1')
      AND name = 'Comercializadora del Sur S.R.L.'
      AND tax_id = '20-30405060-9'
      AND is_active = true
  ),
  'Test 1: Creación y persistencia de un cliente corporativo válido con CUIT por master_admin'
);

-- ----------------------------------------------------------------------------
-- TEST 2: Consulta de clientes por parte de master_admin (RLS activo)
-- ----------------------------------------------------------------------------
SELECT is(
  (
    SELECT count(*)::INT
    FROM public.customers
    WHERE company_id = (SELECT id FROM test_context WHERE key = 'company_a')
  ),
  1,
  'Test 2: master_admin consulta los clientes de su empresa mediante RLS'
);

-- ----------------------------------------------------------------------------
-- TEST 3: Consulta de clientes por parte de employee (RLS activo)
-- ----------------------------------------------------------------------------
SET LOCAL request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222"}';

SELECT is(
  (
    SELECT count(*)::INT
    FROM public.customers
    WHERE company_id = (SELECT id FROM test_context WHERE key = 'company_a')
  ),
  1,
  'Test 3: employee consulta los clientes de su empresa mediante RLS para asociar en ventas'
);

-- ----------------------------------------------------------------------------
-- TEST 4: Creación de cliente consumidor final sin identificación fiscal
-- ----------------------------------------------------------------------------
SET LOCAL request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111"}';

DO $$
DECLARE
  v_comp_a UUID;
  v_cust2 UUID;
BEGIN
  SELECT id INTO v_comp_a FROM test_context WHERE key = 'company_a';

  v_cust2 := public.upsert_customer(
    p_company_id := v_comp_a,
    p_name := 'Consumidor Final Habitual',
    p_identification_type := 'DNI',
    p_tax_id := NULL,
    p_email := NULL,
    p_phone := NULL,
    p_address := NULL,
    p_notes := 'Cliente sin comprobante fiscal nominativo'
  );

  INSERT INTO test_context (key, id) VALUES ('customer_2', v_cust2);
END;
$$;

SELECT ok(
  EXISTS(
    SELECT 1 FROM public.customers
    WHERE id = (SELECT id FROM test_context WHERE key = 'customer_2')
      AND tax_id IS NULL
      AND is_active = true
  ),
  'Test 4: Creación exitosa de cliente sin CUIT (consumidor final / sin identificación)'
);

-- ----------------------------------------------------------------------------
-- TEST 5: Edición y persistencia de cambios en cliente existente
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_comp_a UUID;
  v_cust1 UUID;
BEGIN
  SELECT id INTO v_comp_a FROM test_context WHERE key = 'company_a';
  SELECT id INTO v_cust1 FROM test_context WHERE key = 'customer_1';

  PERFORM public.upsert_customer(
    p_company_id := v_comp_a,
    p_customer_id := v_cust1,
    p_name := 'Comercializadora del Sur S.A. (Actualizada)',
    p_identification_type := 'CUIT',
    p_tax_id := '20-30405060-9',
    p_email := 'pagos@comercializadoradelsur.com',
    p_phone := '+54 11 9999-8888',
    p_address := 'Av. Santa Fe 4567, CABA',
    p_notes := 'Razón social actualizada'
  );
END;
$$;

SELECT is(
  (
    SELECT name
    FROM public.customers
    WHERE id = (SELECT id FROM test_context WHERE key = 'customer_1')
  ),
  'Comercializadora del Sur S.A. (Actualizada)',
  'Test 5: Edición y persistencia de cambios sobre un cliente existente'
);

-- ----------------------------------------------------------------------------
-- TEST 6: Validación de campos obligatorios (nombre vacío rechazado)
-- ----------------------------------------------------------------------------
SELECT throws_ok(
  format(
    'SELECT public.upsert_customer(%L::UUID, %L, %L, %L);',
    (SELECT id FROM test_context WHERE key = 'company_a'),
    '   ',
    'DNI',
    NULL
  ),
  'El nombre del cliente es obligatorio y no puede superar 200 caracteres.',
  'Test 6: Rechazo estricto de cliente con nombre vacío o espacios'
);

-- ----------------------------------------------------------------------------
-- TEST 7: Validación de CUIT cuando corresponde (formato y módulo 11 inválido)
-- ----------------------------------------------------------------------------
SELECT throws_ok(
  format(
    'SELECT public.upsert_customer(%L::UUID, %L, %L, %L);',
    (SELECT id FROM test_context WHERE key = 'company_a'),
    'Cliente CUIT Inválido',
    'CUIT',
    '20-12345678-9'
  ),
  'El CUIT/CUIL ingresado no es válido según el algoritmo oficial.',
  'Test 7: Rechazo de cliente con CUIT inválido según algoritmo Módulo 11'
);

-- ----------------------------------------------------------------------------
-- TEST 8: Validación de tipo de identificación inválido
-- ----------------------------------------------------------------------------
SELECT throws_ok(
  format(
    'SELECT public.upsert_customer(%L::UUID, %L, %L, %L);',
    (SELECT id FROM test_context WHERE key = 'company_a'),
    'Cliente Tipo Inválido',
    'INVALID_TYPE',
    NULL
  ),
  'Tipo de identificación inválido: INVALID_TYPE. Solo se permiten DNI, CUIT, CUIL, PASAPORTE, OTRO o EXTRANJERO.',
  'Test 8: Rechazo de tipo de identificación no contemplado en el catálogo'
);

-- ----------------------------------------------------------------------------
-- TEST 9: Rechazo de identificación fiscal duplicada en la misma empresa
-- ----------------------------------------------------------------------------
SELECT throws_ok(
  format(
    'SELECT public.upsert_customer(%L::UUID, %L, %L, %L);',
    (SELECT id FROM test_context WHERE key = 'company_a'),
    'Empresa Clon CUIT',
    'CUIT',
    '20-30405060-9'
  ),
  'Ya existe un cliente registrado con la identificación 20-30405060-9 en esta empresa.',
  'Test 9: Rechazo por duplicidad de CUIT dentro de la misma empresa'
);

-- ----------------------------------------------------------------------------
-- TEST 10: Rechazo de mutación intentada por employee (sin autorización)
-- ----------------------------------------------------------------------------
SET LOCAL request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222"}';

SELECT throws_ok(
  format(
    'SELECT public.upsert_customer(%L::UUID, %L, %L, %L);',
    (SELECT id FROM test_context WHERE key = 'company_a'),
    'Cliente por Empleado',
    'DNI',
    NULL
  ),
  'No tenés permiso para esta operación. Pedile acceso al administrador.',
  'Test 10: Rechazo estricto de mutación (upsert_customer) cuando es intentada por un employee'
);

-- ----------------------------------------------------------------------------
-- TEST 11: Aislamiento estricto: Tenant B no puede ver los clientes de Tenant A
-- ----------------------------------------------------------------------------
SET LOCAL request.jwt.claims = '{"sub": "33333333-3333-3333-3333-333333333333"}';

SELECT is(
  (
    SELECT count(*)::INT
    FROM public.customers
    WHERE company_id = (SELECT id FROM test_context WHERE key = 'company_a')
  ),
  0,
  'Test 11: Aislamiento RLS: Admin de Tenant B no ve ningún cliente de Tenant A'
);

-- ----------------------------------------------------------------------------
-- TEST 12: Aislamiento estricto: Admin de Tenant B no puede modificar cliente de Tenant A
-- ----------------------------------------------------------------------------
SELECT throws_ok(
  format(
    'SELECT public.upsert_customer(%L::UUID, %L, %L, %L, NULL, NULL, NULL, NULL, %L::UUID);',
    (SELECT id FROM test_context WHERE key = 'company_a'),
    'Intrusión Tenant B',
    'DNI',
    NULL,
    (SELECT id FROM test_context WHERE key = 'customer_1')
  ),
  'El usuario no es un miembro activo de esta empresa.',
  'Test 12: Rechazo categórico al intentar modificar clientes de otra empresa'
);

-- ----------------------------------------------------------------------------
-- TEST 13: Integridad referencial: Rechazo de venta con cliente de otra empresa
-- ----------------------------------------------------------------------------
RESET ROLE;

-- Crear un cliente legítimo en Empresa B
DO $$
DECLARE
  v_comp_b UUID;
  v_cust_b UUID;
BEGIN
  SELECT id INTO v_comp_b FROM test_context WHERE key = 'company_b';

  INSERT INTO public.customers (company_id, name, identification_type, is_active)
  VALUES (v_comp_b, 'Cliente Exclusivo Empresa B', 'DNI', true)
  RETURNING id INTO v_cust_b;

  INSERT INTO test_context (key, id) VALUES ('customer_b', v_cust_b);
END;
$$;

-- Intentar insertar una venta en Empresa A asociando customer_b (de Empresa B)
-- La FK compuesta (company_id, customer_id) DEBE rechazar esta inserción
SELECT throws_ok(
  format(
    'INSERT INTO public.sales (company_id, sale_number, customer_id, subtotal, total_amount, created_by)
     VALUES (%L::UUID, %L, %L::UUID, 1000.00, 1000.00, %L::UUID);',
    (SELECT id FROM test_context WHERE key = 'company_a'),
    'V-TEST-CROSS-001',
    (SELECT id FROM test_context WHERE key = 'customer_b'),
    '11111111-1111-1111-1111-111111111111'
  ),
  'P0001',
  'El cliente especificado no existe en la empresa.',
  'Test 13: La regla de pertenencia multiempresa bloquea venta con cliente de otra empresa'
);

-- ----------------------------------------------------------------------------
-- TEST 14: Compatibilidad con ventas a consumidor final (customer_id = NULL)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_comp_a UUID;
  v_sale_id UUID;
BEGIN
  SELECT id INTO v_comp_a FROM test_context WHERE key = 'company_a';

  INSERT INTO public.sales (company_id, sale_number, customer_id, subtotal, total_amount, created_by)
  VALUES (v_comp_a, 'V-TEST-CF-001', NULL, 1500.00, 1500.00, '11111111-1111-1111-1111-111111111111')
  RETURNING id INTO v_sale_id;

  INSERT INTO test_context (key, id) VALUES ('sale_cf', v_sale_id);
END;
$$;

SELECT ok(
  EXISTS(
    SELECT 1 FROM public.sales
    WHERE id = (SELECT id FROM test_context WHERE key = 'sale_cf')
      AND customer_id IS NULL
  ),
  'Test 14: Compatibilidad plena con ventas a consumidor final (customer_id = NULL)'
);

-- ----------------------------------------------------------------------------
-- TEST 15: Conservación y consulta de ventas históricas existentes
-- ----------------------------------------------------------------------------
-- Se asocia una venta legítima a customer_1 en Empresa A
DO $$
DECLARE
  v_comp_a UUID;
  v_cust_1 UUID;
  v_sale_id UUID;
BEGIN
  SELECT id INTO v_comp_a FROM test_context WHERE key = 'company_a';
  SELECT id INTO v_cust_1 FROM test_context WHERE key = 'customer_1';

  INSERT INTO public.sales (company_id, sale_number, customer_id, subtotal, total_amount, created_by)
  VALUES (v_comp_a, 'V-TEST-NOM-001', v_cust_1, 5000.00, 5000.00, '11111111-1111-1111-1111-111111111111')
  RETURNING id INTO v_sale_id;

  INSERT INTO test_context (key, id) VALUES ('sale_nominada', v_sale_id);
END;
$$;

SELECT is(
  (
    SELECT c.name
    FROM public.sales s
    JOIN public.customers c ON c.id = s.customer_id AND c.company_id = s.company_id
    WHERE s.id = (SELECT id FROM test_context WHERE key = 'sale_nominada')
  ),
  'Comercializadora del Sur S.A. (Actualizada)',
  'Test 15: Vinculación comercial e integridad relacional entre ventas y clientes'
);

-- ----------------------------------------------------------------------------
-- TEST 16: Rechazo de eliminación física de clientes (inmutabilidad)
-- ----------------------------------------------------------------------------
SELECT throws_ok(
  format(
    'DELETE FROM public.customers WHERE id = %L::UUID;',
    (SELECT id FROM test_context WHERE key = 'customer_1')
  ),
  'No se permite la eliminación física de clientes para preservar el historial comercial. Utilice la desactivación lógica (is_active = false).',
  'Test 16: El trigger de inmutabilidad bloquea cualquier intento de DELETE físico sobre clientes'
);

-- ----------------------------------------------------------------------------
-- TEST 17: Auditoría atómica de operaciones autorizadas (audit_log)
-- ----------------------------------------------------------------------------
SELECT is(
  (
    SELECT count(*)::INT
    FROM public.audit_log
    WHERE company_id = (SELECT id FROM test_context WHERE key = 'company_a')
      AND table_name = 'customers'
      AND record_id = (SELECT id::TEXT FROM test_context WHERE key = 'customer_1')
      AND action IN ('INSERT', 'UPDATE')
  ),
  2,
  'Test 17: Se registraron exactamente 2 eventos auditados (INSERT y UPDATE) en audit_log para customer_1'
);

-- ----------------------------------------------------------------------------
-- TEST 18: Prevención de nuevas asociaciones de ventas a clientes inactivos
-- ----------------------------------------------------------------------------
-- Desactivar lógicamente customer_2
DO $$
DECLARE
  v_comp_a UUID;
  v_cust_2 UUID;
BEGIN
  SELECT id INTO v_comp_a FROM test_context WHERE key = 'company_a';
  SELECT id INTO v_cust_2 FROM test_context WHERE key = 'customer_2';

  UPDATE public.customers
  SET is_active = false
  WHERE id = v_cust_2;
END;
$$;

-- Intentar asociar una nueva venta a customer_2 desactivado -> Debe ser rechazada
SELECT throws_ok(
  format(
    'INSERT INTO public.sales (company_id, sale_number, customer_id, subtotal, total_amount, created_by)
     VALUES (%L::UUID, %L, %L::UUID, 2000.00, 2000.00, %L::UUID);',
    (SELECT id FROM test_context WHERE key = 'company_a'),
    'V-TEST-INACTIVE-001',
    (SELECT id FROM test_context WHERE key = 'customer_2'),
    '11111111-1111-1111-1111-111111111111'
  ),
  'No se pueden registrar ventas asociadas a un cliente inactivo.',
  'Test 18: Rechazo categórico al intentar registrar una venta con un cliente inactivo'
);

-- ============================================================================
-- 4. FINALIZACIÓN Y ROLLBACK DE LA SUITE
-- ============================================================================
SELECT * FROM finish();
ROLLBACK;
