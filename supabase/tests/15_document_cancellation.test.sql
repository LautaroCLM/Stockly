-- ============================================================================
-- SUITE DE PRUEBAS (pgTAP) - ANULACIÓN DE VENTAS Y COMPRAS (Hallazgo H-06)
-- Módulo: public.cancel_sale, public.cancel_purchase, guard_document_cancellation
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
-- Estado: SUITE AISLADA E INDEPENDIENTE (Transacción con ROLLBACK)
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(20);

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
-- 2. SETUP: Empresa A (admin + empleado) y Empresa B (admin)
-- ============================================================================
INSERT INTO auth.users (id, email) VALUES
  ('aaaa0015-0000-0000-0000-000000000001', 'admin_cx_a@stockly.local'),
  ('aaaa0015-0000-0000-0000-000000000002', 'empleado_cx_a@stockly.local'),
  ('aaaa0015-0000-0000-0000-000000000003', 'admin_cx_b@stockly.local');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0015-0000-0000-0000-000000000001';
SELECT public.create_company('Empresa CX Alpha', NULL) AS comp_a \gset
SELECT public.invite_user_to_company(:'comp_a', 'empleado_cx_a@stockly.local', 'employee') AS tok_emp \gset

SET LOCAL "request.jwt.claim.sub" = 'aaaa0015-0000-0000-0000-000000000002';
SELECT public.accept_company_invitation(:'tok_emp');

SET LOCAL "request.jwt.claim.sub" = 'aaaa0015-0000-0000-0000-000000000003';
SELECT public.create_company('Empresa CX Beta', NULL) AS comp_b \gset

RESET ROLE;

INSERT INTO public.products (company_id, sku, name, selling_price)
VALUES (:'comp_a', 'CX-VTA', 'Producto venta CX', 100.00) RETURNING id AS prod_sale \gset
INSERT INTO public.products (company_id, sku, name, selling_price)
VALUES (:'comp_a', 'CX-CMP', 'Producto compra CX', 100.00) RETURNING id AS prod_buy \gset
INSERT INTO public.product_costs (company_id, product_id, cost_price, updated_by)
VALUES (:'comp_a', :'prod_sale', 55.00, 'aaaa0015-0000-0000-0000-000000000001');
INSERT INTO public.stock_movements (company_id, product_id, direction, reason, quantity, previous_stock, new_stock, created_by)
VALUES (:'comp_a', :'prod_sale', 'increase', 'initial_load', 10, 0, 0, 'aaaa0015-0000-0000-0000-000000000001');
INSERT INTO public.suppliers (company_id, name)
VALUES (:'comp_a', 'Proveedor CX') RETURNING id AS supplier \gset

-- Venta de 3 unidades (stock 10 -> 7) registrada por el admin
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0015-0000-0000-0000-000000000001';
SELECT (public.process_sale(
  :'comp_a', 'cccc0015-0000-0000-0000-000000000001',
  format('[{"product_id": "%s", "quantity": 3}]', :'prod_sale')::JSONB,
  0, '[{"method": "efectivo", "amount": 300}]'::JSONB
) ->> 'sale_id') AS sale_id \gset

-- ============================================================================
-- 3. ASERCIONES: ANULACIÓN DE VENTAS
-- ============================================================================

-- T-01/T-02: Las funciones existen
SELECT has_function('public', 'cancel_sale', ARRAY['uuid', 'uuid', 'text'], 'T-01: public.cancel_sale debe existir.');
SELECT has_function('public', 'cancel_purchase', ARRAY['uuid', 'uuid', 'text'], 'T-02: public.cancel_purchase debe existir.');

-- T-03: Un empleado no puede anular
SET LOCAL "request.jwt.claim.sub" = 'aaaa0015-0000-0000-0000-000000000002';
SELECT throws_like(
  format('SELECT public.cancel_sale(%L, %L, %L)', :'comp_a', :'sale_id', 'Error de cobro'),
  '%No tenés permiso%',
  'T-03: Un empleado no puede anular ventas.');

-- T-04: El motivo es obligatorio
SET LOCAL "request.jwt.claim.sub" = 'aaaa0015-0000-0000-0000-000000000001';
SELECT throws_like(
  format('SELECT public.cancel_sale(%L, %L, %L)', :'comp_a', :'sale_id', '   '),
  '%motivo%',
  'T-04: Anular sin motivo es rechazado.');

-- T-05: El admin de otra empresa no encuentra la venta desde su empresa
SET LOCAL "request.jwt.claim.sub" = 'aaaa0015-0000-0000-0000-000000000003';
SELECT throws_like(
  format('SELECT public.cancel_sale(%L, %L, %L)', :'comp_b', :'sale_id', 'Intento ajeno'),
  '%no encontrada%',
  'T-05: Una venta de otra empresa no se puede anular.');

-- T-06/T-07: Anulación válida devuelve cancelled y repone el stock
SET LOCAL "request.jwt.claim.sub" = 'aaaa0015-0000-0000-0000-000000000001';
SELECT public.cancel_sale(:'comp_a', :'sale_id', 'Error de cobro') AS res_cancel \gset
SELECT is((:'res_cancel'::JSONB ->> 'already_cancelled')::BOOLEAN, false, 'T-06: La primera anulación se aplica.');
SELECT is((SELECT current_stock FROM public.products WHERE id = :'prod_sale'), 10.00::NUMERIC(12, 2),
  'T-07: La anulación repone el stock vendido (7 -> 10).');

