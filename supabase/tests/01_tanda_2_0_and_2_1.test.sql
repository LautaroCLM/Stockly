-- ============================================================================
-- SUITE DE PRUEBAS AUTOMATIZADAS (pgTAP) - TANDAS 2.0 Y 2.1 (CORREGIDA)
-- Módulo: Verificación de Aislamiento Multiempresa, Gobernanza, Triggers y RLS
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
-- Estado: SUITE DE PRUEBAS AISLADA (Se ejecuta en transacción con ROLLBACK)
-- ============================================================================

BEGIN;

-- Habilitar extensión pgTAP en entorno de pruebas
CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(58);

-- ============================================================================
-- M-05: ESTRATEGIA DE PERMISOS PARA EL ARNÉS DE PRUEBAS (TEST HARNESS)
-- Se conceden permisos de ejecución a authenticated EXCLUSIVAMENTE sobre las
-- funciones del arnés pgTAP (is, lives_ok, throws_ok, etc.) dentro de esta
-- transacción temporal descartada con ROLLBACK.
-- Esto EVITA enmascarar cualquier omisión de GRANT sobre funciones de la aplicación.
-- ============================================================================
DO $$
DECLARE
  r RECORD;
  v_schema TEXT;
BEGIN
  -- 1. Descubrir el esquema real donde reside la extensión pgTAP y otorgar USAGE en esta transacción
  SELECT n.nspname INTO v_schema
  FROM pg_catalog.pg_extension e
  JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pgtap';

  IF v_schema IS NOT NULL THEN
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO authenticated;', v_schema);
  END IF;

  -- 2. Conceder EXECUTE a authenticated sobre las funciones específicas de pgTAP en su esquema real
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
END $$;

-- ============================================================================
-- 1. IDENTIDAD Y PERFILES NEUTROS (handle_new_user)
-- ============================================================================

-- Simulación de creación de usuarios en auth.users
-- Usuario 1: Creador y Titular de Empresa Alpha
INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'titular_alpha@stockly.test',
  '{"full_name": "Carlos Alpha", "role": "hacker_intent"}'::jsonb,
  now(), now()
);

-- TEST 1: El trigger handle_new_user crea un perfil neutro e ignora roles inyectados en metadata
SELECT is(
  (SELECT full_name FROM public.profiles WHERE id = '11111111-1111-1111-1111-111111111111'),
  'Carlos Alpha',
  'handle_new_user debe registrar correctamente el nombre provisto en metadata'
);

-- TEST 2: La tabla profiles no contiene columnas corporativas (role, is_active, etc.)
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name IN ('role', 'is_active', 'employee_id')
  ),
  'profiles debe ser neutra y no poseer columnas role, is_active ni employee_id'
);

-- Usuario 2: Segundo usuario (futuro admin invitado de Alpha)
INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
VALUES ('22222222-2222-2222-2222-222222222222', 'segundo_admin@stockly.test', '{"full_name": "Marcos Segundo"}'::jsonb, now(), now());

-- Usuario 3: Empleada de Alpha
INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
VALUES ('33333333-3333-3333-3333-333333333333', 'empleada_alpha@stockly.test', '{"full_name": "Elena Empleada"}'::jsonb, now(), now());

-- Usuario 4: Titular de Empresa Beta (Tenant competidor completamente independiente)
INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
VALUES ('44444444-4444-4444-4444-444444444444', 'titular_beta@stockly.test', '{"full_name": "Beatriz Beta"}'::jsonb, now(), now());

-- Usuario 5: Usuario con mayúsculas en el email para probar H-06
INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
VALUES ('55555555-5555-5555-5555-555555555555', 'Usuario_MAYUSCULAS@Stockly.Test', '{"full_name": "Usuario Mayus"}'::jsonb, now(), now());

-- Usuario 7: Titular de Empresa Gamma (para pruebas de ciclo de vida de invitaciones)
INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
VALUES ('77777777-7777-7777-7777-777777777777', 'titular_gamma@stockly.test', '{"full_name": "Guillermo Gamma"}'::jsonb, now(), now());

-- ============================================================================
-- 2. CREACIÓN ATÓMICA DE EMPRESAS (create_company)
-- ============================================================================

-- Simular sesión autenticada como Carlos Alpha (Usuario 1)
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('role', 'authenticated', true);

-- TEST 3: create_company para Alpha con CUIT verificado bajo Módulo 11 (30-71111111-1)
SELECT lives_ok(
  $$ SELECT public.create_company('Empresa Alpha S.A.', '30-71111111-1', 'ARS', 'America/Argentina/Buenos_Aires') $$,
  'create_company ejecutado por un usuario autenticado debe completarse con éxito'
);

