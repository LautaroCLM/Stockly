-- ============================================================================
-- SUITE DE PRUEBAS TDD (pgTAP) - TANDA 2.2B (MIGRACIÓN 2)
-- Módulo: Políticas de Gobernanza (allow_negative_stock DEFAULT true,
--         set_company_negative_stock_policy) y Baja Auditada de Miembros
--         (deactivate_member + revocación inmediata de acceso RLS/RPC)
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
-- Estado: SUITE AISLADA E INDEPENDIENTE (Transacción con ROLLBACK)
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(20);

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
-- 2. SETUP INDEPENDIENTE: Tenants, Miembros y Productos Propios de esta Suite
-- ============================================================================
CREATE TEMP TABLE test_ctx_22b_m2 (
  key TEXT PRIMARY KEY,
  id UUID
);
GRANT SELECT, INSERT, UPDATE ON TABLE test_ctx_22b_m2 TO authenticated;

INSERT INTO auth.users (id, email) VALUES
  ('aaaa0002-0000-0000-0000-000000000001', 'owner_m2_a@stockly.local'),
  ('aaaa0002-0000-0000-0000-000000000002', 'admin2_m2_a@stockly.local'),
  ('aaaa0002-0000-0000-0000-000000000003', 'emp_m2_a@stockly.local'),
  ('bbbb0002-0000-0000-0000-000000000004', 'owner_m2_b@stockly.local');

-- Crear Empresa A con owner_m2_a
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0002-0000-0000-0000-000000000001';
SET LOCAL "request.jwt.claim.email" = 'owner_m2_a@stockly.local';

SELECT public.create_company('Empresa M2 Alpha', '30-71111111-1') AS comp_m2_a_id \gset
INSERT INTO test_ctx_22b_m2 VALUES ('comp_a', :'comp_m2_a_id');

-- Invitar a admin2_m2_a (como master_admin secundario) y a emp_m2_a (como employee)
SELECT public.invite_user_to_company(:'comp_m2_a_id', 'admin2_m2_a@stockly.local', 'master_admin') AS tok_admin2_m2 \gset
SELECT public.invite_user_to_company(:'comp_m2_a_id', 'emp_m2_a@stockly.local', 'employee') AS tok_emp_m2 \gset

-- Aceptar invitación de admin2_m2_a
SET LOCAL "request.jwt.claim.sub" = 'aaaa0002-0000-0000-0000-000000000002';
SET LOCAL "request.jwt.claim.email" = 'admin2_m2_a@stockly.local';
SELECT public.accept_company_invitation(:'tok_admin2_m2');

-- Aceptar invitación de emp_m2_a
SET LOCAL "request.jwt.claim.sub" = 'aaaa0002-0000-0000-0000-000000000003';
SET LOCAL "request.jwt.claim.email" = 'emp_m2_a@stockly.local';
SELECT public.accept_company_invitation(:'tok_emp_m2');

-- Crear Empresa B con owner_m2_b
SET LOCAL "request.jwt.claim.sub" = 'bbbb0002-0000-0000-0000-000000000004';
SET LOCAL "request.jwt.claim.email" = 'owner_m2_b@stockly.local';

SELECT public.create_company('Empresa M2 Beta', '30-70000004-0') AS comp_m2_b_id \gset
INSERT INTO test_ctx_22b_m2 VALUES ('comp_b', :'comp_m2_b_id');

RESET ROLE;

-- Insertar un producto en Empresa A para verificar pérdida de visibilidad RLS tras desactivar miembro
INSERT INTO public.products (company_id, sku, name, unit, selling_price, min_stock, current_stock)
VALUES (
  (SELECT id FROM test_ctx_22b_m2 WHERE key = 'comp_a'),
  'PROD-M2-01',
  'Producto Visibilidad M2',
  'unidad',
  1500.00,
  1.00,
  5.00
);

-- ============================================================================
-- 3. ASERCIONES TDD: POLÍTICA DE STOCK NEGATIVO (DEFAULT true Y RPC AUDITADA)
-- ============================================================================

-- T-01: Toda nueva empresa creada debe iniciar con allow_negative_stock = true por defecto
SELECT is(
  (SELECT allow_negative_stock FROM public.companies WHERE id = (SELECT id FROM test_ctx_22b_m2 WHERE key = 'comp_a')),
  true,
  'T-01: public.companies.allow_negative_stock debe tener DEFAULT true al crear una empresa nueva.'
);

