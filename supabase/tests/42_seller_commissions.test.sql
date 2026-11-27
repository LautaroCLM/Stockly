-- ============================================================================
-- SUITE DE PRUEBAS (pgTAP) - COMISIONES POR VENDEDOR
-- Módulo: vendedor en process_sale, porcentaje congelado, anulaciones y devoluciones,
--         informe, pago como gasto, períodos cerrados, corregir vendedor, permisos, aislamiento
-- Estado: SUITE AISLADA E INDEPENDIENTE (Transacción con ROLLBACK)
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(18);

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
  ('aaaa0042-0000-0000-0000-000000000001', 'admin_com_a@stockly.local'),
  ('aaaa0042-0000-0000-0000-000000000002', 'empleado_com_a@stockly.local'),
  ('aaaa0042-0000-0000-0000-000000000003', 'admin_com_b@stockly.local');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0042-0000-0000-0000-000000000001';
SELECT public.create_company('Empresa Comisiones Alpha', NULL) AS comp_a \gset
SELECT public.invite_user_to_company(:'comp_a', 'empleado_com_a@stockly.local', 'employee') AS tok_emp \gset
SET LOCAL "request.jwt.claim.sub" = 'aaaa0042-0000-0000-0000-000000000002';
SELECT public.accept_company_invitation(:'tok_emp');
SET LOCAL "request.jwt.claim.sub" = 'aaaa0042-0000-0000-0000-000000000003';
SELECT public.create_company('Empresa Comisiones Beta', NULL) AS comp_b \gset
RESET ROLE;

INSERT INTO public.products (company_id, sku, name, unit, selling_price, current_stock) VALUES
  (:'comp_a', 'P', 'Taladro', 'unidad', 1000.00, 100);
SELECT id AS p FROM public.products WHERE company_id = :'comp_a' AND sku = 'P' \gset
INSERT INTO public.employees (company_id, full_name, commission_percent, created_by) VALUES
  (:'comp_a', 'Juan', 3, 'aaaa0042-0000-0000-0000-000000000001'),
  (:'comp_a', 'Ana', NULL, 'aaaa0042-0000-0000-0000-000000000001'),
  (:'comp_a', 'Pedro', NULL, 'aaaa0042-0000-0000-0000-000000000001'),
  (:'comp_b', 'Ajeno', 4, 'aaaa0042-0000-0000-0000-000000000003');
SELECT id AS juan FROM public.employees WHERE company_id = :'comp_a' AND full_name = 'Juan' \gset
SELECT id AS ana FROM public.employees WHERE company_id = :'comp_a' AND full_name = 'Ana' \gset
SELECT id AS pedro FROM public.employees WHERE company_id = :'comp_a' AND full_name = 'Pedro' \gset
SELECT id AS ajeno FROM public.employees WHERE company_id = :'comp_b' \gset
SELECT (now() AT TIME ZONE timezone)::DATE AS today, (now() AT TIME ZONE timezone)::DATE - 1 AS yesterday
FROM public.companies WHERE id = :'comp_a' \gset

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0042-0000-0000-0000-000000000001';
SELECT public.open_cash_session(:'comp_a', 5000, NULL);
SELECT public.set_employee_commission(:'comp_a', :'ana', 5);

-- 1. Vendedores para elegir: solo los que tienen porcentaje
SELECT is((SELECT string_agg(full_name, ',' ORDER BY full_name) FROM public.sale_sellers(:'comp_a') WHERE can_sell), 'Ana,Juan', 'T-01 se eligen solo vendedores con porcentaje');

-- 2-3. La venta congela el porcentaje del vendedor
SELECT public.process_sale(:'comp_a', 'bbbb0042-0000-0000-0000-000000000001', format('[{"product_id": "%s", "quantity": 1}]', :'p')::JSONB,
  0, '[{"method": "efectivo", "amount": 1000}]'::JSONB, NULL, NULL, NULL, false, :'juan') ->> 'sale_id' AS s1 \gset
SELECT is((SELECT seller_employee_id || '/' || seller_commission_percent FROM public.sales WHERE id = :'s1'), :'juan' || '/3.00', 'T-02 la venta guarda vendedor y porcentaje');
SELECT public.set_employee_commission(:'comp_a', :'juan', 10);
SELECT is((SELECT seller_commission_percent FROM public.sales WHERE id = :'s1'), 3.00::NUMERIC, 'T-03 cambiar el porcentaje no toca ventas ya hechas');

-- 4-5. Anulación y devolución restan
SELECT public.process_sale(:'comp_a', 'bbbb0042-0000-0000-0000-000000000002', format('[{"product_id": "%s", "quantity": 2}]', :'p')::JSONB,
  0, '[{"method": "efectivo", "amount": 2000}]'::JSONB, NULL, NULL, NULL, false, :'juan') ->> 'sale_id' AS s2 \gset
SELECT public.process_sale(:'comp_a', 'bbbb0042-0000-0000-0000-000000000003', format('[{"product_id": "%s", "quantity": 1}]', :'p')::JSONB,
  0, '[{"method": "efectivo", "amount": 1000}]'::JSONB, NULL, NULL, NULL, false, :'ana') ->> 'sale_id' AS s3 \gset
SELECT public.cancel_sale(:'comp_a', :'s3', 'Error de carga');
SELECT is((SELECT sum(commission) FROM public.commission_report(:'comp_a', :'today', :'today') WHERE employee_id = :'ana'), 0.00::NUMERIC,
  'T-04 una venta anulada no deja comisión');