-- Variable local para capturar el company_id de Alpha
DO $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id FROM public.companies WHERE name = 'Empresa Alpha S.A.';
  PERFORM set_config('test.alpha_id', v_id::text, true);
END $$;

-- TEST 4: Verificación de membresía automática de master_admin para el creador
SELECT is(
  (
    SELECT role FROM public.company_members
    WHERE company_id = current_setting('test.alpha_id')::uuid
      AND user_id = '11111111-1111-1111-1111-111111111111'
  ),
  'master_admin',
  'El creador de la empresa debe quedar registrado automáticamente como master_admin'
);

-- TEST 5: Inicialización de contadores transaccionales de venta y compra en 0
RESET ROLE;
SELECT is(
  (
    SELECT count(*) FROM public.company_counters
    WHERE company_id = current_setting('test.alpha_id')::uuid
      AND kind IN ('sale', 'purchase')
      AND last_value = 0
  ),
  2::bigint,
  'create_company debe inicializar los contadores de venta y compra en 0'
);

-- Ahora simular creación de Empresa Beta por Beatriz Beta (Usuario 4)
SELECT set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
SELECT set_config('role', 'authenticated', true);

-- TEST 6: Creación independiente de Empresa Beta
SELECT lives_ok(
  $$ SELECT public.create_company('Distribuidora Beta SRL', '30-74444444-2', 'ARS', 'America/Argentina/Buenos_Aires') $$,
  'Beatriz Beta puede crear su propia empresa Beta de forma independiente con CUIT válido'
);

DO $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id FROM public.companies WHERE name = 'Distribuidora Beta SRL';
  PERFORM set_config('test.beta_id', v_id::text, true);
END $$;

-- ============================================================================
-- 3. PRUEBAS NEGATIVAS DE HERMETICIDAD RLS (Cross-Tenant Isolation)
-- ============================================================================

-- Simular sesión activa como Beatriz Beta (Usuario 4 de Empresa Beta)
SELECT set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
SELECT set_config('role', 'authenticated', true);

-- TEST 7: Beatriz Beta consulta companies -> NO debe ver a Empresa Alpha
SELECT is(
  (
    SELECT count(*) FROM public.companies
    WHERE id = current_setting('test.alpha_id')::uuid
  ),
  0::bigint,
  'RLS NEGATIVO: Miembro de Empresa Beta no debe poder ver a Empresa Alpha en companies'
);

-- TEST 8: Beatriz Beta consulta company_members -> NO debe ver a los miembros de Empresa Alpha
SELECT is(
  (
    SELECT count(*) FROM public.company_members
    WHERE company_id = current_setting('test.alpha_id')::uuid
  ),
  0::bigint,
  'RLS NEGATIVO: Miembro de Empresa Beta no debe poder ver los miembros de Empresa Alpha'
);

-- TEST 9: Beatriz Beta intenta invocar una RPC sobre Empresa Alpha -> Bloqueo por assert_company_role
SELECT throws_ok(
  format('SELECT public.invite_user_to_company(%L::uuid, %L, %L)', current_setting('test.alpha_id'), 'infiltrado@beta.test', 'employee'),
  'El usuario no es un miembro activo de esta empresa.',
  'RPC NEGATIVO: Usuario no perteneciente a una empresa debe ser rechazado al invocar sus funciones'
);

-- ============================================================================
-- 4. GOBERNANZA, INVITACIONES Y JERARQUÍA DE TITULARIDAD
-- ============================================================================

-- Simular sesión de Carlos Alpha (Titular de Empresa Alpha)
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('role', 'authenticated', true);

-- TEST 10: Titular invita a un segundo admin (Marcos Segundo)
DO $$
DECLARE
  v_token TEXT;
BEGIN
  v_token := public.invite_user_to_company(current_setting('test.alpha_id')::uuid, 'segundo_admin@stockly.test', 'master_admin');
  PERFORM set_config('test.token_admin2', v_token, true);
END $$;

SELECT ok(
  length(current_setting('test.token_admin2')) = 64,
  'invite_user_to_company debe retornar un token hexadecimal de 64 caracteres (32 bytes)'
);

-- TEST 11: Marcos Segundo (Usuario 2) acepta la invitación
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('role', 'authenticated', true);

SELECT lives_ok(
  format('SELECT public.accept_company_invitation(%L)', current_setting('test.token_admin2')),
  'accept_company_invitation debe completarse con éxito al proveer el token válido'
);