-- T-02: Existencia de public.set_company_negative_stock_policy(UUID, BOOLEAN, TEXT)
SELECT has_function(
  'public',
  'set_company_negative_stock_policy',
  ARRAY['uuid', 'boolean', 'text'],
  'T-02: Debe existir la RPC public.set_company_negative_stock_policy(uuid, boolean, text).'
);

-- T-03: Seguridad y ACL efectiva de set_company_negative_stock_policy
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
    WHERE p.oid = pg_catalog.to_regprocedure('public.set_company_negative_stock_policy(uuid,boolean,text)')
  ),
  true,
  'T-03: set_company_negative_stock_policy debe ser SECURITY DEFINER, con search_path vacío y EXECUTE solo para authenticated.'
);

-- T-04: Negativo - Rol employee NO puede cambiar la política de stock negativo
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0002-0000-0000-0000-000000000003';
SET LOCAL "request.jwt.claim.email" = 'emp_m2_a@stockly.local';

SELECT throws_ok(
  format(
    'SELECT public.set_company_negative_stock_policy(''%s''::UUID, false, ''Intento por empleado'')',
    (SELECT id FROM test_ctx_22b_m2 WHERE key = 'comp_a')
  ),
  'P0001',
  'Operación restringida a usuarios con rol master_admin en esta empresa (rol actual: employee).',
  'T-04: set_company_negative_stock_policy invocado por employee debe ser rechazado con P0001.'
);

-- T-05: Negativo - master_admin de Empresa B NO puede cambiar la política de Empresa A
SET LOCAL "request.jwt.claim.sub" = 'bbbb0002-0000-0000-0000-000000000004';
SET LOCAL "request.jwt.claim.email" = 'owner_m2_b@stockly.local';

SELECT throws_ok(
  format(
    'SELECT public.set_company_negative_stock_policy(''%s''::UUID, false, ''Intento cruzado entre empresas'')',
    (SELECT id FROM test_ctx_22b_m2 WHERE key = 'comp_a')
  ),
  'P0001',
  'El usuario no es un miembro activo de esta empresa.',
  'T-05: set_company_negative_stock_policy invocado desde otra empresa debe ser rechazado con P0001.'
);

-- T-06: Negativo - Motivo nulo o vacío debe ser rechazado en set_company_negative_stock_policy
SET LOCAL "request.jwt.claim.sub" = 'aaaa0002-0000-0000-0000-000000000001';
SET LOCAL "request.jwt.claim.email" = 'owner_m2_a@stockly.local';

SELECT throws_ok(
  format(
    'SELECT public.set_company_negative_stock_policy(''%s''::UUID, false, ''   '')',
    (SELECT id FROM test_ctx_22b_m2 WHERE key = 'comp_a')
  ),
  'P0001',
  'Se requiere especificar un motivo justificatorio para cambiar la política de stock negativo.',
  'T-06: set_company_negative_stock_policy sin motivo válido debe fallar con P0001.'
);

-- T-07: Positivo - master_admin actualiza la política a false con motivo auditado
SELECT lives_ok(
  format(
    'SELECT public.set_company_negative_stock_policy(''%s''::UUID, false, ''Política estricta por auditoría anual'')',
    (SELECT id FROM test_ctx_22b_m2 WHERE key = 'comp_a')
  ),
  'T-07: master_admin puede cambiar allow_negative_stock mediante set_company_negative_stock_policy.'
);

RESET ROLE;

-- T-08: Verificación del cambio en companies y su registro en audit_log
SELECT is(
  (
    SELECT count(*)::INT
    FROM public.companies c
    JOIN public.audit_log a
      ON a.company_id = c.id
     AND a.table_name = 'companies'
     AND a.record_id = c.id::TEXT
     AND a.action = 'UPDATE'
    WHERE c.id = (SELECT id FROM test_ctx_22b_m2 WHERE key = 'comp_a')
      AND c.allow_negative_stock = false
      AND (a.old_data->>'allow_negative_stock')::BOOLEAN = true
      AND (a.new_data->>'allow_negative_stock')::BOOLEAN = false
      AND a.new_data->>'reason' = 'Política estricta por auditoría anual'
      AND a.performed_by = 'aaaa0002-0000-0000-0000-000000000001'::UUID
      AND a.actor_role = 'master_admin'
  ),
  1,
  'T-08: set_company_negative_stock_policy debe actualizar allow_negative_stock = false y registrar old_data, new_data y reason en audit_log.'
);