-- T-08/T-09: Movimiento de reposición con el costo congelado de la venta
SELECT is(
  (SELECT direction || ':' || reason || ':' || quantity::TEXT FROM public.stock_movements
   WHERE reference_sale_id = :'sale_id' AND reason = 'cancellation'),
  'increase:cancellation:3.00',
  'T-08: Se registra un movimiento increase/cancellation por la cantidad vendida.');
SELECT is(
  (SELECT mc.unit_cost FROM public.movement_costs mc JOIN public.stock_movements sm ON sm.id = mc.movement_id
   WHERE sm.reference_sale_id = :'sale_id' AND sm.reason = 'cancellation'),
  55.00::NUMERIC(14, 2),
  'T-09: El movimiento de anulación usa el costo congelado de la venta.');

-- T-10: Datos de anulación completos en la venta
SELECT is(
  (SELECT status || ':' || cancel_reason || ':' || (cancelled_by = 'aaaa0015-0000-0000-0000-000000000001')::TEXT
   FROM public.sales WHERE id = :'sale_id'),
  'cancelled:Error de cobro:true',
  'T-10: La venta queda anulada con motivo y autor.');

-- T-11/T-12: Reintentar no duplica la reposición
SELECT is(
  (public.cancel_sale(:'comp_a', :'sale_id', 'Error de cobro') ->> 'already_cancelled')::BOOLEAN, true,
  'T-11: Reintentar la anulación devuelve already_cancelled.');
SELECT is((SELECT current_stock FROM public.products WHERE id = :'prod_sale'), 10.00::NUMERIC(12, 2),
  'T-12: El reintento no vuelve a reponer stock.');

-- T-13: Queda registrada en auditoría
RESET ROLE;
SELECT is(
  (SELECT count(*)::INT FROM public.audit_log WHERE table_name = 'sales' AND record_id = :'sale_id'
     AND new_data ->> 'status' = 'cancelled'),
  1,
  'T-13: La anulación queda en audit_log.');

-- T-14/T-15: El documento sigue inmutable aun para roles con bypass
SELECT throws_matching(
  format($$UPDATE public.sales SET notes = 'cambio' WHERE id = %L$$, :'sale_id'),
  'inmutable',
  'T-14: No se puede modificar otra columna de una venta anulada.');
SELECT throws_matching(
  format($$UPDATE public.sales SET status = 'completed', cancelled_at = NULL, cancelled_by = NULL, cancel_reason = NULL WHERE id = %L$$, :'sale_id'),
  'inmutable',
  'T-15: Una venta anulada no puede volver a completada.');

-- ============================================================================
-- 4. ASERCIONES: ANULACIÓN DE COMPRAS
-- ============================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0015-0000-0000-0000-000000000001';

-- T-16/T-17: Comprar 5 y anular deja el stock en 0 con salida purchase_cancellation
SELECT (public.process_purchase(
  :'comp_a', 'cccc0015-0000-0000-0000-000000000002', :'supplier',
  format('[{"product_id": "%s", "quantity": 5, "unit_cost": 20}]', :'prod_buy')::JSONB
) ->> 'purchase_id') AS purchase_1 \gset
SELECT public.cancel_purchase(:'comp_a', :'purchase_1', 'Factura duplicada');
SELECT is((SELECT current_stock FROM public.products WHERE id = :'prod_buy'), 0.00::NUMERIC(12, 2),
  'T-16: Anular la compra descuenta el stock ingresado (5 -> 0).');
SELECT is(
  (SELECT direction || ':' || quantity::TEXT FROM public.stock_movements
   WHERE reference_purchase_id = :'purchase_1' AND reason = 'purchase_cancellation'),
  'decrease:5.00',
  'T-17: Se registra un movimiento decrease/purchase_cancellation.');

-- T-18/T-19: Si la mercadería ya se vendió y no se admite stock negativo, la anulación se rechaza
SELECT (public.process_purchase(
  :'comp_a', 'cccc0015-0000-0000-0000-000000000003', :'supplier',
  format('[{"product_id": "%s", "quantity": 5, "unit_cost": 20}]', :'prod_buy')::JSONB
) ->> 'purchase_id') AS purchase_2 \gset
SELECT public.process_sale(
  :'comp_a', 'cccc0015-0000-0000-0000-000000000004',
  format('[{"product_id": "%s", "quantity": 4}]', :'prod_buy')::JSONB,
  0, '[{"method": "efectivo", "amount": 400}]'::JSONB
);
SELECT public.set_company_negative_stock_policy(:'comp_a', false, 'Prueba de anulación');
SELECT throws_like(
  format('SELECT public.cancel_purchase(%L, %L, %L)', :'comp_a', :'purchase_2', 'Mercadería vendida'),
  '%Stock insuficiente%',
  'T-18: No se anula una compra cuya mercadería ya se vendió si no se admite stock negativo.');
SELECT is((SELECT status FROM public.purchases WHERE id = :'purchase_2'), 'completed',
  'T-19: La compra rechazada sigue completada.');

-- T-20: El documento compra también queda protegido
RESET ROLE;
SELECT throws_matching(
  format($$DELETE FROM public.purchases WHERE id = %L$$, :'purchase_1'),
  'inmutable',
  'T-20: Una compra no se puede eliminar.');

SELECT * FROM finish();

ROLLBACK;
