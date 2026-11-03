-- ============================================================================
-- SUITE DE PRUEBAS (pgTAP) - FECHA DE COMPRA EN HORA LOCAL (Hallazgo H-15)
-- Módulo: public.process_purchase (fecha efectiva) y purchases.purchase_date
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
-- Estado: SUITE AISLADA E INDEPENDIENTE (Transacción con ROLLBACK)
-- La empresa usa Pacific/Kiritimati (UTC+14) para que su fecha local difiera de la UTC;
-- las aserciones comparan siempre contra el "hoy" de esa zona, sin depender de la hora.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(5);

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
-- 2. SETUP: Empresa en UTC+14 con proveedor y producto
-- ============================================================================
INSERT INTO auth.users (id, email) VALUES
  ('aaaa0018-0000-0000-0000-000000000001', 'admin_pd@stockly.local');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0018-0000-0000-0000-000000000001';
SELECT public.create_company('Empresa PD Kiritimati', NULL, 'ARS', 'Pacific/Kiritimati') AS comp \gset
RESET ROLE;

INSERT INTO public.suppliers (company_id, name) VALUES (:'comp', 'Proveedor PD') RETURNING id AS supplier \gset
INSERT INTO public.products (company_id, sku, name, selling_price) VALUES (:'comp', 'PD-1', 'Producto PD', 10) RETURNING id AS prod \gset
SELECT (pg_catalog.now() AT TIME ZONE 'Pacific/Kiritimati')::DATE AS local_today \gset
SELECT format('[{"product_id": "%s", "quantity": 1, "unit_cost": 5}]', :'prod') AS items \gset

-- ============================================================================
-- 3. ASERCIONES
-- ============================================================================
SELECT col_hasnt_default('public', 'purchases', 'purchase_date',
  'T-01: purchases.purchase_date ya no tiene default en UTC.');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0018-0000-0000-0000-000000000001';

-- T-02: Sin fecha, la compra toma el día local de la empresa
SELECT is(
  (public.process_purchase(:'comp', 'dddd0018-0000-0000-0000-000000000001', :'supplier', :'items'::JSONB) ->> 'purchase_date')::DATE,
  :'local_today'::DATE,
  'T-02: Sin fecha, se usa el día local de la empresa (no el UTC).');

-- T-03: El día local de hoy se acepta explícitamente
SELECT lives_ok(
  format('SELECT public.process_purchase(%L, %L, %L, %L::JSONB, NULL, %L::DATE)',
    :'comp', 'dddd0018-0000-0000-0000-000000000002', :'supplier', :'items', :'local_today'),
  'T-03: Una compra con la fecha local de hoy se acepta.');

-- T-04: Una fecha pasada se acepta
SELECT lives_ok(
  format('SELECT public.process_purchase(%L, %L, %L, %L::JSONB, NULL, %L::DATE - 10)',
    :'comp', 'dddd0018-0000-0000-0000-000000000003', :'supplier', :'items', :'local_today'),
  'T-04: Una compra con fecha pasada se acepta.');

-- T-05: Una fecha posterior al día local se rechaza
SELECT throws_like(
  format('SELECT public.process_purchase(%L, %L, %L, %L::JSONB, NULL, %L::DATE + 1)',
    :'comp', 'dddd0018-0000-0000-0000-000000000004', :'supplier', :'items', :'local_today'),
  '%posterior a hoy%',
  'T-05: Una compra con fecha futura se rechaza.');

RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
