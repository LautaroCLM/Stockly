-- ============================================================================
-- SUITE DE PRUEBAS (pgTAP) - LGUMENTOS
-- Módulo: set_company_logo y remove_company_logo
-- Estado: SUITE AISLADA E INDEPENDIENTE (Transacción con ROLLBACK)
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(10);

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
  ('aaaa0033-0000-0000-0000-000000000001', 'admin_lg_a@stockly.local'),
  ('aaaa0033-0000-0000-0000-000000000002', 'empleado_lg_a@stockly.local'),
  ('aaaa0033-0000-0000-0000-000000000003', 'admin_lg_b@stockly.local');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0033-0000-0000-0000-000000000001';
SELECT public.create_company('Empresa LG Alpha', NULL) AS comp_a \gset
SELECT public.invite_user_to_company(:'comp_a', 'empleado_lg_a@stockly.local', 'employee') AS tok_emp \gset
SET LOCAL "request.jwt.claim.sub" = 'aaaa0033-0000-0000-0000-000000000002';
SELECT public.accept_company_invitation(:'tok_emp');
SET LOCAL "request.jwt.claim.sub" = 'aaaa0033-0000-0000-0000-000000000003';
SELECT public.create_company('Empresa LG Beta', NULL) AS comp_b \gset

SET LOCAL "request.jwt.claim.sub" = 'aaaa0033-0000-0000-0000-000000000001';
SELECT lives_ok(format($q$SELECT public.set_company_logo(%L, 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==')$q$, :'comp_a'), 'T-01 el admin sube el logo');
SELECT is((SELECT count(*) FROM public.company_logos WHERE company_id = :'comp_a'), 1::BIGINT, 'T-02 queda guardado');
SELECT lives_ok(format($q$SELECT public.set_company_logo(%L, 'data:image/webp;base64,AAAA')$q$, :'comp_a'), 'T-03 subir otro logo reemplaza al anterior');
SELECT is((SELECT count(*) FROM public.company_logos WHERE company_id = :'comp_a'), 1::BIGINT, 'T-04 sigue habiendo un solo logo por empresa');
SELECT throws_like(format($q$SELECT public.set_company_logo(%L, 'data:text/html;base64,AAAA')$q$, :'comp_a'), '%PNG, JPG o WebP%', 'T-05 rechaza lo que no es una imagen');
SELECT throws_like(format($q$SELECT public.set_company_logo(%L, 'data:image/png;base64,' || repeat('A', 200100))$q$, :'comp_a'), '%demasiado pesado%', 'T-06 rechaza logos muy pesados');

SET LOCAL "request.jwt.claim.sub" = 'aaaa0033-0000-0000-0000-000000000002';
SELECT is((SELECT count(*) FROM public.company_logos WHERE company_id = :'comp_a'), 1::BIGINT, 'T-07 el empleado ve el logo de su empresa');
SELECT throws_like(format($q$SELECT public.set_company_logo(%L, 'data:image/png;base64,AAAA')$q$, :'comp_a'), '%master_admin%', 'T-08 el empleado no cambia el logo');

SET LOCAL "request.jwt.claim.sub" = 'aaaa0033-0000-0000-0000-000000000003';
SELECT is((SELECT count(*) FROM public.company_logos WHERE company_id = :'comp_a'), 0::BIGINT, 'T-09 otra empresa no ve este logo');

SET LOCAL "request.jwt.claim.sub" = 'aaaa0033-0000-0000-0000-000000000001';
SELECT public.remove_company_logo(:'comp_a');
SELECT is((SELECT count(*) FROM public.company_logos WHERE company_id = :'comp_a'), 0::BIGINT, 'T-10 el admin quita el logo');

SELECT * FROM finish();
ROLLBACK;
