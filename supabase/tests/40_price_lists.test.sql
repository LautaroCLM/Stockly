-- ============================================================================
-- SUITE DE PRUEBAS (pgTAP) - LISTAS DE PRECIOS
-- Módulo: price_lists, price_for, process_sale con lista del cliente, permisos y aislamiento
-- Estado: SUITE AISLADA E INDEPENDIENTE (Transacción con ROLLBACK)
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(14);

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
  ('aaaa0040-0000-0000-0000-000000000001', 'admin_pl_a@stockly.local'),
  ('aaaa0040-0000-0000-0000-000000000002', 'empleado_pl_a@stockly.local'),
  ('aaaa0040-0000-0000-0000-000000000003', 'admin_pl_b@stockly.local');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0040-0000-0000-0000-000000000001';
SELECT public.create_company('Empresa PL Alpha', NULL) AS comp_a \gset
SELECT public.invite_user_to_company(:'comp_a', 'empleado_pl_a@stockly.local', 'employee') AS tok_emp \gset
SET LOCAL "request.jwt.claim.sub" = 'aaaa0040-0000-0000-0000-000000000002';
SELECT public.accept_company_invitation(:'tok_emp');
SET LOCAL "request.jwt.claim.sub" = 'aaaa0040-0000-0000-0000-000000000003';
SELECT public.create_company('Empresa PL Beta', NULL) AS comp_b \gset
SELECT public.save_price_list(:'comp_b', NULL, 'Lista ajena', 10, 1, true) AS list_b \gset
RESET ROLE;

INSERT INTO public.products (company_id, sku, name, unit, selling_price, current_stock) VALUES
  (:'comp_a', 'P', 'Taladro', 'unidad', 1000.00, 100),
  (:'comp_a', 'Q', 'Mecha', 'unidad', 333.33, 100);
SELECT id AS p FROM public.products WHERE company_id = :'comp_a' AND sku = 'P' \gset
SELECT id AS q FROM public.products WHERE company_id = :'comp_a' AND sku = 'Q' \gset

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0040-0000-0000-0000-000000000001';
SELECT public.save_price_list(:'comp_a', NULL, 'Mayorista', -15, 10, true) AS list_a \gset
SELECT public.set_price_list_item(:'comp_a', :'list_a', :'q', 250);
RESET ROLE;
INSERT INTO public.customers (company_id, name, price_list_id) VALUES (:'comp_a', 'Comercio con lista', :'list_a');
INSERT INTO public.customers (company_id, name) VALUES (:'comp_a', 'Cliente común');
SELECT id AS c_list FROM public.customers WHERE company_id = :'comp_a' AND name = 'Comercio con lista' \gset
SELECT id AS c_plain FROM public.customers WHERE company_id = :'comp_a' AND name = 'Cliente común' \gset

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0040-0000-0000-0000-000000000001';

-- 1-2. Precio en la lista: porcentaje con redondeo, y excepción
SELECT is((SELECT price FROM public.price_list_prices(:'comp_a', :'list_a') WHERE product_id = :'p'), 850.00::NUMERIC, 'T-01 -15 % redondeado a $10: 1.000 pasa a 850');
SELECT is((SELECT price || '/' || is_fixed FROM public.price_list_prices(:'comp_a', :'list_a') WHERE product_id = :'q'), '250.00/true', 'T-02 el precio fijado manda sobre el porcentaje');

-- 3-5. La venta cobra con la lista del cliente
SELECT public.process_sale(:'comp_a', 'bbbb0040-0000-0000-0000-000000000001', format('[{"product_id": "%s", "quantity": 2}]', :'p')::JSONB,
  0, '[{"method": "efectivo", "amount": 1700}]'::JSONB, NULL, :'c_list') ->> 'sale_id' AS s1 \gset
SELECT is((SELECT unit_price FROM public.sale_items WHERE sale_id = :'s1'), 850.00::NUMERIC, 'T-03 al cliente con lista se le cobra el precio de la lista');
SELECT is((SELECT price_list_id || '/' || total_amount FROM public.sales WHERE id = :'s1'), :'list_a' || '/1700.00', 'T-04 la venta guarda la lista y el total con lista');
SELECT public.process_sale(:'comp_a', 'bbbb0040-0000-0000-0000-000000000002', format('[{"product_id": "%s", "quantity": 1}]', :'p')::JSONB,
  0, '[{"method": "efectivo", "amount": 1000}]'::JSONB, NULL, :'c_plain') ->> 'sale_id' AS s2 \gset
