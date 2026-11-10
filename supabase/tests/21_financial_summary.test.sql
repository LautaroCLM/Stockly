-- ============================================================================
-- SUITE DE PRUEBAS (pgTAP) - RESUMEN FINANCIERO
-- Módulo: public.financial_summary
-- Estado: SUITE AISLADA E INDEPENDIENTE (Transacción con ROLLBACK)
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(13);

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
-- SETUP: Empresa A (admin + empleado) con datos controlados; Empresa B con una venta propia
-- ============================================================================
INSERT INTO auth.users (id, email) VALUES
  ('aaaa0021-0000-0000-0000-000000000001', 'admin_fs_a@stockly.local'),
  ('aaaa0021-0000-0000-0000-000000000002', 'empleado_fs_a@stockly.local'),
  ('aaaa0021-0000-0000-0000-000000000003', 'admin_fs_b@stockly.local');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0021-0000-0000-0000-000000000001';
SELECT public.create_company('Empresa FS Alpha', NULL) AS comp_a \gset
SELECT public.invite_user_to_company(:'comp_a', 'empleado_fs_a@stockly.local', 'employee') AS tok_emp \gset
SET LOCAL "request.jwt.claim.sub" = 'aaaa0021-0000-0000-0000-000000000002';
SELECT public.accept_company_invitation(:'tok_emp');
SET LOCAL "request.jwt.claim.sub" = 'aaaa0021-0000-0000-0000-000000000003';
SELECT public.create_company('Empresa FS Beta', NULL) AS comp_b \gset
RESET ROLE;

INSERT INTO public.products (company_id, sku, name, selling_price, current_stock)
VALUES (:'comp_a', 'FS-1', 'Producto FS', 100, 10) RETURNING id AS prod \gset
INSERT INTO public.product_costs (company_id, product_id, cost_price, updated_by) VALUES (:'comp_a', :'prod', 40, 'aaaa0021-0000-0000-0000-000000000001');

-- Ventas de A: 100 (efectivo) y 50 (60% transferencia + cheque) hoy; 70 hace 40 días (fuera del período);
-- una anulada de 999. Una venta de B que no debe aparecer.
INSERT INTO public.sales (company_id, sale_number, subtotal, total_amount, payments, created_by, created_at)
VALUES
  (:'comp_a', 'FS-1', 100, 100, '[{"method": "efectivo", "amount": 100}]', 'aaaa0021-0000-0000-0000-000000000001', now()),
  (:'comp_a', 'FS-2', 50, 50, '[{"method": "transferencia", "amount": 30}, {"method": "cheque", "amount": 20}]', 'aaaa0021-0000-0000-0000-000000000001', now()),
  (:'comp_a', 'FS-3', 70, 70, '[{"method": "efectivo", "amount": 70}]', 'aaaa0021-0000-0000-0000-000000000001', now() - interval '40 days'),
  (:'comp_b', 'FS-B', 500, 500, '[{"method": "efectivo", "amount": 500}]', 'aaaa0021-0000-0000-0000-000000000003', now());
INSERT INTO public.sales (company_id, sale_number, status, subtotal, total_amount, payments, created_by, created_at, cancelled_at, cancelled_by, cancel_reason)
VALUES (:'comp_a', 'FS-4', 'cancelled', 999, 999, '[{"method": "efectivo", "amount": 999}]', 'aaaa0021-0000-0000-0000-000000000001', now(), now(), 'aaaa0021-0000-0000-0000-000000000001', 'Prueba');

-- Costo congelado de la venta FS-1 (40)
INSERT INTO public.stock_movements (company_id, product_id, direction, reason, quantity, previous_stock, new_stock, reference_sale_id, created_by)
SELECT :'comp_a', :'prod', 'decrease', 'sale', 1, 0, 0, s.id, 'aaaa0021-0000-0000-0000-000000000001'
FROM public.sales s WHERE s.sale_number = 'FS-1' AND s.company_id = :'comp_a'
RETURNING id AS mov \gset
INSERT INTO public.movement_costs (company_id, movement_id, unit_cost, total_cost) VALUES (:'comp_a', :'mov', 40, 40);

-- Compras de A: una completada de 200 hoy, una anulada de 999
INSERT INTO public.suppliers (company_id, name) VALUES (:'comp_a', 'Proveedor FS') RETURNING id AS supplier \gset
INSERT INTO public.purchases (company_id, purchase_number, supplier_id, purchase_date, subtotal, total_amount, created_by)
VALUES (:'comp_a', 'FSP-1', :'supplier', CURRENT_DATE, 200, 200, 'aaaa0021-0000-0000-0000-000000000001');
INSERT INTO public.purchases (company_id, purchase_number, supplier_id, purchase_date, status, subtotal, total_amount, created_by, cancelled_at, cancelled_by, cancel_reason)
VALUES (:'comp_a', 'FSP-2', :'supplier', CURRENT_DATE, 'cancelled', 999, 999, 'aaaa0021-0000-0000-0000-000000000001', now(), 'aaaa0021-0000-0000-0000-000000000001', 'Prueba');

