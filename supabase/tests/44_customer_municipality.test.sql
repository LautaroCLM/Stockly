-- ============================================================================
-- SUITE DE PRUEBAS (pgTAP) - CLIENTES MUNICIPIO
-- Módulo: customers.is_municipality y set_customer_municipality (permiso y aislamiento)
-- Estado: SUITE AISLADA E INDEPENDIENTE (Transacción con ROLLBACK)
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(5);

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

INSERT INTO auth.users (id, email) VALUES
  ('aaaa0044-0000-0000-0000-000000000001', 'admin_mun_a@stockly.local'),
  ('aaaa0044-0000-0000-0000-000000000002', 'empleado_mun_a@stockly.local'),
  ('aaaa0044-0000-0000-0000-000000000003', 'admin_mun_b@stockly.local');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0044-0000-0000-0000-000000000001';
SELECT public.create_company('Empresa Municipio Alpha', NULL) AS comp_a \gset
SELECT public.invite_user_to_company(:'comp_a', 'empleado_mun_a@stockly.local', 'employee') AS tok_emp \gset
SET LOCAL "request.jwt.claim.sub" = 'aaaa0044-0000-0000-0000-000000000002';
SELECT public.accept_company_invitation(:'tok_emp');
SET LOCAL "request.jwt.claim.sub" = 'aaaa0044-0000-0000-0000-000000000003';
SELECT public.create_company('Empresa Municipio Beta', NULL) AS comp_b \gset
RESET ROLE;

INSERT INTO public.customers (company_id, name) VALUES (:'comp_a', 'Municipalidad de Prueba');
SELECT id AS c FROM public.customers WHERE company_id = :'comp_a' \gset

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0044-0000-0000-0000-000000000001';

SELECT is((SELECT is_municipality FROM public.customers WHERE id = :'c'), false, 'T-01 un cliente nuevo no es municipio');
SELECT public.set_customer_municipality(:'comp_a', :'c', true);
SELECT is((SELECT is_municipality FROM public.customers WHERE id = :'c'), true, 'T-02 el admin marca al cliente como municipio');

-- 3. Empleado sin permiso de operar clientes (por defecto solo ve)
SET LOCAL "request.jwt.claim.sub" = 'aaaa0044-0000-0000-0000-000000000002';
SELECT throws_like(format($q$SELECT public.set_customer_municipality(%L, %L, false)$q$, :'comp_a', :'c'), '%permiso%',
  'T-03 sin permiso de operar clientes no se cambia la marca');

-- 4-5. Otra empresa no puede tocarlo ni verlo
SET LOCAL "request.jwt.claim.sub" = 'aaaa0044-0000-0000-0000-000000000003';
SELECT throws_like(format($q$SELECT public.set_customer_municipality(%L, %L, false)$q$, :'comp_a', :'c'), '%miembro activo%',
  'T-04 otra empresa no cambia la marca');
SELECT throws_like(format($q$SELECT public.set_customer_municipality(%L, %L, true)$q$, :'comp_b', :'c'), '%no encontrado%',
  'T-05 no se marca un cliente de otra empresa');

SELECT * FROM finish();
ROLLBACK;