-- TEST 12 (HN-01): Reintento de canje del mismo token ya consumido es rechazado
SELECT throws_ok(
  format('SELECT public.accept_company_invitation(%L)', current_setting('test.token_admin2')),
  'La invitación es inválida, ha expirado o ya ha sido utilizada.',
  'HN-01 SECUENCIAL: Intentar reutilizar un token ya aceptado es rechazado inmediatamente'
);

-- TEST 13: Jerarquía estricta - Marcos Segundo (admin común, no titular) intenta invitar a otro master_admin
SELECT throws_ok(
  format('SELECT public.invite_user_to_company(%L::uuid, %L, %L)', current_setting('test.alpha_id'), 'otro_admin@stockly.test', 'master_admin'),
  'Operación restringida: Solo el titular (owner_id) de la empresa puede invitar a un nuevo master_admin.',
  'JERARQUÍA NEGATIVA: Un master_admin común no debe poder invitar a otro master_admin'
);

-- TEST 14: Marcos Segundo sí puede invitar a una employee
DO $$
DECLARE
  v_token TEXT;
BEGIN
  v_token := public.invite_user_to_company(current_setting('test.alpha_id')::uuid, 'empleada_alpha@stockly.test', 'employee');
  PERFORM set_config('test.token_emp', v_token, true);
END $$;

SELECT ok(
  length(current_setting('test.token_emp')) = 64,
  'Un master_admin común sí puede invitar a colaboradores con rol employee'
);

-- TEST 15: Intentar aceptar la invitación de empleada con una cuenta no autorizada (Usuario 4)
SELECT set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
SELECT set_config('role', 'authenticated', true);

SELECT throws_ok(
  format('SELECT public.accept_company_invitation(%L)', current_setting('test.token_emp')),
  'Esta invitación fue emitida para empleada_alpha@stockly.test y tu cuenta corresponde a titular_beta@stockly.test.',
  'INVITACIÓN NEGATIVA: No se puede canjear una invitación dirigida a otro correo electrónico'
);

-- TEST 16: Elena Empleada (Usuario 3) acepta su invitación correctamente
SELECT set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
SELECT set_config('role', 'authenticated', true);

SELECT lives_ok(
  format('SELECT public.accept_company_invitation(%L)', current_setting('test.token_emp')),
  'El usuario legítimo puede aceptar su invitación como employee'
);

-- TEST 17: Empleada intenta invitar a otro usuario -> rechazo por falta de rol master_admin
SELECT throws_ok(
  format('SELECT public.invite_user_to_company(%L::uuid, %L, %L)', current_setting('test.alpha_id'), 'amigo@stockly.test', 'employee'),
  'Operación restringida a usuarios con rol master_admin en esta empresa (rol actual: employee).',
  'JERARQUÍA NEGATIVA: Un employee no debe poder emitir invitaciones'
);

-- ============================================================================
-- 5. H-02: PRUEBAS DE PERMISOS DIRECTOS VS. PRUEBAS FUNCIONALES DE DISPARADORES
-- ============================================================================

-- 5.A. PRUEBAS DE DENEGACIÓN DE PERMISOS SQL PARA ROL AUTHENTICATED
SELECT set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
SELECT set_config('role', 'authenticated', true);

-- TEST 18: Intento de UPDATE directo en company_members debe ser denegado por permisos SQL de tabla
SELECT throws_matching(
  format('UPDATE public.company_members SET role = %L WHERE company_id = %L::uuid AND user_id = %L::uuid',
    'employee', current_setting('test.beta_id'), '44444444-4444-4444-4444-444444444444'),
  'permission denied for table company_members',
  'PERMISOS NEGATIVOS: authenticated no puede ejecutar UPDATE directo en company_members'
);

-- TEST 19: Intento de DELETE directo en company_members debe ser denegado por permisos SQL de tabla
SELECT throws_matching(
  format('DELETE FROM public.company_members WHERE company_id = %L::uuid', current_setting('test.beta_id')),
  'permission denied for table company_members',
  'PERMISOS NEGATIVOS: authenticated no puede ejecutar DELETE directo en company_members'
);

-- 5.B. PRUEBAS FUNCIONALES DEL DISPARADOR check_last_active_master_admin
-- Conmutar al rol postgres para contar con permisos de tabla y validar exclusivamente el trigger
RESET ROLE;

