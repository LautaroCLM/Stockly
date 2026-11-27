-- ============================================================================
-- SUITE DE PRUEBAS (pgTAP) - FACTURA ELECTRÓNICA: FACTURAS A, B Y C (TANDA 3)
-- Módulo: prepare_invoice (letra, receptor, IVA por alícuota), numeración y resultado de ARCA
-- Estado: SUITE AISLADA E INDEPENDIENTE (Transacción con ROLLBACK)
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(24);

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
  ('aaaa0037-0000-0000-0000-000000000001', 'admin_fac_a@stockly.local'),
  ('aaaa0037-0000-0000-0000-000000000002', 'empleado_fac_a@stockly.local'),
  ('aaaa0037-0000-0000-0000-000000000003', 'admin_fac_b@stockly.local');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0037-0000-0000-0000-000000000001';
SELECT public.create_company('Empresa FAC Inscripta', '20329642330') AS comp_a \gset
SELECT public.invite_user_to_company(:'comp_a', 'empleado_fac_a@stockly.local', 'employee') AS tok_emp \gset
SELECT public.save_document_settings(:'comp_a', NULL, NULL, NULL, 'responsable_inscripto', 1, NULL);
SELECT public.save_arca_settings(:'comp_a', 3, NULL, NULL);
SET LOCAL "request.jwt.claim.sub" = 'aaaa0037-0000-0000-0000-000000000002';
SELECT public.accept_company_invitation(:'tok_emp');
SET LOCAL "request.jwt.claim.sub" = 'aaaa0037-0000-0000-0000-000000000003';
SELECT public.create_company('Empresa FAC Monotributo', '30712345671') AS comp_b \gset
SELECT public.save_document_settings(:'comp_b', NULL, NULL, NULL, 'monotributo', 1, NULL);
SELECT public.save_arca_settings(:'comp_b', 2, NULL, NULL);
RESET ROLE;

-- Catálogo: un producto al 21 % y otro al 10,5 %
INSERT INTO public.products (company_id, sku, name, unit, selling_price, vat_rate) VALUES
  (:'comp_a', 'P21', 'Taladro', 'unidad', 1210.00, 21.00),
  (:'comp_a', 'P105', 'Pan', 'unidad', 221.00, 10.50),
  (:'comp_b', 'PB', 'Martillo', 'unidad', 500.00, 21.00);
SELECT id AS p21 FROM public.products WHERE company_id = :'comp_a' AND sku = 'P21' \gset
SELECT id AS p105 FROM public.products WHERE company_id = :'comp_a' AND sku = 'P105' \gset
SELECT id AS pb FROM public.products WHERE company_id = :'comp_b' \gset
INSERT INTO public.customers (company_id, name, identification_type, tax_id, vat_condition) VALUES
  (:'comp_a', 'Inscripto SA', 'CUIT', '30712345671', 'responsable_inscripto'),
  (:'comp_a', 'Mono con DNI', 'DNI', '30111222', 'monotributo');
SELECT id AS c_ri FROM public.customers WHERE company_id = :'comp_a' AND name = 'Inscripto SA' \gset
SELECT id AS c_mono FROM public.customers WHERE company_id = :'comp_a' AND name = 'Mono con DNI' \gset

-- Ventas: consumidor final con 10 % de descuento, a un inscripto, a un monotributista sin CUIT, anulada, y de la empresa B
INSERT INTO public.sales (id, company_id, sale_number, customer_id, subtotal, discount, total_amount, created_by) VALUES
  ('5a1e0037-0000-0000-0000-000000000001', :'comp_a', 'V-1', NULL, 1431.00, 143.10, 1287.90, 'aaaa0037-0000-0000-0000-000000000001'),
  ('5a1e0037-0000-0000-0000-000000000002', :'comp_a', 'V-2', :'c_ri', 1210.00, 0, 1210.00, 'aaaa0037-0000-0000-0000-000000000001'),
  ('5a1e0037-0000-0000-0000-000000000003', :'comp_a', 'V-3', :'c_mono', 1210.00, 0, 1210.00, 'aaaa0037-0000-0000-0000-000000000001'),
  ('5a1e0037-0000-0000-0000-000000000005', :'comp_b', 'V-1', NULL, 500.00, 0, 500.00, 'aaaa0037-0000-0000-0000-000000000003');