-- ============================================================================
-- 4. ASERCIONES TDD: BAJA AUDITADA DE MIEMBROS (public.deactivate_member)
-- ============================================================================

-- T-09: Existencia de public.deactivate_member(UUID, UUID, TEXT)
SELECT has_function(
  'public',
  'deactivate_member',
  ARRAY['uuid', 'uuid', 'text'],
  'T-09: Debe existir la RPC public.deactivate_member(uuid, uuid, text).'
);

-- T-10: Seguridad y ACL efectiva de deactivate_member
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
    WHERE p.oid = pg_catalog.to_regprocedure('public.deactivate_member(uuid,uuid,text)')
  ),
  true,
  'T-10: deactivate_member debe ser SECURITY DEFINER, con search_path vacío y EXECUTE solo para authenticated.'
);

-- T-11: Negativo - Rol employee NO puede desactivar miembros
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0002-0000-0000-0000-000000000003';
SET LOCAL "request.jwt.claim.email" = 'emp_m2_a@stockly.local';

SELECT throws_ok(
  format(
    'SELECT public.deactivate_member(''%s''::UUID, ''aaaa0002-0000-0000-0000-000000000002''::UUID, ''Intento empleado'')',
    (SELECT id FROM test_ctx_22b_m2 WHERE key = 'comp_a')
  ),
  'P0001',
  'Operación restringida a usuarios con rol master_admin en esta empresa (rol actual: employee).',
  'T-11: deactivate_member invocado por employee debe ser rechazado con P0001.'
);

-- T-12: Negativo - master_admin de otra empresa NO puede desactivar miembros de Empresa A
SET LOCAL "request.jwt.claim.sub" = 'bbbb0002-0000-0000-0000-000000000004';
SET LOCAL "request.jwt.claim.email" = 'owner_m2_b@stockly.local';

SELECT throws_ok(
  format(
    'SELECT public.deactivate_member(''%s''::UUID, ''aaaa0002-0000-0000-0000-000000000003''::UUID, ''Intento cruzado'')',
    (SELECT id FROM test_ctx_22b_m2 WHERE key = 'comp_a')
  ),
  'P0001',
  'El usuario no es un miembro activo de esta empresa.',
  'T-12: deactivate_member invocado por miembro de otra empresa debe ser rechazado con P0001.'
);

-- T-13: Negativo - Motivo vacío en deactivate_member debe ser rechazado
SET LOCAL "request.jwt.claim.sub" = 'aaaa0002-0000-0000-0000-000000000001';
SET LOCAL "request.jwt.claim.email" = 'owner_m2_a@stockly.local';

SELECT throws_ok(
  format(
    'SELECT public.deactivate_member(''%s''::UUID, ''aaaa0002-0000-0000-0000-000000000003''::UUID, ''   '')',
    (SELECT id FROM test_ctx_22b_m2 WHERE key = 'comp_a')
  ),
  'P0001',
  'Se requiere especificar un motivo justificatorio para la desactivación.',
  'T-13: deactivate_member sin motivo válido debe fallar con P0001.'
);

-- T-14: Negativo - Jerarquía: Un master_admin no titular (admin2_m2_a) NO puede desactivar a otro master_admin
SET LOCAL "request.jwt.claim.sub" = 'aaaa0002-0000-0000-0000-000000000002';
SET LOCAL "request.jwt.claim.email" = 'admin2_m2_a@stockly.local';

SELECT throws_ok(
  format(
    'SELECT public.deactivate_member(''%s''::UUID, ''aaaa0002-0000-0000-0000-000000000001''::UUID, ''Intento contra titular'')',
    (SELECT id FROM test_ctx_22b_m2 WHERE key = 'comp_a')
  ),
  'P0001',
  'Operación restringida: Solo el titular vigente de la empresa puede desactivar a un usuario con rol master_admin.',
  'T-14: Un master_admin que no es owner_id no puede desactivar a un master_admin.'
);

-- T-15: Negativo - Protección de titularidad y último master_admin: El titular vigente (owner_id) no puede desactivarse a sí mismo
SET LOCAL "request.jwt.claim.sub" = 'aaaa0002-0000-0000-0000-000000000001';
SET LOCAL "request.jwt.claim.email" = 'owner_m2_a@stockly.local';