-- TEST 20: Disparador impide degradar al único master_admin activo
SELECT throws_ok(
  format('UPDATE public.company_members SET role = %L WHERE company_id = %L::uuid AND user_id = %L::uuid',
    'employee', current_setting('test.beta_id'), '44444444-4444-4444-4444-444444444444'),
  'No se puede desactivar, degradar ni remover el único master_admin activo de la empresa.',
  'DISPARADOR FUNCIONAL: Impide degradar al único master_admin activo'
);

-- TEST 21: Disparador impide desactivar al único master_admin activo
SELECT throws_ok(
  format('UPDATE public.company_members SET is_active = false WHERE company_id = %L::uuid AND user_id = %L::uuid',
    current_setting('test.beta_id'), '44444444-4444-4444-4444-444444444444'),
  'No se puede desactivar, degradar ni remover el único master_admin activo de la empresa.',
  'DISPARADOR FUNCIONAL: Impide desactivar al único master_admin activo'
);

-- ============================================================================
-- 6. TRANSFERENCIA DE TITULARIDAD
-- ============================================================================

-- En Empresa Alpha (Carlos Alpha es owner_id; Marcos Segundo es master_admin)
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('role', 'authenticated', true);

-- TEST 22: Carlos Alpha transfiere la titularidad a Marcos Segundo
SELECT lives_ok(
  format('SELECT public.transfer_company_ownership(%L::uuid, %L::uuid)',
    current_setting('test.alpha_id'), '22222222-2222-2222-2222-222222222222'),
  'El titular actual puede transferir la titularidad a otro master_admin activo'
);

-- TEST 23: Verificar que owner_id se actualizó en la tabla companies
SELECT is(
  (
    SELECT owner_id FROM public.companies
    WHERE id = current_setting('test.alpha_id')::uuid
  ),
  '22222222-2222-2222-2222-222222222222'::uuid,
  'owner_id debe apuntar ahora al nuevo titular Marcos Segundo'
);

-- TEST 24 (HN-02): Verificar que created_by permanece inalterado tras el cambio de owner_id
SELECT is(
  (
    SELECT created_by FROM public.companies
    WHERE id = current_setting('test.alpha_id')::uuid
  ),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'HN-02: created_by permanece inalterado tras transferir la titularidad de la empresa'
);

-- TEST 25: Carlos Alpha (ya no es titular) intenta transferir de nuevo -> Rechazado
SELECT throws_ok(
  format('SELECT public.transfer_company_ownership(%L::uuid, %L::uuid)',
    current_setting('test.alpha_id'), '11111111-1111-1111-1111-111111111111'),
  'Operación denegada: Solo el titular vigente de la empresa puede transferir la titularidad.',
  'TITULARIDAD NEGATIVA: Quien ya no es titular vigente no puede realizar transferencias'
);

-- ============================================================================
-- 7. H-02: INMUTABILIDAD DE AUDITORÍA (PERMISOS DIRECTOS VS. DISPARADOR)
-- ============================================================================

-- 7.A. Permisos directos de authenticated denegados
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('role', 'authenticated', true);

-- TEST 26: Intento de UPDATE directo en audit_log denegado por permisos SQL
SELECT throws_matching(
  $$ UPDATE public.audit_log SET table_name = 'hack' WHERE table_name = 'companies' $$,
  'permission denied for table audit_log',
  'PERMISOS NEGATIVOS: authenticated no puede ejecutar UPDATE directo en audit_log'
);

-- TEST 27: Intento de DELETE directo en audit_log denegado por permisos SQL
SELECT throws_matching(
  $$ DELETE FROM public.audit_log $$,
  'permission denied for table audit_log',
  'PERMISOS NEGATIVOS: authenticated no puede ejecutar DELETE directo en audit_log'
);

-- 7.B. Prueba funcional del disparador prevent_immutable_modification
RESET ROLE;

-- TEST 28: Disparador impide UPDATE en audit_log incluso para roles con permiso de tabla
SELECT throws_ok(
  $$ UPDATE public.audit_log SET table_name = 'hack' WHERE table_name = 'companies' $$,
  'La tabla audit_log es inmutable: no se permiten modificaciones ni eliminaciones.',
  'DISPARADOR FUNCIONAL: prevent_immutable_modification rechaza UPDATE'
);

-- TEST 29: Disparador impide DELETE en audit_log
SELECT throws_ok(
  $$ DELETE FROM public.audit_log $$,
  'La tabla audit_log es inmutable: no se permiten modificaciones ni eliminaciones.',
  'DISPARADOR FUNCIONAL: prevent_immutable_modification rechaza DELETE'
);

