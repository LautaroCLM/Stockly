-- ============================================================================
-- SUITE DE PRUEBAS (pgTAP) - DEUDAS A PROVEEDORES
-- Módulo: credit_purchases, supplier_payments, saldos y resumen
-- Estado: SUITE AISLADA E INDEPENDIENTE (Transacción con ROLLBACK)
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(26);

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
  ('aaaa0028-0000-0000-0000-000000000001', 'admin_sp_a@stockly.local'),
  ('aaaa0028-0000-0000-0000-000000000002', 'empleado_sp_a@stockly.local'),
  ('aaaa0028-0000-0000-0000-000000000003', 'admin_sp_b@stockly.local');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0028-0000-0000-0000-000000000001';
SELECT public.create_company('Empresa SP Alpha', NULL) AS comp_a \gset
SELECT public.invite_user_to_company(:'comp_a', 'empleado_sp_a@stockly.local', 'employee') AS tok_emp \gset
SET LOCAL "request.jwt.claim.sub" = 'aaaa0028-0000-0000-0000-000000000002';
SELECT public.accept_company_invitation(:'tok_emp');
SET LOCAL "request.jwt.claim.sub" = 'aaaa0028-0000-0000-0000-000000000003';
SELECT public.create_company('Empresa SP Beta', NULL) AS comp_b \gset
RESET ROLE;

INSERT INTO public.products (company_id, sku, name, selling_price, current_stock)
VALUES (:'comp_a', 'SP-1', 'Producto SP', 100, 0) RETURNING id AS prod \gset
INSERT INTO public.suppliers (company_id, name, is_active) VALUES (:'comp_a', 'Proveedor Uno', true) RETURNING id AS sup \gset
INSERT INTO public.suppliers (company_id, name, is_active) VALUES (:'comp_a', 'Proveedor Dos', true) RETURNING id AS sup2 \gset

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0028-0000-0000-0000-000000000001';

-- 1. Una compra común (contado) no genera deuda
SELECT (public.process_purchase(:'comp_a', 'cccc0028-0000-0000-0000-000000000001', :'sup',
  format('[{"product_id": "%s", "quantity": 2, "unit_cost": 100}]', :'prod')::JSONB) ->> 'purchase_id') AS p_cash \gset
SELECT is((SELECT count(*) FROM public.supplier_balances(:'comp_a')), 0::BIGINT, 'T-01 una compra al contado no genera deuda');

-- 2-3. Compras a crédito
SELECT (public.process_credit_purchase(:'comp_a', 'cccc0028-0000-0000-0000-000000000002', :'sup',
  format('[{"product_id": "%s", "quantity": 10, "unit_cost": 100}]', :'prod')::JSONB) ->> 'purchase_id') AS p1 \gset
SELECT is((SELECT balance FROM public.supplier_balances(:'comp_a') WHERE supplier_id = :'sup'), 1000.00::NUMERIC, 'T-02 una compra a crédito genera deuda');
SELECT (public.process_credit_purchase(:'comp_a', 'cccc0028-0000-0000-0000-000000000003', :'sup',
  format('[{"product_id": "%s", "quantity": 5, "unit_cost": 100}]', :'prod')::JSONB) ->> 'purchase_id') AS p2 \gset
SELECT is((SELECT balance FROM public.supplier_balances(:'comp_a') WHERE supplier_id = :'sup'), 1500.00::NUMERIC, 'T-03 las deudas se suman');

-- 4-5. Reintentos: no duplican ni cambian la condición de pago
SELECT is((public.process_credit_purchase(:'comp_a', 'cccc0028-0000-0000-0000-000000000003', :'sup',
  format('[{"product_id": "%s", "quantity": 5, "unit_cost": 100}]', :'prod')::JSONB) ->> 'purchase_id'), :'p2', 'T-04 reenviar la compra a crédito devuelve la misma compra');
SELECT public.process_credit_purchase(:'comp_a', 'cccc0028-0000-0000-0000-000000000001', :'sup',
  format('[{"product_id": "%s", "quantity": 2, "unit_cost": 100}]', :'prod')::JSONB);
SELECT is((SELECT balance FROM public.supplier_balances(:'comp_a') WHERE supplier_id = :'sup'), 1500.00::NUMERIC, 'T-05 un reintento no convierte una compra al contado en deuda ni la duplica');

-- 6. Pago con dos medios
SELECT (public.register_supplier_payment(:'comp_a', :'sup', '[{"method":"efectivo","amount":400},{"method":"transferencia","amount":200}]'::JSONB, 'Parcial', false, 'cccc0028-0000-0000-0000-000000000010') ->> 'payment_id') AS pay1 \gset
SELECT is((SELECT balance FROM public.supplier_balances(:'comp_a') WHERE supplier_id = :'sup'), 900.00::NUMERIC, 'T-06 el pago con dos medios descuenta la deuda');

-- 7-9. Validaciones
SELECT throws_like(format($q$SELECT public.register_supplier_payment(%L, %L, '[{"method":"transferencia","amount":1000}]'::JSONB, NULL, false, 'cccc0028-0000-0000-0000-000000000011')$q$, :'comp_a', :'sup'),
  '%supera lo que se le debe%', 'T-07 no se puede pagar más de lo que se debe');
SELECT is((public.register_supplier_payment(:'comp_a', :'sup', '[{"method":"efectivo","amount":400},{"method":"transferencia","amount":200}]'::JSONB, 'Parcial', false, 'cccc0028-0000-0000-0000-000000000010') ->> 'payment_id'), :'pay1', 'T-08 reenviar el mismo pago no lo duplica');
SELECT throws_like(format($q$SELECT public.register_supplier_payment(%L, %L, '[{"method":"bitcoin","amount":10}]'::JSONB, NULL, false, 'cccc0028-0000-0000-0000-000000000012')$q$, :'comp_a', :'sup'),
  '%Medio de pago inválido%', 'T-09 medio de pago inválido rechazado');