INSERT INTO public.sales (id, company_id, sale_number, subtotal, discount, total_amount, created_by, status, cancelled_at, cancelled_by, cancel_reason) VALUES
  ('5a1e0037-0000-0000-0000-000000000004', :'comp_a', 'V-4', 1210.00, 0, 1210.00, 'aaaa0037-0000-0000-0000-000000000001', 'cancelled', now(), 'aaaa0037-0000-0000-0000-000000000001', 'prueba');
INSERT INTO public.sale_items (company_id, sale_id, product_id, quantity, unit_price, subtotal) VALUES
  (:'comp_a', '5a1e0037-0000-0000-0000-000000000001', :'p21', 1, 1210.00, 1210.00),
  (:'comp_a', '5a1e0037-0000-0000-0000-000000000001', :'p105', 1, 221.00, 221.00),
  (:'comp_a', '5a1e0037-0000-0000-0000-000000000002', :'p21', 1, 1210.00, 1210.00),
  (:'comp_a', '5a1e0037-0000-0000-0000-000000000003', :'p21', 1, 1210.00, 1210.00),
  (:'comp_a', '5a1e0037-0000-0000-0000-000000000004', :'p21', 1, 1210.00, 1210.00),
  (:'comp_b', '5a1e0037-0000-0000-0000-000000000005', :'pb', 1, 500.00, 500.00);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0037-0000-0000-0000-000000000001';

-- 1-8. Consumidor final: Factura B, descuento repartido entre 21 % y 10,5 %
SELECT public.prepare_invoice(:'comp_a', '5a1e0037-0000-0000-0000-000000000001') AS inv_b \gset
SELECT is((SELECT letter || invoice_type FROM public.invoices WHERE id = :'inv_b'), 'B6', 'T-01 a consumidor final le corresponde Factura B (tipo 6)');
SELECT is((SELECT receiver_doc_type || '/' || receiver_doc_number || '/' || receiver_vat_condition_id FROM public.invoices WHERE id = :'inv_b'), '99/0/5', 'T-02 receptor sin identificar: doc 99, condición 5');
SELECT is((SELECT net_amount FROM public.invoices WHERE id = :'inv_b'), 1080.00::NUMERIC, 'T-03 neto gravado 1.080,00');
SELECT is((SELECT vat_amount FROM public.invoices WHERE id = :'inv_b'), 207.90::NUMERIC, 'T-04 IVA total 207,90');
SELECT is((SELECT total_amount FROM public.invoices WHERE id = :'inv_b'), 1287.90::NUMERIC, 'T-05 total igual al de la venta');
SELECT is((SELECT base_amount || '/' || vat_amount || '/' || arca_vat_id FROM public.invoice_vat_lines WHERE invoice_id = :'inv_b' AND vat_rate = 10.5), '180.00/18.90/4', 'T-06 10,5 %: base 180,00, IVA 18,90, código 4');
SELECT is((SELECT base_amount || '/' || vat_amount || '/' || arca_vat_id FROM public.invoice_vat_lines WHERE invoice_id = :'inv_b' AND vat_rate = 21), '900.00/189.00/5', 'T-07 21 %: base 900,00, IVA 189,00, código 5');
SELECT is((SELECT count(*) FROM public.invoice_items WHERE invoice_id = :'inv_b'), 2::BIGINT, 'T-08 copia los ítems de la venta');

-- 9-10. Reintento: la pendiente se reutiliza; nadie edita directo
SELECT is(public.prepare_invoice(:'comp_a', '5a1e0037-0000-0000-0000-000000000001'), :'inv_b'::UUID, 'T-09 pedirla de nuevo devuelve la misma factura pendiente');
SELECT throws_like($q$UPDATE public.invoices SET total_amount = 1$q$, '%permission denied%', 'T-10 nadie edita facturas desde el navegador');