-- 7.C. Prueba funcional del disparador protect_company_created_by (HN-02)
-- TEST 30: Disparador impide mutar created_by en companies incluso para superusuarios o roles autorizados
SELECT throws_ok(
  format('UPDATE public.companies SET created_by = %L::uuid WHERE id = %L::uuid',
    '99999999-9999-9999-9999-999999999999', current_setting('test.alpha_id')),
  'El campo created_by es estrictamente inmutable tras la creación de la empresa.',
  'HN-02 DISPARADOR FUNCIONAL: protect_company_created_by rechaza cualquier mutación de created_by'
);

-- ============================================================================
-- 8. H-03: GOBERNANZA DE REVOCACIÓN Y REACTIVACIÓN DE MEMBRESÍAS
-- ============================================================================

-- Simular desactivación de la membresía de Elena Empleada en Alpha por parte de un admin
RESET ROLE;
UPDATE public.company_members
SET is_active = false
WHERE company_id = current_setting('test.alpha_id')::uuid
  AND user_id = '33333333-3333-3333-3333-333333333333';

-- Conmutar a sesión de Marcos Segundo (Titular de Alpha)
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('role', 'authenticated', true);

-- TEST 31: Intento de emitir invitación ordinaria a usuario con membresía inactiva debe ser rechazado
SELECT throws_ok(
  format('SELECT public.invite_user_to_company(%L::uuid, %L, %L)', current_setting('test.alpha_id'), 'empleada_alpha@stockly.test', 'employee'),
  'El usuario empleada_alpha@stockly.test posee una membresía inactiva previa en esta empresa. Debe ser reactivado mediante reactivate_member indicando el motivo.',
  'H-03 NEGATIVO: Una invitación ordinaria no puede cursarse a un miembro revocado'
);

-- TEST 32: Reactivación explícita mediante reactivate_member con motivo auditado y rol asignado
SELECT lives_ok(
  format('SELECT public.reactivate_member(%L::uuid, %L::uuid, %L, %L)',
    current_setting('test.alpha_id'), '33333333-3333-3333-3333-333333333333', 'employee', 'Reincorporación formal tras auditoría interna'),
  'H-03 POSITIVO: reactivate_member permite reincorporar formalmente con motivo justificado'
);

-- ============================================================================
-- 9. H-04 / HN-03: EMPRESAS INACTIVAS, ACCESO HISTÓRICO Y BLOQUEO DE INVITACIONES
-- ============================================================================

-- Marcos Segundo (Titular) prepara escenario HN-03: emite una invitación válida previa a la desactivación
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('role', 'authenticated', true);

-- Usuario 6: Candidato que recibirá la invitación antes de la desactivación
RESET ROLE;
INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
VALUES ('66666666-6666-6666-6666-666666666666', 'candidato_alpha@stockly.test', '{"full_name": "Candidato Alpha"}'::jsonb, now(), now());

-- Retornar a sesión de Marcos Segundo para emitir la invitación mientras Alpha está activa
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('role', 'authenticated', true);

DO $$
DECLARE
  v_token TEXT;
BEGIN
  v_token := public.invite_user_to_company(current_setting('test.alpha_id')::uuid, 'candidato_alpha@stockly.test', 'employee');
  PERFORM set_config('test.token_candidato', v_token, true);
END $$;

-- TEST 33: Desactivación lógica de Empresa Alpha
SELECT lives_ok(
  format('SELECT public.deactivate_company(%L::uuid)', current_setting('test.alpha_id')),
  'El titular puede desactivar lógicamente su empresa'
);

-- TEST 34: El master_admin todavía puede leer la empresa inactiva en companies (H-04)
SELECT is(
  (
    SELECT count(*) FROM public.companies
    WHERE id = current_setting('test.alpha_id')::uuid
  ),
  1::bigint,
  'H-04 POSITIVO: master_admin conserva visibilidad de solo lectura histórica sobre empresa inactiva'
);

-- TEST 35: Una empleada de la empresa inactiva NO debe ver la empresa en companies
SELECT set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
SELECT set_config('role', 'authenticated', true);

SELECT is(
  (
    SELECT count(*) FROM public.companies
    WHERE id = current_setting('test.alpha_id')::uuid
  ),
  0::bigint,
  'H-04 NEGATIVO: Colaboradores comunes no visualizan empresas dadas de baja'
);

-- TEST 36: Cualquier intento de mutación RPC sobre empresa inactiva es abortado
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('role', 'authenticated', true);

SELECT throws_ok(
  format('SELECT public.invite_user_to_company(%L::uuid, %L, %L)', current_setting('test.alpha_id'), 'nuevo@stockly.test', 'employee'),
  'La empresa se encuentra inactiva. No se admiten operaciones.',
  'H-04 NEGATIVO: Operaciones de escritura quedan 100% bloqueadas en empresa inactiva'
);

