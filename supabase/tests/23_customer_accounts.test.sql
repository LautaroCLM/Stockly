-- ============================================================================
-- SUITE DE PRUEBAS (pgTAP) - CUENTA CORRIENTE DE CLIENTES
-- Módulo: customer_payments (cobros y saldos)
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
  ('aaaa0023-0000-0000-0000-000000000001', 'admin_cc_a@stockly.local'),
  ('aaaa0023-0000-0000-0000-000000000002', 'empleado_cc_a@stockly.local'),
  ('aaaa0023-0000-0000-0000-000000000003', 'admin_cc_b@stockly.local');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0023-0000-0000-0000-000000000001';
SELECT public.create_company('Empresa CC Alpha', NULL) AS comp_a \gset
SELECT public.invite_user_to_company(:'comp_a', 'empleado_cc_a@stockly.local', 'employee') AS tok_emp \gset
SET LOCAL "request.jwt.claim.sub" = 'aaaa0023-0000-0000-0000-000000000002';
SELECT public.accept_company_invitation(:'tok_emp');
SET LOCAL "request.jwt.claim.sub" = 'aaaa0023-0000-0000-0000-000000000003';
SELECT public.create_company('Empresa CC Beta', NULL) AS comp_b \gset
RESET ROLE;

INSERT INTO public.products (company_id, sku, name, selling_price, current_stock)
VALUES (:'comp_a', 'CC-1', 'Producto CC', 100, 100) RETURNING id AS prod \gset
INSERT INTO public.customers (company_id, name, identification_type, is_active)
VALUES (:'comp_a', 'Municipalidad Test', 'CUIT', true) RETURNING id AS cust \gset

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0023-0000-0000-0000-000000000001';

-- 1. Vender en cuenta corriente exige cliente
SELECT throws_ok(
  format($q$SELECT public.process_sale(%L, 'cccc0023-0000-0000-0000-000000000001', '[{"product_id": "%s", "quantity": 1}]'::JSONB, 0, '[{"method": "cuenta_corriente", "amount": 100}]'::JSONB)$q$, :'comp_a', :'prod'),
  NULL, 'Para vender en cuenta corriente hay que elegir un cliente.', 'T-01 cuenta corriente exige cliente');

-- 2. Venta 100% a cuenta corriente: 300
SELECT (public.process_sale(:'comp_a', 'cccc0023-0000-0000-0000-000000000002',
  format('[{"product_id": "%s", "quantity": 3}]', :'prod')::JSONB, 0,
  '[{"method": "cuenta_corriente", "amount": 300}]'::JSONB, NULL, :'cust') ->> 'sale_id') AS s1 \gset
SELECT is((SELECT balance FROM public.customer_balances(:'comp_a') WHERE customer_id = :'cust'), 300.00::NUMERIC, 'T-02 la venta a cuenta corriente genera deuda');

-- 3. Venta mixta: efectivo 50 + cuenta corriente 150 -> la deuda suma solo 150
SELECT (public.process_sale(:'comp_a', 'cccc0023-0000-0000-0000-000000000003',
  format('[{"product_id": "%s", "quantity": 2}]', :'prod')::JSONB, 0,
  '[{"method": "efectivo", "amount": 50}, {"method": "cuenta_corriente", "amount": 150}]'::JSONB, NULL, :'cust') ->> 'sale_id') AS s2 \gset
SELECT is((SELECT balance FROM public.customer_balances(:'comp_a') WHERE customer_id = :'cust'), 450.00::NUMERIC, 'T-03 en una venta mixta solo la parte a crédito suma a la deuda');

-- 4. Cobro con transferencia
SELECT (public.register_customer_payment(:'comp_a', :'cust', '[{"method": "transferencia", "amount": 100}]'::JSONB, NULL, false,
  'dddd0023-0000-0000-0000-000000000001') ->> 'payment_id') AS pay1 \gset
SELECT is((SELECT balance FROM public.customer_balances(:'comp_a') WHERE customer_id = :'cust'), 350.00::NUMERIC, 'T-04 el cobro reduce el saldo');

-- 5. Reintento con la misma clave no duplica
SELECT public.register_customer_payment(:'comp_a', :'cust', '[{"method": "transferencia", "amount": 100}]'::JSONB, NULL, false,
  'dddd0023-0000-0000-0000-000000000001');
SELECT is((SELECT count(*) FROM public.customer_payments WHERE customer_id = :'cust'), 1::BIGINT, 'T-05 reenviar el mismo cobro no lo duplica');

-- 6. No se puede cobrar más que el saldo
SELECT throws_ok(
  format($q$SELECT public.register_customer_payment(%L, %L, '[{"method": "efectivo", "amount": 400}]'::JSONB, NULL, false, 'dddd0023-0000-0000-0000-000000000002')$q$, :'comp_a', :'cust'),
  NULL, NULL, 'T-06 un cobro no puede superar el saldo');

