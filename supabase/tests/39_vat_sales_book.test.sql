-- ============================================================================
-- SUITE DE PRUEBAS (pgTAP) - FACTURA ELECTRÓNICA: LIBRO IVA VENTAS (TANDA 5)
-- Módulo: vat_sales_book (comprobantes autorizados, notas en negativo, ambiente activo, permisos)
-- Estado: SUITE AISLADA E INDEPENDIENTE (Transacción con ROLLBACK)
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(9);

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
  ('aaaa0039-0000-0000-0000-000000000001', 'admin_iva_a@stockly.local'),
  ('aaaa0039-0000-0000-0000-000000000002', 'empleado_iva_a@stockly.local'),
  ('aaaa0039-0000-0000-0000-000000000003', 'admin_iva_b@stockly.local');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0039-0000-0000-0000-000000000001';
SELECT public.create_company('Empresa IVA Inscripta', '20329642330') AS comp_a \gset
SELECT public.invite_user_to_company(:'comp_a', 'empleado_iva_a@stockly.local', 'employee') AS tok_emp \gset
SELECT public.save_document_settings(:'comp_a', NULL, NULL, NULL, 'responsable_inscripto', 1, NULL);
SELECT public.save_arca_settings(:'comp_a', 3, NULL, NULL);
SET LOCAL "request.jwt.claim.sub" = 'aaaa0039-0000-0000-0000-000000000002';
SELECT public.accept_company_invitation(:'tok_emp');
SET LOCAL "request.jwt.claim.sub" = 'aaaa0039-0000-0000-0000-000000000003';
SELECT public.create_company('Empresa IVA Beta', '30712345671') AS comp_b \gset
RESET ROLE;

INSERT INTO public.products (company_id, sku, name, unit, selling_price, vat_rate) VALUES
  (:'comp_a', 'P21', 'Taladro', 'unidad', 1210.00, 21.00),
  (:'comp_a', 'P105', 'Pan', 'unidad', 221.00, 10.50);
SELECT id AS p21 FROM public.products WHERE company_id = :'comp_a' AND sku = 'P21' \gset
SELECT id AS p105 FROM public.products WHERE company_id = :'comp_a' AND sku = 'P105' \gset
INSERT INTO public.sales (id, company_id, sale_number, subtotal, discount, total_amount, created_by) VALUES
  ('5a1e0039-0000-0000-0000-000000000001', :'comp_a', 'V-1', 1431.00, 0, 1431.00, 'aaaa0039-0000-0000-0000-000000000001'),
  ('5a1e0039-0000-0000-0000-000000000002', :'comp_a', 'V-2', 1210.00, 0, 1210.00, 'aaaa0039-0000-0000-0000-000000000001');
INSERT INTO public.sale_items (company_id, sale_id, product_id, quantity, unit_price, subtotal) VALUES
  (:'comp_a', '5a1e0039-0000-0000-0000-000000000001', :'p21', 1, 1210.00, 1210.00),
  (:'comp_a', '5a1e0039-0000-0000-0000-000000000001', :'p105', 1, 221.00, 221.00),
  (:'comp_a', '5a1e0039-0000-0000-0000-000000000002', :'p21', 1, 1210.00, 1210.00);

-- Venta 1 facturada y autorizada; venta 2 facturada, autorizada, anulada y acreditada; una pendiente no cuenta
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0039-0000-0000-0000-000000000001';
SELECT public.prepare_invoice(:'comp_a', '5a1e0039-0000-0000-0000-000000000001') AS inv1 \gset
SELECT public.prepare_invoice(:'comp_a', '5a1e0039-0000-0000-0000-000000000002') AS inv2 \gset
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT public.arca_store_invoice_result(:'inv1', 'authorized', 1, '76123456789001', CURRENT_DATE + 10, NULL);
SELECT public.arca_store_invoice_result(:'inv2', 'authorized', 2, '76123456789002', CURRENT_DATE + 10, NULL);
RESET ROLE;
UPDATE public.sales SET status = 'cancelled', cancelled_at = now(), cancelled_by = 'aaaa0039-0000-0000-0000-000000000001', cancel_reason = 'prueba'
WHERE id = '5a1e0039-0000-0000-0000-000000000002';
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0039-0000-0000-0000-000000000001';
SELECT public.prepare_credit_note(:'comp_a', '5a1e0039-0000-0000-0000-000000000002', NULL) AS nc2 \gset
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT public.arca_store_invoice_result(:'nc2', 'authorized', 1, '76123456789003', CURRENT_DATE + 10, NULL);
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0039-0000-0000-0000-000000000001';

-- 1-6. El libro del período
SELECT is((SELECT count(*) FROM public.vat_sales_book(:'comp_a', CURRENT_DATE - 1, CURRENT_DATE + 1)), 3::BIGINT, 'T-01 dos facturas y una nota de crédito autorizadas');
SELECT is((SELECT vat_21 || '/' || vat_10_5 FROM public.vat_sales_book(:'comp_a', CURRENT_DATE - 1, CURRENT_DATE + 1) WHERE invoice_id = :'inv1'), '210.00/21.00', 'T-02 el IVA va separado por alícuota');
SELECT is((SELECT net_amount FROM public.vat_sales_book(:'comp_a', CURRENT_DATE - 1, CURRENT_DATE + 1) WHERE invoice_id = :'inv1'), 1200.00::NUMERIC, 'T-03 neto gravado de la factura');
SELECT is((SELECT total_amount || '/' || vat_21 FROM public.vat_sales_book(:'comp_a', CURRENT_DATE - 1, CURRENT_DATE + 1) WHERE invoice_id = :'nc2'), '-1210.00/-210.00', 'T-04 la nota de crédito resta');
SELECT is((SELECT SUM(total_amount) FROM public.vat_sales_book(:'comp_a', CURRENT_DATE - 1, CURRENT_DATE + 1)), 1431.00::NUMERIC, 'T-05 el total del período neto de notas');
SELECT is((SELECT count(*) FROM public.vat_sales_book(:'comp_a', CURRENT_DATE + 2, CURRENT_DATE + 5)), 0::BIGINT, 'T-06 fuera del período no aparece nada');

-- 7. Solo el ambiente activo: si la empresa pasa a producción, las de prueba no se mezclan
RESET ROLE;
UPDATE public.arca_settings SET environment = 'produccion' WHERE company_id = :'comp_a';
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0039-0000-0000-0000-000000000001';
SELECT is((SELECT count(*) FROM public.vat_sales_book(:'comp_a', CURRENT_DATE - 1, CURRENT_DATE + 1)), 0::BIGINT, 'T-07 las facturas de homologación no entran al libro de producción');

-- 8-9. Permisos y aislamiento
SET LOCAL "request.jwt.claim.sub" = 'aaaa0039-0000-0000-0000-000000000002';
SELECT throws_like(format($q$SELECT * FROM public.vat_sales_book(%L, CURRENT_DATE - 1, CURRENT_DATE)$q$, :'comp_a'), '%permiso%', 'T-08 un empleado sin acceso a Informes no ve el libro');
SET LOCAL "request.jwt.claim.sub" = 'aaaa0039-0000-0000-0000-000000000003';
SELECT throws_like(format($q$SELECT * FROM public.vat_sales_book(%L, CURRENT_DATE - 1, CURRENT_DATE)$q$, :'comp_a'), '%', 'T-09 otra empresa no ve el libro ajeno');

SELECT * FROM finish();
ROLLBACK;