SELECT throws_ok(
  format(
    'SELECT public.deactivate_member(''%s''::UUID, ''aaaa0002-0000-0000-0000-000000000001''::UUID, ''Intento de autobaja del titular'')',
    (SELECT id FROM test_ctx_22b_m2 WHERE key = 'comp_a')
  ),
  'P0001',
  'El titular vigente de la empresa no puede ser desactivado. Transfiera la titularidad previamente.',
  'T-15: El titular vigente (owner_id) no puede ser desactivado sin transferir antes la titularidad.'
);

-- T-16: Positivo - El master_admin desactiva formalmente a emp_m2_a con motivo justificado
SELECT lives_ok(
  format(
    'SELECT public.deactivate_member(''%s''::UUID, ''aaaa0002-0000-0000-0000-000000000003''::UUID, ''Finalización de vínculo laboral'')',
    (SELECT id FROM test_ctx_22b_m2 WHERE key = 'comp_a')
  ),
  'T-16: deactivate_member debe desactivar exitosamente al miembro employee con motivo justificado.'
);

RESET ROLE;

-- T-17: Verificación de is_active = false en company_members y registro en audit_log
SELECT is(
  (
    SELECT count(*)::INT
    FROM public.company_members cm
    JOIN public.audit_log a
      ON a.company_id = cm.company_id
     AND a.table_name = 'company_members'
     AND a.record_id = cm.id::TEXT
     AND a.action = 'UPDATE'
    WHERE cm.company_id = (SELECT id FROM test_ctx_22b_m2 WHERE key = 'comp_a')
      AND cm.user_id = 'aaaa0002-0000-0000-0000-000000000003'::UUID
      AND cm.is_active = false
      AND (a.old_data->>'is_active')::BOOLEAN = true
      AND (a.new_data->>'is_active')::BOOLEAN = false
      AND a.new_data->>'reason' = 'Finalización de vínculo laboral'
      AND a.performed_by = 'aaaa0002-0000-0000-0000-000000000001'::UUID
      AND a.actor_role = 'master_admin'
  ),
  1,
  'T-17: deactivate_member debe marcar is_active = false en company_members y auditar el cambio con reason.'
);

-- T-18: Negativo - Intentar desactivar nuevamente a un miembro que ya está inactivo debe fallar con P0001
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0002-0000-0000-0000-000000000001';
SET LOCAL "request.jwt.claim.email" = 'owner_m2_a@stockly.local';

SELECT throws_ok(
  format(
    'SELECT public.deactivate_member(''%s''::UUID, ''aaaa0002-0000-0000-0000-000000000003''::UUID, ''Segunda baja redundante'')',
    (SELECT id FROM test_ctx_22b_m2 WHERE key = 'comp_a')
  ),
  'P0001',
  'El usuario ya se encuentra inactivo en esta empresa.',
  'T-18: deactivate_member sobre un miembro ya inactivo debe ser rechazado con P0001.'
);

-- T-19: Seguridad post-baja - El miembro desactivado pierde inmediatamente visibilidad RLS sobre companies y products
SET LOCAL "request.jwt.claim.sub" = 'aaaa0002-0000-0000-0000-000000000003';
SET LOCAL "request.jwt.claim.email" = 'emp_m2_a@stockly.local';

SELECT is(
  (
    SELECT (
      (SELECT count(*)::INT FROM public.companies WHERE id = (SELECT id FROM test_ctx_22b_m2 WHERE key = 'comp_a')) +
      (SELECT count(*)::INT FROM public.products WHERE company_id = (SELECT id FROM test_ctx_22b_m2 WHERE key = 'comp_a'))
    )
  ),
  0,
  'T-19: El miembro desactivado debe ver 0 filas en companies y 0 filas en products de la empresa.'
);

-- T-20: Seguridad post-baja - El miembro desactivado es rechazado al invocar RPCs de la empresa (local_today)
SELECT throws_ok(
  format(
    'SELECT public.local_today(''%s''::UUID)',
    (SELECT id FROM test_ctx_22b_m2 WHERE key = 'comp_a')
  ),
  'P0001',
  'El usuario no es un miembro activo de esta empresa.',
  'T-20: El miembro desactivado no puede ejecutar local_today sobre la empresa y recibe P0001.'
);

SELECT * FROM finish();

ROLLBACK;