-- TEST 37 (HN-03): Candidato intenta canjear su invitación emitida antes de la desactivación -> RECHAZADO
SELECT set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', true);
SELECT set_config('role', 'authenticated', true);

SELECT throws_ok(
  format('SELECT public.accept_company_invitation(%L)', current_setting('test.token_candidato')),
  'La empresa receptora se encuentra inactiva o deshabilitada.',
  'HN-03 NEGATIVO: Se rechaza aceptar una invitación cuando la empresa receptora está desactivada'
);

-- TEST 38 (HN-03): Comprobar ausencia absoluta de membresía creada tras el rechazo
SELECT is(
  (
    SELECT count(*) FROM public.company_members
    WHERE company_id = current_setting('test.alpha_id')::uuid
      AND user_id = '66666666-6666-6666-6666-666666666666'
  ),
  0::bigint,
  'HN-03 NEGATIVO: Ausencia total de nueva membresía activa después del rechazo en empresa inactiva'
);

-- ============================================================================
-- 10. H-06: COHERENCIA Y NORMALIZACIÓN DE CORREO EN RLS DE INVITACIONES
-- ============================================================================

-- Beatriz Beta emite una invitación para Usuario 5 (Usuario_MAYUSCULAS@Stockly.Test)
SELECT set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
SELECT set_config('role', 'authenticated', true);

DO $$
BEGIN
  PERFORM public.invite_user_to_company(current_setting('test.beta_id')::uuid, 'Usuario_MAYUSCULAS@Stockly.Test', 'employee');
END $$;

-- M-09: Asegurar que el perfil contenga mayúsculas reales para ejercitar la normalización de la política RLS
RESET ROLE;
UPDATE public.profiles SET email = 'Usuario_MAYUSCULAS@Stockly.Test' WHERE id = '55555555-5555-5555-5555-555555555555';

-- Simular sesión de Usuario 5 (cuyo perfil tiene email registrado con mayúsculas/minúsculas)
SELECT set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', true);
SELECT set_config('role', 'authenticated', true);

-- TEST 39: Usuario 5 puede consultar su invitación mediante RLS a pesar de mayúsculas en perfil
SELECT is(
  (
    SELECT count(*) FROM public.company_invitations
    WHERE company_id = current_setting('test.beta_id')::uuid
  ),
  1::bigint,
  'H-06 POSITIVO: RLS permite ver invitación evaluando email normalizado e insensible a mayúsculas'
);

-- ============================================================================
-- 11. DEF-02 / C-04: PRUEBAS NEGATIVAS DE ACCESO PARA ROL ANÓNIMO (anon)
-- ============================================================================
-- Nota Arquitectónica:
-- Para el rol anon, la seguridad opera en Capa 1 (Permisos SQL directos / SQLSTATE 42501).
-- PostgREST no puede realizar SELECT ni llamar a rutinas sin permisos explícitos de tabla/rutina,
-- abortando la solicitud antes de que PostgreSQL evalúe políticas RLS (Capa 2).
-- Se ejecuta RESET ROLE previo para que el runner (postgres) pueda conmutar a anon de forma
-- limpia, garantizando que el error provenga del objeto de destino y no de la instrucción SET ROLE.

RESET ROLE;

-- TEST 40 (DEF-02): Intento de SELECT en companies denegado por permisos SQL de tabla
SELECT throws_matching(
  $$ SET LOCAL role = 'anon'; SELECT * FROM public.companies; $$,
  'permission denied for table companies',
  'DEF-02 NEGATIVO: anon no puede realizar SELECT en public.companies (denegado a nivel SQL)'
);

-- TEST 41 (DEF-02): Intento de SELECT en company_members denegado por permisos SQL de tabla
SELECT throws_matching(
  $$ SET LOCAL role = 'anon'; SELECT * FROM public.company_members; $$,
  'permission denied for table company_members',
  'DEF-02 NEGATIVO: anon no puede realizar SELECT en public.company_members (denegado a nivel SQL)'
);

-- TEST 42 (DEF-02): Intento de SELECT en profiles denegado por permisos SQL de tabla
SELECT throws_matching(
  $$ SET LOCAL role = 'anon'; SELECT * FROM public.profiles; $$,
  'permission denied for table profiles',
  'DEF-02 NEGATIVO: anon no puede realizar SELECT en public.profiles (denegado a nivel SQL)'
);