SELECT is((SELECT unit_price FROM public.sale_items WHERE sale_id = :'s2'), 1000.00::NUMERIC, 'T-05 un cliente sin lista paga el precio normal');

-- 6. El admin puede cobrar a precio normal a un cliente con lista
SELECT public.process_sale(:'comp_a', 'bbbb0040-0000-0000-0000-000000000003', format('[{"product_id": "%s", "quantity": 1}]', :'p')::JSONB,
  0, '[{"method": "efectivo", "amount": 1000}]'::JSONB, NULL, :'c_list', NULL, true) ->> 'sale_id' AS s3 \gset
SELECT is((SELECT unit_price FROM public.sale_items WHERE sale_id = :'s3'), 1000.00::NUMERIC, 'T-06 el admin puede cambiar la lista (a ninguna) en una venta');

-- 7-8. Empleado: cobra con la lista del cliente y no puede cambiarla
SET LOCAL "request.jwt.claim.sub" = 'aaaa0040-0000-0000-0000-000000000002';
SELECT public.process_sale(:'comp_a', 'bbbb0040-0000-0000-0000-000000000004', format('[{"product_id": "%s", "quantity": 1}]', :'q')::JSONB,
  0, '[{"method": "efectivo", "amount": 250}]'::JSONB, NULL, :'c_list') ->> 'sale_id' AS s4 \gset
SELECT is((SELECT unit_price FROM public.sale_items WHERE sale_id = :'s4'), 250.00::NUMERIC, 'T-07 el empleado cobra con la lista del cliente');
SELECT throws_like(format($q$SELECT public.process_sale(%L, 'bbbb0040-0000-0000-0000-000000000005', '[{"product_id": "%s", "quantity": 1}]'::JSONB, 0, '[]'::JSONB, NULL, %L, NULL, true)$q$, :'comp_a', :'p', :'c_list'),
  '%Solo el Master Admin%', 'T-08 el empleado no puede cambiar la lista de la venta');
SELECT throws_like(format($q$SELECT public.save_price_list(%L, NULL, 'Otra', 5, 1, true)$q$, :'comp_a'), '%permiso%', 'T-09 sin permiso de precios no crea listas');

-- 10-12. Admin: nombre único, quitar excepción, lista desactivada
SET LOCAL "request.jwt.claim.sub" = 'aaaa0040-0000-0000-0000-000000000001';
SELECT throws_like(format($q$SELECT public.save_price_list(%L, NULL, 'mayorista', 5, 1, true)$q$, :'comp_a'), '%Ya existe%', 'T-10 no se repiten nombres de lista');
SELECT public.set_price_list_item(:'comp_a', :'list_a', :'q', NULL);
SELECT is((SELECT price FROM public.price_list_prices(:'comp_a', :'list_a') WHERE product_id = :'q'), 280.00::NUMERIC, 'T-11 sin excepción vuelve al porcentaje (333,33 -15 % a $10 = 280)');
SELECT public.save_price_list(:'comp_a', :'list_a', 'Mayorista', -15, 10, false);
SELECT public.process_sale(:'comp_a', 'bbbb0040-0000-0000-0000-000000000006', format('[{"product_id": "%s", "quantity": 1}]', :'p')::JSONB,
  0, '[{"method": "efectivo", "amount": 1000}]'::JSONB, NULL, :'c_list') ->> 'sale_id' AS s6 \gset
SELECT is((SELECT unit_price FROM public.sale_items WHERE sale_id = :'s6'), 1000.00::NUMERIC, 'T-12 si la lista se desactiva, el cliente paga el precio normal');

-- 13-14. Aislamiento entre empresas
SELECT throws_like(format($q$SELECT public.set_customer_price_list(%L, %L, %L)$q$, :'comp_a', :'c_plain', :'list_b'), '%Lista no encontrada%', 'T-13 no se asigna una lista de otra empresa');
SET LOCAL "request.jwt.claim.sub" = 'aaaa0040-0000-0000-0000-000000000003';
SELECT is((SELECT count(*) FROM public.price_lists WHERE company_id = :'comp_a'), 0::BIGINT, 'T-14 otra empresa no ve las listas ajenas');

SELECT * FROM finish();
ROLLBACK;
