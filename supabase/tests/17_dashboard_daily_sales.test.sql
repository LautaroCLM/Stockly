-- ============================================================================
-- SUITE DE PRUEBAS (pgTAP) - RESUMEN DIARIO DE VENTAS (Hallazgo H-10)
-- Módulo: public.dashboard_daily_sales
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
-- Estado: SUITE AISLADA E INDEPENDIENTE (Transacción con ROLLBACK)
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(8);

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
-- 2. SETUP: Empresa A (admin + empleado) con ventas en fechas controladas; Empresa B
-- ============================================================================
INSERT INTO auth.users (id, email) VALUES
  ('aaaa0017-0000-0000-0000-000000000001', 'admin_ds_a@stockly.local'),
  ('aaaa0017-0000-0000-0000-000000000002', 'empleado_ds_a@stockly.local'),
  ('aaaa0017-0000-0000-0000-000000000003', 'admin_ds_b@stockly.local');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0017-0000-0000-0000-000000000001';
SELECT public.create_company('Empresa DS Alpha', NULL) AS comp_a \gset
SELECT public.invite_user_to_company(:'comp_a', 'empleado_ds_a@stockly.local', 'employee') AS tok_emp \gset
SET LOCAL "request.jwt.claim.sub" = 'aaaa0017-0000-0000-0000-000000000002';
SELECT public.accept_company_invitation(:'tok_emp');
SET LOCAL "request.jwt.claim.sub" = 'aaaa0017-0000-0000-0000-000000000003';
SELECT public.create_company('Empresa DS Beta', NULL);
RESET ROLE;

INSERT INTO public.products (company_id, sku, name, selling_price)
VALUES (:'comp_a', 'DS-1', 'Producto DS', 100) RETURNING id AS prod \gset

-- Ventas: dos hoy (100 y 50), una hace 3 días (70) y una anulada hoy (999, no cuenta)
INSERT INTO public.sales (company_id, sale_number, subtotal, total_amount, payments, created_by, created_at)
VALUES
  (:'comp_a', 'DS-1', 100, 100, '[]', 'aaaa0017-0000-0000-0000-000000000001', now()),
  (:'comp_a', 'DS-2', 50, 50, '[]', 'aaaa0017-0000-0000-0000-000000000001', now()),
  (:'comp_a', 'DS-3', 70, 70, '[]', 'aaaa0017-0000-0000-0000-000000000001', now() - interval '3 days');
INSERT INTO public.sales (company_id, sale_number, status, subtotal, total_amount, payments, created_by, created_at, cancelled_at, cancelled_by, cancel_reason)
VALUES (:'comp_a', 'DS-4', 'cancelled', 999, 999, '[]', 'aaaa0017-0000-0000-0000-000000000001', now(), now(), 'aaaa0017-0000-0000-0000-000000000001', 'Prueba');

-- Costo congelado de la venta DS-1 (40)
INSERT INTO public.stock_movements (company_id, product_id, direction, reason, quantity, previous_stock, new_stock, reference_sale_id, created_by)
SELECT :'comp_a', :'prod', 'decrease', 'sale', 1, 0, 0, s.id, 'aaaa0017-0000-0000-0000-000000000001'
FROM public.sales s WHERE s.sale_number = 'DS-1' AND s.company_id = :'comp_a'
RETURNING id AS mov \gset
INSERT INTO public.movement_costs (company_id, movement_id, unit_cost, total_cost)
VALUES (:'comp_a', :'mov', 40, 40);

-- ============================================================================
-- 3. ASERCIONES
-- ============================================================================
SELECT has_function('public', 'dashboard_daily_sales', ARRAY['uuid', 'integer'],
  'T-01: public.dashboard_daily_sales debe existir.');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0017-0000-0000-0000-000000000001';

-- T-02: Devuelve un registro por día pedido, incluidos los días sin ventas
SELECT is((SELECT count(*)::INT FROM public.dashboard_daily_sales(:'comp_a', 7)), 7,
  'T-02: Devuelve 7 días aunque solo 2 tengan ventas.');

-- T-03/T-04: Hoy suma solo las completadas (150) y cuenta 2
SELECT is(
  (SELECT sales_total || ':' || sales_count FROM public.dashboard_daily_sales(:'comp_a', 7) ORDER BY day DESC LIMIT 1),
  '150.00:2',
  'T-03: Hoy suma 150 en 2 ventas (la anulada no cuenta).');
SELECT is(
  (SELECT sales_total FROM public.dashboard_daily_sales(:'comp_a', 7) ORDER BY day DESC OFFSET 3 LIMIT 1),
  70.00::NUMERIC,
  'T-04: La venta de hace 3 días cae en su día.');

-- T-05: El admin ve el costo de lo vendido
SELECT is(
  (SELECT cost_total FROM public.dashboard_daily_sales(:'comp_a', 7) ORDER BY day DESC LIMIT 1),
  40.00::NUMERIC,
  'T-05: El master_admin ve el costo de lo vendido.');

-- T-06: El empleado ve las ventas pero el costo en 0
SET LOCAL "request.jwt.claim.sub" = 'aaaa0017-0000-0000-0000-000000000002';
SELECT is(
  (SELECT sales_total || ':' || cost_total FROM public.dashboard_daily_sales(:'comp_a', 7) ORDER BY day DESC LIMIT 1),
  '150.00:0',
  'T-06: Un empleado ve las ventas pero no el costo.');

-- T-07: Otra empresa no obtiene nada
SET LOCAL "request.jwt.claim.sub" = 'aaaa0017-0000-0000-0000-000000000003';
SELECT is_empty(
  format('SELECT * FROM public.dashboard_daily_sales(%L, 7)', :'comp_a'),
  'T-07: Un usuario de otra empresa no obtiene datos.');

-- T-08: La cantidad de días queda acotada a 366
SET LOCAL "request.jwt.claim.sub" = 'aaaa0017-0000-0000-0000-000000000001';
SELECT is((SELECT count(*)::INT FROM public.dashboard_daily_sales(:'comp_a', 5000)), 366,
  'T-08: El rango se acota a 366 días.');

RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
