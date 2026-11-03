-- ============================================================================
-- SUITE DE PRUEBAS (pgTAP) - RESUMEN DE COMPRAS
-- Módulo: public.purchases_summary
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
-- Estado: SUITE AISLADA E INDEPENDIENTE (Transacción con ROLLBACK)
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(4);

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
-- 2. SETUP: Empresa A (admin + empleado) con dos compras completadas y una anulada
-- ============================================================================
INSERT INTO auth.users (id, email) VALUES
  ('aaaa0019-0000-0000-0000-000000000001', 'admin_ps_a@stockly.local'),
  ('aaaa0019-0000-0000-0000-000000000002', 'empleado_ps_a@stockly.local'),
  ('aaaa0019-0000-0000-0000-000000000003', 'admin_ps_b@stockly.local');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0019-0000-0000-0000-000000000001';
SELECT public.create_company('Empresa PS Alpha', NULL) AS comp_a \gset
SELECT public.invite_user_to_company(:'comp_a', 'empleado_ps_a@stockly.local', 'employee') AS tok_emp \gset
SET LOCAL "request.jwt.claim.sub" = 'aaaa0019-0000-0000-0000-000000000002';
SELECT public.accept_company_invitation(:'tok_emp');
SET LOCAL "request.jwt.claim.sub" = 'aaaa0019-0000-0000-0000-000000000003';
SELECT public.create_company('Empresa PS Beta', NULL);
RESET ROLE;

INSERT INTO public.suppliers (company_id, name) VALUES (:'comp_a', 'Proveedor PS') RETURNING id AS supplier \gset
INSERT INTO public.purchases (company_id, purchase_number, supplier_id, purchase_date, subtotal, total_amount, created_by)
VALUES
  (:'comp_a', 'PS-1', :'supplier', CURRENT_DATE, 100.10, 100.10, 'aaaa0019-0000-0000-0000-000000000001'),
  (:'comp_a', 'PS-2', :'supplier', CURRENT_DATE, 50.20, 50.20, 'aaaa0019-0000-0000-0000-000000000001');
INSERT INTO public.purchases (company_id, purchase_number, supplier_id, purchase_date, status, subtotal, total_amount, created_by, cancelled_at, cancelled_by, cancel_reason)
VALUES (:'comp_a', 'PS-3', :'supplier', CURRENT_DATE, 'cancelled', 999, 999, 'aaaa0019-0000-0000-0000-000000000001', now(), 'aaaa0019-0000-0000-0000-000000000001', 'Prueba');

-- ============================================================================
-- 3. ASERCIONES
-- ============================================================================
SELECT has_function('public', 'purchases_summary', ARRAY['uuid'], 'T-01: public.purchases_summary debe existir.');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0019-0000-0000-0000-000000000001';
SELECT is(
  (SELECT completed_count || ':' || completed_total FROM public.purchases_summary(:'comp_a')),
  '2:150.30',
  'T-02: El admin obtiene cantidad y total de las completadas (sin la anulada).');

SET LOCAL "request.jwt.claim.sub" = 'aaaa0019-0000-0000-0000-000000000002';
SELECT is(
  (SELECT completed_count || ':' || completed_total FROM public.purchases_summary(:'comp_a')),
  '0:0',
  'T-03: Un empleado no obtiene valores (RLS de purchases).');

SET LOCAL "request.jwt.claim.sub" = 'aaaa0019-0000-0000-0000-000000000003';
SELECT is(
  (SELECT completed_count || ':' || completed_total FROM public.purchases_summary(:'comp_a')),
  '0:0',
  'T-04: El admin de otra empresa no obtiene valores.');

RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