-- TEST 43 (DEF-02): Intento de SELECT en audit_log denegado por permisos SQL de tabla
SELECT throws_matching(
  $$ SET LOCAL role = 'anon'; SELECT * FROM public.audit_log; $$,
  'permission denied for table audit_log',
  'DEF-02 NEGATIVO: anon no puede realizar SELECT en public.audit_log (denegado a nivel SQL)'
);

-- TEST 44 (DEF-02): Intento de invocar función de esquema private denegado por falta de USAGE
SELECT throws_matching(
  $$ SET LOCAL role = 'anon'; SELECT private.my_active_company_ids(); $$,
  'permission denied for schema private',
  'DEF-02 NEGATIVO: anon no tiene permiso USAGE sobre esquema private (denegado a nivel SQL)'
);

-- TEST 45 (DEF-02): Intento de ejecutar RPC create_company denegado por falta de EXECUTE
SELECT throws_matching(
  $$ SET LOCAL role = 'anon'; SELECT public.create_company('Hacker Corp', '30-71111111-1', 'ARS', 'America/Argentina/Buenos_Aires'); $$,
  'permission denied for function create_company',
  'DEF-02 NEGATIVO: anon no puede ejecutar RPC public.create_company (denegado a nivel SQL)'
);

-- TEST 46 (DEF-02): Intento de ejecutar RPC accept_company_invitation denegado por falta de EXECUTE
SELECT throws_matching(
  $$ SET LOCAL role = 'anon'; SELECT public.accept_company_invitation('dummy_token'); $$,
  'permission denied for function accept_company_invitation',
  'DEF-02 NEGATIVO: anon no puede ejecutar RPC public.accept_company_invitation (denegado a nivel SQL)'
);

-- ============================================================================
-- 12. DEF-03: VALIDACIONES DE CUIT ARGENTINO (MÓDULO 11)
-- ============================================================================

-- TEST 47: CUIT numérico de 11 dígitos válido sin guiones (30711111111)
SELECT is(
  public.validate_cuit('30711111111'),
  true,
  'validate_cuit POSITIVO: CUIT de 11 dígitos numéricos sin guiones es válido'
);

-- TEST 48: CUIT formateado válido con guiones (30-71111111-1)
SELECT is(
  public.validate_cuit('30-71111111-1'),
  true,
  'validate_cuit POSITIVO: CUIT formateado con guiones es válido'
);

-- TEST 49: CUIT NULL es admitido (campo opcional)
SELECT is(
  public.validate_cuit(NULL),
  true,
  'validate_cuit POSITIVO: NULL es admitido al ser tax_id opcional'
);

-- TEST 50: CUIT con dígito verificador incorrecto (30-71111111-8 en vez de 1)
SELECT is(
  public.validate_cuit('30-71111111-8'),
  false,
  'validate_cuit NEGATIVO: CUIT con dígito verificador erróneo retorna false'
);

-- TEST 51: CUIT con longitud errónea (10 dígitos)
SELECT is(
  public.validate_cuit('30-711111-1'),
  false,
  'validate_cuit NEGATIVO: CUIT con longitud distinta de 11 dígitos retorna false'
);

-- TEST 52: Inserción de empresa con CUIT inválido es rechazada por restricción CHECK
SELECT throws_ok(
  $$ SET LOCAL role = 'authenticated'; SET LOCAL request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111'; SELECT public.create_company('Empresa CUIT Invalido', '30-71111111-8', 'ARS', 'America/Argentina/Buenos_Aires'); $$,
  '23514',
  NULL,
  'DEF-03 NEGATIVO: Inserción de empresa con CUIT inválido rechazada por chk_company_tax_id_cuit'
);

-- ============================================================================
-- 13. DEF-03 / A-03: VALIDACIÓN DE ZONA HORARIA IANA ADMITIDA POR POSTGRESQL
-- ============================================================================

-- TEST 53: Inserción de empresa con timezone no admitido por PostgreSQL es abortada
SELECT throws_matching(
  $$ SET LOCAL role = 'authenticated'; SET LOCAL request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111'; SELECT public.create_company('Empresa Timezone Invalido', '30-71111111-1', 'ARS', 'Marte/Crater'); $$,
  'Zona horaria no válida: Marte/Crater',
  'DEF-03 NEGATIVO: Disparador tr_validate_company_timezone aborta timezone no reconocido'
);

-- ============================================================================
-- 14. DEF-03 / C-03 / A-01: CICLO DE VIDA DE INVITACIONES EN EMPRESA ACTIVA (GAMMA)
-- ============================================================================

