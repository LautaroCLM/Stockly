-- ============================================================================
-- SUITE DE PRUEBAS (pgTAP) - INFORMES
-- Módulo: report_* (informes)
-- Estado: SUITE AISLADA E INDEPENDIENTE (Transacción con ROLLBACK)
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(11);

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
  ('aaaa0024-0000-0000-0000-000000000001', 'admin_rp_a@stockly.local'),
  ('aaaa0024-0000-0000-0000-000000000002', 'empleado_rp_a@stockly.local'),
  ('aaaa0024-0000-0000-0000-000000000003', 'admin_rp_b@stockly.local');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0024-0000-0000-0000-000000000001';
SELECT public.create_company('Empresa RP Alpha', NULL) AS comp_a \gset
SELECT public.invite_user_to_company(:'comp_a', 'empleado_rp_a@stockly.local', 'employee') AS tok_emp \gset
SET LOCAL "request.jwt.claim.sub" = 'aaaa0024-0000-0000-0000-000000000002';
SELECT public.accept_company_invitation(:'tok_emp');
SET LOCAL "request.jwt.claim.sub" = 'aaaa0024-0000-0000-0000-000000000003';
SELECT public.create_company('Empresa RP Beta', NULL) AS comp_b \gset
RESET ROLE;

INSERT INTO public.products (company_id, sku, name, selling_price, current_stock)
VALUES (:'comp_a', 'RP-1', 'Producto RP', 100, 50) RETURNING id AS prod \gset
INSERT INTO public.product_costs (company_id, product_id, cost_price, updated_by)
VALUES (:'comp_a', :'prod', 40, 'aaaa0024-0000-0000-0000-000000000001');
INSERT INTO public.customers (company_id, name, identification_type, is_active)
VALUES (:'comp_a', 'Cliente RP', 'DNI', true) RETURNING id AS cust \gset

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0024-0000-0000-0000-000000000001';

-- Venta 1: 3 u. en efectivo (300). Venta 2: 2 u. a cuenta corriente (200). Venta 3: 1 u., luego anulada.
SELECT public.process_sale(:'comp_a', 'cccc0024-0000-0000-0000-000000000001',
  format('[{"product_id": "%s", "quantity": 3}]', :'prod')::JSONB, 0, '[{"method": "efectivo", "amount": 300}]'::JSONB);
SELECT public.process_sale(:'comp_a', 'cccc0024-0000-0000-0000-000000000002',
  format('[{"product_id": "%s", "quantity": 2}]', :'prod')::JSONB, 0, '[{"method": "cuenta_corriente", "amount": 200}]'::JSONB, NULL, :'cust');
SELECT (public.process_sale(:'comp_a', 'cccc0024-0000-0000-0000-000000000003',
  format('[{"product_id": "%s", "quantity": 1}]', :'prod')::JSONB, 0, '[{"method": "efectivo", "amount": 100}]'::JSONB) ->> 'sale_id') AS s3 \gset
SELECT public.cancel_sale(:'comp_a', :'s3', 'Error de carga');

SELECT public.create_expense(:'comp_a', CURRENT_DATE, 'combustible', 'Nafta', 250.50, 'transferencia', NULL, false);
SELECT (public.create_expense(:'comp_a', CURRENT_DATE, 'otros', 'Anulado', 999, 'transferencia', NULL, false) ->> 'expense_id') AS exp_void \gset
SELECT public.void_expense(:'comp_a', :'exp_void', 'Error');

-- 1. Ventas por día: una fila con 2 ventas completadas y total 500 (la anulada no cuenta)
SELECT is(
  (SELECT sales_count || '|' || total || '|' || credit_total FROM public.report_sales_by_day(:'comp_a', CURRENT_DATE - 1, CURRENT_DATE)),
  '2|500.00|200.00', 'T-01 ventas por día: cantidad, total y parte a crédito, sin anuladas');
SELECT is((SELECT count(*) FROM public.report_sales_by_day(:'comp_a', CURRENT_DATE - 1, CURRENT_DATE)), 1::BIGINT, 'T-02 un solo día con ventas');

-- 3. Productos: 5 unidades, 500 facturado, costo 200 (el costo congelado de la venta)
SELECT is(
  (SELECT quantity || '|' || revenue || '|' || cost FROM public.report_top_products(:'comp_a', CURRENT_DATE - 1, CURRENT_DATE, 10)),
  '5.00|500.00|200.00', 'T-03 productos vendidos con cantidad, facturado y costo');

-- 4. Inventario valuado: 50 - 6 vendidas + 1 repuesta por la anulacion = 45 -> 45 x 40 = 1800
SELECT is(
  (SELECT current_stock || '|' || stock_value FROM public.report_inventory_valuation(:'comp_a') WHERE sku = 'RP-1'),
  '45.00|1800.00', 'T-04 inventario valuado al costo');

-- 5. Gastos por categoría: solo el activo
SELECT is(
  (SELECT string_agg(category || ':' || total, ',') FROM public.report_expenses(:'comp_a', CURRENT_DATE - 1, CURRENT_DATE)),
  'combustible:250.50', 'T-05 gastos por categoría sin anulados');

-- 6. Período inválido
SELECT throws_ok(
  format($q$SELECT * FROM public.report_sales_by_day(%L, CURRENT_DATE, CURRENT_DATE - 3)$q$, :'comp_a'),
  NULL, 'El período indicado no es válido.', 'T-06 período inválido rechazado');

-- 7. Período fuera de rango: no hay datos
SELECT is((SELECT count(*) FROM public.report_top_products(:'comp_a', CURRENT_DATE - 60, CURRENT_DATE - 30, 10)), 0::BIGINT, 'T-07 un período sin ventas no devuelve filas');

-- 8. El empleado no accede a ningún informe
SET LOCAL "request.jwt.claim.sub" = 'aaaa0024-0000-0000-0000-000000000002';
SELECT throws_like(format('SELECT * FROM public.report_sales_by_day(%L, CURRENT_DATE - 1, CURRENT_DATE)', :'comp_a'), '%master_admin%', 'T-08 el empleado no ve ventas por día');
SELECT throws_like(format('SELECT * FROM public.report_inventory_valuation(%L)', :'comp_a'), '%master_admin%', 'T-09 el empleado no ve el inventario valuado');

-- 10. Aislamiento entre empresas
SET LOCAL "request.jwt.claim.sub" = 'aaaa0024-0000-0000-0000-000000000003';
SELECT throws_like(format('SELECT * FROM public.report_expenses(%L, CURRENT_DATE - 1, CURRENT_DATE)', :'comp_a'), '%miembro activo%', 'T-10 el admin de otra empresa no ve estos informes');
SELECT is((SELECT count(*) FROM public.report_top_products(:'comp_b', CURRENT_DATE - 1, CURRENT_DATE, 10)), 0::BIGINT, 'T-11 su propia empresa no ve datos ajenos');

SELECT * FROM finish();
ROLLBACK;
