-- ============================================================================
-- SUITE DE PRUEBAS (pgTAP) - VISIBILIDAD DE PERFILES ENTRE COMPAÑEROS (Hallazgo H-08)
-- Módulo: public.profiles_public, política profiles_select_managed_members
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
-- Estado: SUITE AISLADA E INDEPENDIENTE (Transacción con ROLLBACK)
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(9);

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
-- 2. SETUP: Empresa A (admin, empleado activo, ex empleado) y Empresa B (admin)
-- ============================================================================
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('aaaa0016-0000-0000-0000-000000000001', 'admin_pv_a@stockly.local', '{"full_name": "Ana Admin"}'),
  ('aaaa0016-0000-0000-0000-000000000002', 'empleado_pv_a@stockly.local', '{"full_name": "Eze Empleado"}'),
  ('aaaa0016-0000-0000-0000-000000000003', 'ex_pv_a@stockly.local', '{"full_name": "Ex Empleado"}'),
  ('aaaa0016-0000-0000-0000-000000000004', 'admin_pv_b@stockly.local', '{"full_name": "Beto Beta"}');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0016-0000-0000-0000-000000000001';
SELECT public.create_company('Empresa PV Alpha', NULL) AS comp_a \gset
SELECT public.invite_user_to_company(:'comp_a', 'empleado_pv_a@stockly.local', 'employee') AS tok_emp \gset
SELECT public.invite_user_to_company(:'comp_a', 'ex_pv_a@stockly.local', 'employee') AS tok_ex \gset

SET LOCAL "request.jwt.claim.sub" = 'aaaa0016-0000-0000-0000-000000000002';
SELECT public.accept_company_invitation(:'tok_emp');
SET LOCAL "request.jwt.claim.sub" = 'aaaa0016-0000-0000-0000-000000000003';
SELECT public.accept_company_invitation(:'tok_ex');

SET LOCAL "request.jwt.claim.sub" = 'aaaa0016-0000-0000-0000-000000000001';
SELECT public.deactivate_member(:'comp_a', 'aaaa0016-0000-0000-0000-000000000003', 'Baja de prueba');

SET LOCAL "request.jwt.claim.sub" = 'aaaa0016-0000-0000-0000-000000000004';
SELECT public.create_company('Empresa PV Beta', NULL);

-- ============================================================================
-- 3. ASERCIONES
-- ============================================================================

-- Empleado activo de A
SET LOCAL "request.jwt.claim.sub" = 'aaaa0016-0000-0000-0000-000000000002';

-- T-01: Ve los nombres de todos los miembros de su empresa, incluido el ex empleado
SELECT set_eq(
  $$SELECT full_name FROM public.profiles_public$$,
  ARRAY['Ana Admin', 'Eze Empleado', 'Ex Empleado'],
  'T-01: Un empleado ve los nombres de sus compañeros (también de ex miembros).'
);

-- T-02: En la tabla base solo ve su propio perfil (no emails ajenos)
SELECT set_eq(
  $$SELECT email FROM public.profiles$$,
  ARRAY['empleado_pv_a@stockly.local'],
  'T-02: Un empleado no ve emails de compañeros.'
);

-- T-03: La vista no expone la columna email
SELECT hasnt_column('public', 'profiles_public', 'email', 'T-03: profiles_public no expone el email.');

-- Admin de A
SET LOCAL "request.jwt.claim.sub" = 'aaaa0016-0000-0000-0000-000000000001';

-- T-04: El admin ve los emails de los miembros de su empresa
SELECT set_eq(
  $$SELECT email FROM public.profiles$$,
  ARRAY['admin_pv_a@stockly.local', 'empleado_pv_a@stockly.local', 'ex_pv_a@stockly.local'],
  'T-04: Un master_admin ve los emails de los miembros de su empresa.'
);

-- T-05: El admin de A no ve nada de la empresa B
SELECT is_empty(
  $$SELECT 1 FROM public.profiles_public WHERE full_name = 'Beto Beta'
    UNION ALL SELECT 1 FROM public.profiles WHERE email = 'admin_pv_b@stockly.local'$$,
  'T-05: Un admin no ve perfiles de otra empresa.'
);

-- Admin de B
SET LOCAL "request.jwt.claim.sub" = 'aaaa0016-0000-0000-0000-000000000004';

-- T-06: Solo se ve a sí mismo
SELECT set_eq(
  $$SELECT full_name FROM public.profiles_public$$,
  ARRAY['Beto Beta'],
  'T-06: El admin de otra empresa solo ve su propio nombre.'
);

-- Ex empleado (membresía inactiva)
SET LOCAL "request.jwt.claim.sub" = 'aaaa0016-0000-0000-0000-000000000003';

-- T-07/T-08: Al perder la membresía deja de ver a sus ex compañeros
SELECT set_eq(
  $$SELECT full_name FROM public.profiles_public$$,
  ARRAY['Ex Empleado'],
  'T-07: Un ex miembro ya no ve nombres de la empresa.'
);
SELECT set_eq(
  $$SELECT email FROM public.profiles$$,
  ARRAY['ex_pv_a@stockly.local'],
  'T-08: Un ex miembro solo ve su propio perfil.'
);

-- T-09: Un usuario anónimo no puede leer la vista
RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_matching(
  $$SELECT * FROM public.profiles_public$$,
  'permission denied',
  'T-09: anon no puede leer profiles_public.'
);

RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
