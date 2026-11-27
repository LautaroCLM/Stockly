-- ============================================================================
-- SUITE DE PRUEBAS (pgTAP) - FACTURA ELECTRÓNICA: NOTAS DE CRÉDITO (TANDA 4)
-- Módulo: prepare_credit_note (anulación y devolución), pending_credit_notes y límites
-- Estado: SUITE AISLADA E INDEPENDIENTE (Transacción con ROLLBACK)
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(16);

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
  ('aaaa0038-0000-0000-0000-000000000001', 'admin_nc_a@stockly.local'),
  ('aaaa0038-0000-0000-0000-000000000003', 'admin_nc_b@stockly.local');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0038-0000-0000-0000-000000000001';
SELECT public.create_company('Empresa NC Inscripta', '20329642330') AS comp_a \gset
SELECT public.save_document_settings(:'comp_a', NULL, NULL, NULL, 'responsable_inscripto', 1, NULL);
SELECT public.save_arca_settings(:'comp_a', 3, NULL, NULL);
SET LOCAL "request.jwt.claim.sub" = 'aaaa0038-0000-0000-0000-000000000003';
SELECT public.create_company('Empresa NC Beta', '30712345671') AS comp_b \gset
RESET ROLE;

INSERT INTO public.products (company_id, sku, name, unit, selling_price, vat_rate) VALUES
  (:'comp_a', 'P21', 'Taladro', 'unidad', 1210.00, 21.00),
  (:'comp_a', 'P105', 'Pan', 'unidad', 221.00, 10.50);
SELECT id AS p21 FROM public.products WHERE company_id = :'comp_a' AND sku = 'P21' \gset
SELECT id AS p105 FROM public.products WHERE company_id = :'comp_a' AND sku = 'P105' \gset

-- Venta 1 (se devuelve en parte) y venta 2 (se anula), las dos sin descuento
INSERT INTO public.sales (id, company_id, sale_number, subtotal, discount, total_amount, created_by) VALUES
  ('5a1e0038-0000-0000-0000-000000000001', :'comp_a', 'V-1', 1431.00, 0, 1431.00, 'aaaa0038-0000-0000-0000-000000000001'),
  ('5a1e0038-0000-0000-0000-000000000002', :'comp_a', 'V-2', 1210.00, 0, 1210.00, 'aaaa0038-0000-0000-0000-000000000001');
INSERT INTO public.sale_items (id, company_id, sale_id, product_id, quantity, unit_price, subtotal) VALUES
  ('5a1e1038-0000-0000-0000-000000000001', :'comp_a', '5a1e0038-0000-0000-0000-000000000001', :'p21', 1, 1210.00, 1210.00),
  ('5a1e1038-0000-0000-0000-000000000002', :'comp_a', '5a1e0038-0000-0000-0000-000000000001', :'p105', 1, 221.00, 221.00),
  ('5a1e1038-0000-0000-0000-000000000003', :'comp_a', '5a1e0038-0000-0000-0000-000000000002', :'p21', 1, 1210.00, 1210.00);

-- Facturar las dos y marcarlas autorizadas (como lo haría la Edge Function)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0038-0000-0000-0000-000000000001';
SELECT public.prepare_invoice(:'comp_a', '5a1e0038-0000-0000-0000-000000000001') AS inv1 \gset
SELECT public.prepare_invoice(:'comp_a', '5a1e0038-0000-0000-0000-000000000002') AS inv2 \gset
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT public.arca_store_invoice_result(:'inv1', 'authorized', 20, '76123456789012', CURRENT_DATE + 10, NULL);
SELECT public.arca_store_invoice_result(:'inv2', 'authorized', 21, '76123456789013', CURRENT_DATE + 10, NULL);
RESET ROLE;

-- 1. Sin devoluciones ni anulaciones no falta ninguna nota
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0038-0000-0000-0000-000000000001';
SELECT is((SELECT count(*) FROM public.pending_credit_notes(:'comp_a', ARRAY['5a1e0038-0000-0000-0000-000000000001', '5a1e0038-0000-0000-0000-000000000002']::UUID[])), 0::BIGINT, 'T-01 sin devoluciones ni anulaciones no falta ninguna nota');

-- Devolver el pan de la venta 1 y anular la venta 2
RESET ROLE;
INSERT INTO public.sale_returns (id, company_id, sale_id, return_number, reason, refund_amount, cash_session_id, idempotency_key, created_by) VALUES
  ('7e7e0038-0000-0000-0000-000000000001', :'comp_a', '5a1e0038-0000-0000-0000-000000000001', 'DEV-1', 'prueba', 221.00, gen_random_uuid(), gen_random_uuid(), 'aaaa0038-0000-0000-0000-000000000001');
INSERT INTO public.sale_return_items (company_id, return_id, sale_item_id, product_id, quantity, amount) VALUES
  (:'comp_a', '7e7e0038-0000-0000-0000-000000000001', '5a1e1038-0000-0000-0000-000000000002', :'p105', 1, 221.00);
UPDATE public.sales SET status = 'cancelled', cancelled_at = now(), cancelled_by = 'aaaa0038-0000-0000-0000-000000000001', cancel_reason = 'prueba'
WHERE id = '5a1e0038-0000-0000-0000-000000000002';
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0038-0000-0000-0000-000000000001';

-- 2-3. Ahora faltan dos: la de la devolución y la de la anulación
SELECT is((SELECT count(*) FROM public.pending_credit_notes(:'comp_a', ARRAY['5a1e0038-0000-0000-0000-000000000001', '5a1e0038-0000-0000-0000-000000000002']::UUID[])), 2::BIGINT, 'T-02 faltan dos notas de crédito');
SELECT is((SELECT amount FROM public.pending_credit_notes(:'comp_a', ARRAY['5a1e0038-0000-0000-0000-000000000001']::UUID[])), 221.00::NUMERIC, 'T-03 la de la devolución es por lo reintegrado');