-- 11-13. Inscripto y monotributista: Factura A, con CUIT obligatorio
SELECT public.prepare_invoice(:'comp_a', '5a1e0037-0000-0000-0000-000000000002') AS inv_a \gset
SELECT is((SELECT letter || '/' || receiver_doc_type || '/' || receiver_doc_number || '/' || receiver_vat_condition_id FROM public.invoices WHERE id = :'inv_a'), 'A/80/30712345671/1', 'T-11 a un inscripto le corresponde Factura A con su CUIT');
SELECT is((SELECT net_amount || '/' || vat_amount FROM public.invoices WHERE id = :'inv_a'), '1000.00/210.00', 'T-12 Factura A: neto 1.000,00 e IVA 210,00');
SELECT throws_like(format($q$SELECT public.prepare_invoice(%L, '5a1e0037-0000-0000-0000-000000000003')$q$, :'comp_a'), '%necesita su CUIT%', 'T-13 un monotributista sin CUIT no puede recibir Factura A');

-- 14. Venta anulada
SELECT throws_like(format($q$SELECT public.prepare_invoice(%L, '5a1e0037-0000-0000-0000-000000000004')$q$, :'comp_a'), '%anulada%', 'T-14 una venta anulada no se factura');

-- 15. Empleado sin permiso
SET LOCAL "request.jwt.claim.sub" = 'aaaa0037-0000-0000-0000-000000000002';
SELECT throws_like(format($q$SELECT public.prepare_invoice(%L, '5a1e0037-0000-0000-0000-000000000002')$q$, :'comp_a'), '%permiso%', 'T-15 un empleado sin permiso de facturación no factura');

-- 16-18. Monotributo: Factura C sin IVA discriminado
SET LOCAL "request.jwt.claim.sub" = 'aaaa0037-0000-0000-0000-000000000003';
SELECT public.prepare_invoice(:'comp_b', '5a1e0037-0000-0000-0000-000000000005') AS inv_c \gset
SELECT is((SELECT letter || invoice_type || '/' || point_of_sale FROM public.invoices WHERE id = :'inv_c'), 'C11/2', 'T-16 un monotributista emite Factura C en su punto de venta');
SELECT is((SELECT net_amount || '/' || vat_amount FROM public.invoices WHERE id = :'inv_c'), '500.00/0.00', 'T-17 Factura C: el neto es el total y no hay IVA');
SELECT is((SELECT count(*) FROM public.invoice_vat_lines WHERE invoice_id = :'inv_c'), 0::BIGINT, 'T-18 Factura C sin alícuotas');

-- 19. Aislamiento
SELECT is((SELECT count(*) FROM public.invoices WHERE company_id = :'comp_a'), 0::BIGINT, 'T-19 otra empresa no ve las facturas ajenas');

-- 20-24. Edge Function: turno de numeración y resultado de ARCA
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT is(public.arca_lock_numbering(:'inv_b', 60), true, 'T-20 la factura toma el turno de numeración de su tipo');
SELECT is(public.arca_lock_numbering(:'inv_b', 60), true, 'T-21 la misma factura puede renovar su turno');
SELECT public.arca_store_invoice_result(:'inv_b', 'authorized', 15, '76123456789012', CURRENT_DATE + 10, NULL);
SELECT public.arca_unlock_numbering(:'inv_b');
RESET ROLE;
SELECT is((SELECT status || '/' || number || '/' || cae FROM public.invoices WHERE id = :'inv_b'), 'authorized/15/76123456789012', 'T-22 la factura queda autorizada con número y CAE');
SELECT throws_like(format($q$UPDATE public.invoices SET receiver_name = 'x' WHERE id = %L$q$, :'inv_b'), '%nota de crédito%', 'T-23 una factura autorizada no se modifica');
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0037-0000-0000-0000-000000000001';
SELECT throws_like(format($q$SELECT public.prepare_invoice(%L, '5a1e0037-0000-0000-0000-000000000001')$q$, :'comp_a'), '%ya está facturada%', 'T-24 una venta facturada no se factura de nuevo');

SELECT * FROM finish();
ROLLBACK;