-- 7. Medio de pago inválido (cuenta_corriente no es un medio de cobro)
SELECT throws_ok(
  format($q$SELECT public.register_customer_payment(%L, %L, '[{"method": "cuenta_corriente", "amount": 10}]'::JSONB, NULL, false, 'dddd0023-0000-0000-0000-000000000003')$q$, :'comp_a', :'cust'),
  NULL, NULL, 'T-07 medio de cobro inválido rechazado');

-- 8. Ingresar a caja sin caja abierta falla
SELECT throws_ok(
  format($q$SELECT public.register_customer_payment(%L, %L, '[{"method": "efectivo", "amount": 50}]'::JSONB, NULL, true, 'dddd0023-0000-0000-0000-000000000004')$q$, :'comp_a', :'cust'),
  NULL, 'No hay una caja abierta: abrila para que el efectivo del cobro ingrese a la caja.', 'T-08 sin caja abierta no ingresa a la caja');

-- 9. Con caja abierta el efectivo ingresa (esperado: 1000 de fondo + 50 en efectivo de la venta mixta, que cae en el mismo instante de la transaccion + 50 del cobro)
SELECT public.open_cash_session(:'comp_a', 1000, NULL);
SELECT (public.register_customer_payment(:'comp_a', :'cust', '[{"method": "efectivo", "amount": 50}]'::JSONB, NULL, true,
  'dddd0023-0000-0000-0000-000000000005') ->> 'payment_id') AS pay2 \gset
SELECT is((SELECT (public.cash_session_summary(:'comp_a', (SELECT id FROM public.cash_sessions WHERE company_id = :'comp_a' AND status = 'open')) ->> 'expected_amount')::NUMERIC), 1100.00::NUMERIC, 'T-09 el cobro en efectivo ingresa a la caja');

-- 10. El empleado no puede anular cobros
SET LOCAL "request.jwt.claim.sub" = 'aaaa0023-0000-0000-0000-000000000002';
SELECT throws_like(format('SELECT public.void_customer_payment(%L, %L, %L)', :'comp_a', :'pay2', 'x'), '%No tenés permiso%', 'T-10 el empleado no puede anular cobros');

-- 11/12. El admin anula: sale el efectivo de la caja y vuelve la deuda
SET LOCAL "request.jwt.claim.sub" = 'aaaa0023-0000-0000-0000-000000000001';
SELECT public.void_customer_payment(:'comp_a', :'pay2', 'Cobro cargado por error');
SELECT is((SELECT (public.cash_session_summary(:'comp_a', (SELECT id FROM public.cash_sessions WHERE company_id = :'comp_a' AND status = 'open')) ->> 'expected_amount')::NUMERIC), 1050.00::NUMERIC, 'T-11 anular el cobro saca el efectivo de la caja');
SELECT is((SELECT balance FROM public.customer_balances(:'comp_a') WHERE customer_id = :'cust'), 350.00::NUMERIC, 'T-12 anular el cobro restituye la deuda');

-- 13. Anular una venta a crédito baja la deuda (la mixta tenía 150 a crédito)
SELECT public.cancel_sale(:'comp_a', :'s2', 'Venta cargada por error');
SELECT is((SELECT balance FROM public.customer_balances(:'comp_a') WHERE customer_id = :'cust'), 200.00::NUMERIC, 'T-13 anular una venta a crédito baja la deuda');

-- 14. Estado de cuenta: 1 venta vigente + 1 cobro vigente
SELECT is((SELECT count(*) FROM public.customer_statement(:'comp_a', :'cust')), 2::BIGINT, 'T-14 el estado de cuenta muestra solo movimientos vigentes');

-- 15/16. Resumen financiero
SELECT is(
  (SELECT (s ->> 'receivable_total') || '|' || (s ->> 'credit_sales_total') || '|' || (s ->> 'collections_total')
   FROM public.financial_summary(:'comp_a', CURRENT_DATE - 1, CURRENT_DATE) AS s),
  '200.00|300.00|100.00', 'T-15 el resumen informa saldo a cobrar, ventas a crédito y cobros');
SELECT ok(
  NOT ((SELECT s -> 'payments_by_method' FROM public.financial_summary(:'comp_a', CURRENT_DATE - 1, CURRENT_DATE) AS s) ? 'cuenta_corriente'),
  'T-16 la cuenta corriente no se cuenta como dinero cobrado');

-- 17. Aislamiento: otra empresa no puede cobrar a este cliente
SET LOCAL "request.jwt.claim.sub" = 'aaaa0023-0000-0000-0000-000000000003';
SELECT throws_ok(
  format($q$SELECT public.register_customer_payment(%L, %L, '[{"method": "efectivo", "amount": 10}]'::JSONB, NULL, false, 'dddd0023-0000-0000-0000-000000000006')$q$, :'comp_b', :'cust'),
  NULL, 'El cliente no existe o no pertenece a esta empresa.', 'T-17 aislamiento entre empresas');

-- 18. Sin borrado directo
SET LOCAL "request.jwt.claim.sub" = 'aaaa0023-0000-0000-0000-000000000001';
SELECT throws_ok(format($q$DELETE FROM public.customer_payments WHERE id = %L$q$, :'pay1'), NULL, NULL, 'T-18 no hay borrado directo');

SELECT * FROM finish();
ROLLBACK;