-- Simular sesión de Guillermo Gamma (Usuario 7) para crear Empresa Gamma
SELECT set_config('request.jwt.claim.sub', '77777777-7777-7777-7777-777777777777', true);
SELECT set_config('role', 'authenticated', true);

DO $$
DECLARE
  v_id UUID;
BEGIN
  v_id := public.create_company('Comercial Gamma S.A.', '30-70000004-0', 'ARS', 'America/Argentina/Buenos_Aires');
  PERFORM set_config('test.gamma_id', v_id::text, true);
END $$;

-- Guillermo Gamma emite una invitación para candidato_ciclo@stockly.test
DO $$
DECLARE
  v_tok TEXT;
BEGIN
  v_tok := public.invite_user_to_company(current_setting('test.gamma_id')::uuid, 'candidato_ciclo@stockly.test', 'employee');
  PERFORM set_config('test.token_ciclo', v_tok, true);
END $$;

-- TEST 54: La invitación se crea con status explícito 'pending'
SELECT is(
  (
    SELECT status FROM public.company_invitations
    WHERE company_id = current_setting('test.gamma_id')::uuid
      AND email = 'candidato_ciclo@stockly.test'
  ),
  'pending',
  'DEF-03 POSITIVO: La invitación se registra inicialmente con status explícito pending'
);

-- TEST 55: Intento de emitir segunda invitación pendiente para el mismo correo en distinto casing es bloqueado
SELECT throws_ok(
  format('SELECT public.invite_user_to_company(%L::uuid, %L, %L)', current_setting('test.gamma_id'), 'CANDIDATO_CICLO@STOCKLY.TEST', 'employee'),
  'Ya existe una invitación pendiente y vigente para candidato_ciclo@stockly.test en esta empresa.',
  'DEF-03 NEGATIVO: Impedir segunda invitación pendiente para el mismo correo (case-insensitive)'
);

-- TEST 56: Revocación explícita mediante revoke_company_invitation transiciona a status 'revoked'
DO $$
DECLARE
  v_inv_id UUID;
BEGIN
  SELECT id INTO v_inv_id FROM public.company_invitations
  WHERE company_id = current_setting('test.gamma_id')::uuid
    AND email = 'candidato_ciclo@stockly.test'
    AND status = 'pending';
  PERFORM public.revoke_company_invitation(current_setting('test.gamma_id')::uuid, v_inv_id);
END $$;

SELECT is(
  (
    SELECT status FROM public.company_invitations
    WHERE company_id = current_setting('test.gamma_id')::uuid
      AND email = 'candidato_ciclo@stockly.test'
  ),
  'revoked',
  'DEF-03 POSITIVO: revoke_company_invitation actualiza el estado a revoked de forma auditada'
);

-- TEST 57 (A-01): Reemplazo de invitación vencida: transiciona a 'expired' y emite nueva sin violar uq_company_invitations_pending_email
DO $$
DECLARE
  v_tok TEXT;
BEGIN
  v_tok := public.invite_user_to_company(current_setting('test.gamma_id')::uuid, 'vencimiento_test@stockly.test', 'employee');
END $$;

-- Forzar vencimiento simulado
RESET ROLE;
UPDATE public.company_invitations
SET expires_at = pg_catalog.now() - interval '1 minute'
WHERE company_id = current_setting('test.gamma_id')::uuid
  AND email = 'vencimiento_test@stockly.test';

SELECT set_config('request.jwt.claim.sub', '77777777-7777-7777-7777-777777777777', true);
SELECT set_config('role', 'authenticated', true);

-- Re-invitar al mismo correo: debe tener éxito transicionando la vieja a 'expired' y creando la nueva
SELECT lives_ok(
  format('SELECT public.invite_user_to_company(%L::uuid, %L, %L)', current_setting('test.gamma_id'), 'vencimiento_test@stockly.test', 'employee'),
  'A-01 POSITIVO: Emisión de nueva invitación reemplaza la invitación vencida sin colisión de índice único'
);

-- TEST 58: Desactivación de empresa revoca automáticamente invitaciones pendientes restantes
DO $$
BEGIN
  PERFORM public.deactivate_company(current_setting('test.gamma_id')::uuid);
END $$;

SELECT is(
  (
    SELECT count(*) FROM public.company_invitations
    WHERE company_id = current_setting('test.gamma_id')::uuid
      AND status = 'pending'
  ),
  0::bigint,
  'DEF-03 POSITIVO: deactivate_company revoca en cascada todas las invitaciones pendientes'
);

SELECT * FROM finish();
ROLLBACK;