-- 10-12. Efectivo desde la caja
SELECT throws_like(format($q$SELECT public.register_supplier_payment(%L, %L, '[{"method":"efectivo","amount":300}]'::JSONB, NULL, true, 'cccc0028-0000-0000-0000-000000000013')$q$, :'comp_a', :'sup'),
  '%No hay una caja abierta%', 'T-10 pagar desde la caja exige caja abierta');
SELECT public.open_cash_session(:'comp_a', 1000.00, 'Turno');
SELECT throws_like(format($q$SELECT public.register_supplier_payment(%L, %L, '[{"method":"transferencia","amount":100}]'::JSONB, NULL, true, 'cccc0028-0000-0000-0000-000000000014')$q$, :'comp_a', :'sup'),
  '%no tiene efectivo%', 'T-11 solo el efectivo sale de la caja');
SELECT (public.register_supplier_payment(:'comp_a', :'sup', '[{"method":"efectivo","amount":300}]'::JSONB, NULL, true, 'cccc0028-0000-0000-0000-000000000015') ->> 'payment_id') AS pay2 \gset
SELECT is((SELECT count(*) FROM public.cash_movements WHERE company_id = :'comp_a' AND movement_type = 'out' AND amount = 300 AND reason LIKE 'Pago a proveedor%'), 1::BIGINT, 'T-12 el efectivo del pago sale de la caja');

-- 13-16. Anular
SELECT throws_ok(format($q$SELECT public.void_supplier_payment(%L, %L, '  ')$q$, :'comp_a', :'pay2'), NULL, 'Indicá el motivo de la anulación.', 'T-13 anular exige motivo');
SELECT public.void_supplier_payment(:'comp_a', :'pay2', 'Error de carga');
SELECT is((SELECT balance FROM public.supplier_balances(:'comp_a') WHERE supplier_id = :'sup'), 900.00::NUMERIC, 'T-14 anular un pago devuelve la deuda');
SELECT is((SELECT count(*) FROM public.cash_movements WHERE company_id = :'comp_a' AND movement_type = 'in' AND reason LIKE 'Anulación de pago a proveedor%'), 1::BIGINT, 'T-15 el efectivo de un pago anulado vuelve a la caja');
SELECT throws_ok(format($q$SELECT public.void_supplier_payment(%L, %L, 'otra vez')$q$, :'comp_a', :'pay2'), NULL, 'Este pago ya está anulado.', 'T-16 no se anula dos veces');

-- 17. Compra a crédito anulada: deja de contar
SELECT public.cancel_purchase(:'comp_a', :'p2', 'Se devolvió la mercadería');
SELECT is((SELECT balance FROM public.supplier_balances(:'comp_a') WHERE supplier_id = :'sup'), 400.00::NUMERIC, 'T-17 una compra anulada deja de ser deuda');

-- 18. Estado de cuenta: compras a crédito activas y pagos activos
SELECT is((SELECT string_agg(kind || ':' || amount::TEXT, ',' ORDER BY occurred_at, kind DESC) FROM public.supplier_statement(:'comp_a', :'sup')), 'purchase:1000.00,payment:-600.00', 'T-18 el estado de cuenta muestra compras a crédito y pagos activos');

-- 19-20. Resumen financiero
SELECT is((SELECT (public.financial_summary(:'comp_a', CURRENT_DATE - 1, CURRENT_DATE + 1) ->> 'payables_total')::NUMERIC), 400.00::NUMERIC, 'T-19 el resumen trae la deuda total con proveedores');
SELECT is((SELECT (public.financial_summary(:'comp_a', CURRENT_DATE - 1, CURRENT_DATE + 1) ->> 'supplier_payments_total')::NUMERIC), 600.00::NUMERIC, 'T-20 el resumen trae lo pagado a proveedores en el período');

-- 21-22. Nada se borra
RESET ROLE;
SELECT throws_like(format($q$DELETE FROM public.supplier_payments WHERE id = %L$q$, :'pay1'), '%no se pueden borrar%', 'T-21 los pagos no se borran');
SELECT throws_like(format($q$DELETE FROM public.credit_purchases WHERE purchase_id = %L$q$, :'p1'), '%no se puede cambiar%', 'T-22 la condición de pago de una compra no se cambia');

-- 23-25. El rol empleado queda afuera
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0028-0000-0000-0000-000000000002';
SELECT throws_like(format($q$SELECT * FROM public.supplier_balances(%L)$q$, :'comp_a'), '%No tenés permiso%', 'T-23 el rol empleado no ve las deudas');
SELECT throws_like(format($q$SELECT public.register_supplier_payment(%L, %L, '[{"method":"transferencia","amount":10}]'::JSONB, NULL, false, 'cccc0028-0000-0000-0000-000000000020')$q$, :'comp_a', :'sup'), '%No tenés permiso%', 'T-24 el rol empleado no registra pagos');
SELECT is((SELECT count(*) FROM public.supplier_payments) + (SELECT count(*) FROM public.credit_purchases), 0::BIGINT, 'T-25 el rol empleado no lee las tablas');

-- 26. Otra empresa
SET LOCAL "request.jwt.claim.sub" = 'aaaa0028-0000-0000-0000-000000000003';
SELECT throws_ok(format($q$SELECT * FROM public.supplier_statement(%L, %L)$q$, :'comp_a', :'sup'), NULL, NULL, 'T-26 el admin de otra empresa no ve estas deudas');

SELECT * FROM finish();
ROLLBACK;