SELECT public.process_sale_return(:'comp_a', :'s2',
  format('[{"sale_item_id": "%s", "quantity": 1}]', (SELECT id FROM public.sale_items WHERE sale_id = :'s2'))::JSONB,
  'Cambio de modelo', 'dddd0042-0000-0000-0000-000000000001');
SELECT is((SELECT sum(commission) FROM public.commission_report(:'comp_a', :'today', :'today') WHERE employee_id = :'juan'), 130.00::NUMERIC,
  'T-05 Juan: 30 (3 %% de 1000) + 200 (10 %% de 2000) - 100 (devolución de 1000 al 10 %%) = 130');

-- 6. Vendedor sin porcentaje: rechazado
SELECT throws_like(format($q$SELECT public.process_sale(%L, 'bbbb0042-0000-0000-0000-000000000004', '[{"product_id": "%s", "quantity": 1}]'::JSONB, 0, '[{"method": "efectivo", "amount": 1000}]'::JSONB, NULL, NULL, NULL, false, %L)$q$, :'comp_a', :'p', :'pedro'),
  '%Pedro no está activo como vendedor%', 'T-06 no se elige un vendedor sin porcentaje');

-- 7. Vendedor de otra empresa: rechazado
SELECT throws_like(format($q$SELECT public.process_sale(%L, 'bbbb0042-0000-0000-0000-000000000005', '[{"product_id": "%s", "quantity": 1}]'::JSONB, 0, '[{"method": "efectivo", "amount": 1000}]'::JSONB, NULL, NULL, NULL, false, %L)$q$, :'comp_a', :'p', :'ajeno'),
  '%no existe o no pertenece%', 'T-07 no se elige un vendedor de otra empresa');

-- 8-11. Pagar: gasto "comisiones", período cerrado, no se paga dos veces
SELECT public.pay_commission(:'comp_a', :'juan', :'today', :'today', 'efectivo', false) AS pay1 \gset
SELECT is((SELECT category || '/' || amount FROM public.expenses WHERE id = (:'pay1'::JSONB ->> 'expense_id')::UUID), 'comisiones/130.00',
  'T-08 el pago registra un gasto de comisiones por lo calculado');
SELECT ok((SELECT bool_and(is_paid) FROM public.commission_report(:'comp_a', :'today', :'today') WHERE employee_id = :'juan'), 'T-09 el informe marca el período como pagado');
SELECT throws_like(format($q$SELECT public.pay_commission(%L, %L, %L, %L, 'efectivo', false)$q$, :'comp_a', :'juan', :'today', :'today'),
  '%se superpone%', 'T-10 no se paga dos veces el mismo período');
SELECT throws_like(format($q$SELECT public.set_sale_seller(%L, %L, %L)$q$, :'comp_a', :'s1', :'ana'),
  '%ya se pagó%', 'T-11 no se cambia el vendedor de una venta con comisión pagada');

-- 12-13. Anular el gasto reabre el período
SELECT public.void_expense(:'comp_a', (:'pay1'::JSONB ->> 'expense_id')::UUID, 'Pago duplicado');
SELECT ok(NOT (SELECT bool_or(is_paid) FROM public.commission_report(:'comp_a', :'today', :'today') WHERE employee_id = :'juan'), 'T-12 anular el gasto reabre el período');
SELECT lives_ok(format($q$SELECT public.pay_commission(%L, %L, %L, %L, 'transferencia', false)$q$, :'comp_a', :'juan', :'today', :'today'), 'T-13 después de anular se puede volver a pagar');

-- 14. Corregir el vendedor de una venta no pagada
SELECT public.process_sale(:'comp_a', 'bbbb0042-0000-0000-0000-000000000006', format('[{"product_id": "%s", "quantity": 1}]', :'p')::JSONB,
  0, '[{"method": "efectivo", "amount": 1000}]'::JSONB) ->> 'sale_id' AS s4 \gset
SELECT public.set_sale_seller(:'comp_a', :'s4', :'ana');
SELECT is((SELECT seller_employee_id || '/' || seller_commission_percent FROM public.sales WHERE id = :'s4'), :'ana' || '/5.00', 'T-14 se puede asignar el vendedor después, con su porcentaje');

-- 15. Sin comisión en el período: no hay nada que pagar
SELECT throws_like(format($q$SELECT public.pay_commission(%L, %L, %L, %L, 'efectivo', false)$q$, :'comp_a', :'ana', :'yesterday', :'yesterday'),
  '%No hay comisión para pagar%', 'T-15 no se paga un período sin comisión');

-- 16-17. Empleado sin permiso de Personal: ve los vendedores pero no el informe ni paga
SET LOCAL "request.jwt.claim.sub" = 'aaaa0042-0000-0000-0000-000000000002';
SELECT throws_like(format($q$SELECT * FROM public.commission_report(%L, %L, %L)$q$, :'comp_a', :'today', :'today'), '%permiso%', 'T-16 sin permiso de Personal no ve el informe');
SELECT throws_like(format($q$SELECT public.pay_commission(%L, %L, %L, %L, 'efectivo', false)$q$, :'comp_a', :'ana', :'today', :'today'), '%permiso%', 'T-17 sin permiso de Personal no paga comisiones');

-- 18. Aislamiento
SET LOCAL "request.jwt.claim.sub" = 'aaaa0042-0000-0000-0000-000000000003';
SELECT is((SELECT count(*) FROM public.commission_payments WHERE company_id = :'comp_a'), 0::BIGINT, 'T-18 otra empresa no ve los pagos de comisión');

SELECT * FROM finish();
ROLLBACK;