-- 4-8. Nota de crédito por la devolución: NC B (8), alícuota del ítem en la factura
SELECT public.prepare_credit_note(:'comp_a', '5a1e0038-0000-0000-0000-000000000001', '7e7e0038-0000-0000-0000-000000000001') AS nc1 \gset
SELECT is((SELECT kind || '/' || letter || invoice_type FROM public.invoices WHERE id = :'nc1'), 'credit_note/B8', 'T-04 a consumidor final le corresponde nota de crédito B (tipo 8)');
SELECT is((SELECT associated_invoice_id FROM public.invoices WHERE id = :'nc1'), :'inv1'::UUID, 'T-05 queda asociada a la factura');
SELECT is((SELECT net_amount || '/' || vat_amount || '/' || total_amount FROM public.invoices WHERE id = :'nc1'), '200.00/21.00/221.00', 'T-06 el pan al 10,5 %: neto 200,00 e IVA 21,00');
SELECT is((SELECT count(*) FROM public.invoice_vat_lines WHERE invoice_id = :'nc1' AND vat_rate = 10.5), 1::BIGINT, 'T-07 una sola alícuota: la del ítem devuelto');
SELECT is(public.prepare_credit_note(:'comp_a', '5a1e0038-0000-0000-0000-000000000001', '7e7e0038-0000-0000-0000-000000000001'), :'nc1'::UUID, 'T-08 pedirla de nuevo devuelve la misma pendiente');

-- 9-12. Nota de crédito por la anulación: copia la factura entera
SELECT public.prepare_credit_note(:'comp_a', '5a1e0038-0000-0000-0000-000000000002', NULL) AS nc2 \gset
SELECT is((SELECT total_amount FROM public.invoices WHERE id = :'nc2'), 1210.00::NUMERIC, 'T-09 la anulación acredita el total de la factura');
SELECT is((SELECT net_amount || '/' || vat_amount FROM public.invoices WHERE id = :'nc2'), '1000.00/210.00', 'T-10 con el mismo neto e IVA que la factura');
SELECT is((SELECT count(*) FROM public.invoice_items WHERE invoice_id = :'nc2'), 1::BIGINT, 'T-11 con los mismos ítems');
SELECT is((SELECT count(*) FROM public.pending_credit_notes(:'comp_a', ARRAY['5a1e0038-0000-0000-0000-000000000001', '5a1e0038-0000-0000-0000-000000000002']::UUID[])), 0::BIGINT, 'T-12 con las dos notas preparadas no falta ninguna');

-- 13-14. Límites
SELECT throws_like(format($q$SELECT public.prepare_credit_note(%L, '5a1e0038-0000-0000-0000-000000000001', NULL)$q$, :'comp_a'), '%ventas anuladas%', 'T-13 la nota total solo es para ventas anuladas');
RESET ROLE;
INSERT INTO public.sale_returns (id, company_id, sale_id, return_number, reason, refund_amount, cash_session_id, idempotency_key, created_by) VALUES
  ('7e7e0038-0000-0000-0000-000000000002', :'comp_a', '5a1e0038-0000-0000-0000-000000000001', 'DEV-2', 'prueba', 1300.00, gen_random_uuid(), gen_random_uuid(), 'aaaa0038-0000-0000-0000-000000000001');
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0038-0000-0000-0000-000000000001';
SELECT throws_like(format($q$SELECT public.prepare_credit_note(%L, '5a1e0038-0000-0000-0000-000000000001', '7e7e0038-0000-0000-0000-000000000002')$q$, :'comp_a'), '%superarían el total%', 'T-14 las notas no pueden superar el total de la factura');

-- 15. Una factura pendiente de una venta anulada ya no se emite
RESET ROLE;
INSERT INTO public.sales (id, company_id, sale_number, subtotal, discount, total_amount, created_by) VALUES
  ('5a1e0038-0000-0000-0000-000000000003', :'comp_a', 'V-3', 1210.00, 0, 1210.00, 'aaaa0038-0000-0000-0000-000000000001');
INSERT INTO public.sale_items (company_id, sale_id, product_id, quantity, unit_price, subtotal) VALUES
  (:'comp_a', '5a1e0038-0000-0000-0000-000000000003', :'p21', 1, 1210.00, 1210.00);
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0038-0000-0000-0000-000000000001';
SELECT public.prepare_invoice(:'comp_a', '5a1e0038-0000-0000-0000-000000000003') AS inv3 \gset
RESET ROLE;
UPDATE public.sales SET status = 'cancelled', cancelled_at = now(), cancelled_by = 'aaaa0038-0000-0000-0000-000000000001', cancel_reason = 'prueba'
WHERE id = '5a1e0038-0000-0000-0000-000000000003';
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0038-0000-0000-0000-000000000001';
SELECT throws_like(format($q$SELECT public.arca_invoice_context(%L, %L)$q$, :'comp_a', :'inv3'), '%anulada%', 'T-15 una factura pendiente de una venta anulada no se emite');

-- 16. Aislamiento
SET LOCAL "request.jwt.claim.sub" = 'aaaa0038-0000-0000-0000-000000000003';
SELECT is((SELECT count(*) FROM public.pending_credit_notes(:'comp_a', ARRAY['5a1e0038-0000-0000-0000-000000000001']::UUID[])), 0::BIGINT, 'T-16 otra empresa no ve qué notas faltan');

SELECT * FROM finish();
ROLLBACK;