-- ============================================================================
-- ASERCIONES
-- ============================================================================
SELECT has_function('public', 'financial_summary', ARRAY['uuid', 'date', 'date'], 'T-01: existe public.financial_summary.');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0021-0000-0000-0000-000000000001';

SELECT is(
  (SELECT (s ->> 'sales_total') || ':' || (s ->> 'sales_count')
   FROM public.financial_summary(:'comp_a', CURRENT_DATE - 7, CURRENT_DATE) AS s),
  '150.00:2',
  'T-02: vendido = 150 en 2 ventas (sin la anulada ni la de hace 40 días).');

SELECT is(
  (SELECT (s ->> 'cancelled_total') || ':' || (s ->> 'cancelled_count')
   FROM public.financial_summary(:'comp_a', CURRENT_DATE - 7, CURRENT_DATE) AS s),
  '999.00:1',
  'T-03: las anuladas se informan aparte.');

SELECT is(
  (SELECT s ->> 'cogs_total' FROM public.financial_summary(:'comp_a', CURRENT_DATE - 7, CURRENT_DATE) AS s),
  '40.00',
  'T-04: costo de la mercadería vendida = 40.');

SELECT is(
  (SELECT (s ->> 'purchases_total') || ':' || (s ->> 'purchases_count')
   FROM public.financial_summary(:'comp_a', CURRENT_DATE - 7, CURRENT_DATE) AS s),
  '200.00:1',
  'T-05: compras completadas = 200 (sin la anulada).');

SELECT is(
  (SELECT (s -> 'payments_by_method' ->> 'efectivo') || '|' || (s -> 'payments_by_method' ->> 'transferencia') || '|' || (s -> 'payments_by_method' ->> 'cheque')
   FROM public.financial_summary(:'comp_a', CURRENT_DATE - 7, CURRENT_DATE) AS s),
  '100.00|30.00|20.00',
  'T-06: cobrado por medio de pago (el cheque se informa aparte del efectivo).');

SELECT is(
  (SELECT s ->> 'inventory_value' FROM public.financial_summary(:'comp_a', CURRENT_DATE - 7, CURRENT_DATE) AS s),
  '360.00',
  'T-07: valor del inventario = 9 unidades x costo 40 (el movimiento de venta descontó 1 de las 10).');

SELECT is(
  (SELECT s ->> 'sales_total' FROM public.financial_summary(:'comp_a', CURRENT_DATE - 60, CURRENT_DATE) AS s),
  '220.00',
  'T-08: un período más largo incluye la venta de hace 40 días (100 + 50 + 70).');

SELECT throws_like(
  format('SELECT public.financial_summary(%L, CURRENT_DATE, CURRENT_DATE - 1)', :'comp_a'),
  '%período%',
  'T-09: un período invertido se rechaza.');

SET LOCAL "request.jwt.claim.sub" = 'aaaa0021-0000-0000-0000-000000000002';
SELECT throws_like(
  format('SELECT public.financial_summary(%L, CURRENT_DATE - 7, CURRENT_DATE)', :'comp_a'),
  '%No tenés permiso%',
  'T-10: un empleado no puede ver el resumen financiero.');

SET LOCAL "request.jwt.claim.sub" = 'aaaa0021-0000-0000-0000-000000000003';
SELECT throws_like(
  format('SELECT public.financial_summary(%L, CURRENT_DATE - 7, CURRENT_DATE)', :'comp_a'),
  '%miembro activo%',
  'T-11: el administrador de otra empresa no puede ver los datos de la empresa A.');

-- Gastos: uno activo de 300,25 hoy, uno anulado de 999 y otro fuera del período
SET LOCAL "request.jwt.claim.sub" = 'aaaa0021-0000-0000-0000-000000000001';
SELECT public.create_expense(:'comp_a', CURRENT_DATE, 'servicios', 'Luz', 300.25, 'transferencia', NULL, false);
SELECT (public.create_expense(:'comp_a', CURRENT_DATE, 'otros', 'Error', 999, 'transferencia', NULL, false) ->> 'expense_id') AS exp_void \gset
SELECT public.void_expense(:'comp_a', :'exp_void', 'Carga equivocada');
SELECT public.create_expense(:'comp_a', CURRENT_DATE - 40, 'otros', 'Viejo', 50, 'transferencia', NULL, false);

SELECT is(
  (SELECT s ->> 'expenses_total' FROM public.financial_summary(:'comp_a', CURRENT_DATE - 7, CURRENT_DATE) AS s),
  '300.25', 'T-12: los gastos del período suman solo los activos y dentro de las fechas.');
SELECT is(
  (SELECT s -> 'expenses_by_category' ->> 'servicios' FROM public.financial_summary(:'comp_a', CURRENT_DATE - 7, CURRENT_DATE) AS s),
  '300.25', 'T-13: los gastos se agrupan por categoría.');

RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
