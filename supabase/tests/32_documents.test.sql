-- ============================================================================
-- SUITE DE PRUEBAS (pgTAP) - DOCUMENTOS
-- Módulo: tickets, presupuestos, remitos X y garantías (numeración, permisos, inmutabilidad)
-- Estado: SUITE AISLADA E INDEPENDIENTE (Transacción con ROLLBACK)
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(36);

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
  ('aaaa0032-0000-0000-0000-000000000001', 'admin_doc_a@stockly.local'),
  ('aaaa0032-0000-0000-0000-000000000002', 'empleado_doc_a@stockly.local'),
  ('aaaa0032-0000-0000-0000-000000000003', 'admin_doc_b@stockly.local');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0032-0000-0000-0000-000000000001';
SELECT public.create_company('Empresa DOC Alpha', NULL) AS comp_a \gset
SELECT public.invite_user_to_company(:'comp_a', 'empleado_doc_a@stockly.local', 'employee') AS tok_emp \gset
SET LOCAL "request.jwt.claim.sub" = 'aaaa0032-0000-0000-0000-000000000002';
SELECT public.accept_company_invitation(:'tok_emp');
SET LOCAL "request.jwt.claim.sub" = 'aaaa0032-0000-0000-0000-000000000003';
SELECT public.create_company('Empresa DOC Beta', NULL) AS comp_b \gset
RESET ROLE;

INSERT INTO public.products (company_id, sku, name, unit, selling_price, current_stock)
VALUES (:'comp_a', 'NEU-1', 'Neumático 205/55 R16', 'unidad', 90000, 10);
INSERT INTO public.products (company_id, sku, name, unit, selling_price, current_stock)
VALUES (:'comp_b', 'OTRO-1', 'Producto de otra empresa', 'unidad', 10, 1);
INSERT INTO public.customers (company_id, name, identification_type, tax_id, phone, address, is_active)
VALUES (:'comp_a', 'Transportes del Sur S.R.L.', 'CUIT', '20-30405060-9', '11 4444-5555', 'Av. Mitre 1234', true);
SELECT id AS prod_a FROM public.products WHERE company_id = :'comp_a' \gset
SELECT id AS prod_b FROM public.products WHERE company_id = :'comp_b' \gset
SELECT id AS cust_a FROM public.customers WHERE company_id = :'comp_a' \gset
SELECT count(*) AS stock_before FROM public.stock_movements WHERE company_id = :'comp_a' \gset

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0032-0000-0000-0000-000000000001';

-- 1-4. Ticket: numeración correlativa, total calculado y consumidor final por defecto
SELECT is((public.create_document(:'comp_a', 'dddd0032-0000-0000-0000-000000000001',
  '{"doc_type":"ticket","items":[{"description":"Alineación","quantity":1,"unit_price":15000.50},{"description":"Válvula","quantity":4,"unit_price":1200}]}'::JSONB) ->> 'doc_number')::INT, 1, 'T-01 el primer ticket es el número 1');
SELECT is((SELECT total FROM public.documents WHERE company_id = :'comp_a' AND doc_type = 'ticket' AND doc_number = 1), 19800.50::NUMERIC, 'T-02 el total suma los ítems (15000,50 + 4 x 1200)');
SELECT is((SELECT customer_name FROM public.documents WHERE company_id = :'comp_a' AND doc_type = 'ticket' AND doc_number = 1), 'Consumidor final', 'T-03 un ticket sin cliente sale a nombre de Consumidor final');
SELECT is((public.create_document(:'comp_a', 'dddd0032-0000-0000-0000-000000000002',
  '{"doc_type":"ticket","items":[{"description":"Servicio","quantity":1,"unit_price":100}]}'::JSONB) ->> 'doc_number')::INT, 2, 'T-04 el segundo ticket es el número 2');

-- 5-6. Cada tipo lleva su propia numeración
SELECT is((public.create_document(:'comp_a', 'dddd0032-0000-0000-0000-000000000003',
  jsonb_build_object('doc_type','remito','customer_id',:'cust_a','show_prices',false,'items',jsonb_build_array(jsonb_build_object('product_id',:'prod_a','quantity',4,'unit_price',999))))) ->> 'doc_number', '1', 'T-05 el remito arranca en 1 aunque haya tickets');
SELECT is((SELECT customer_name || '|' || customer_tax_id || '|' || customer_address FROM public.documents WHERE company_id = :'comp_a' AND doc_type = 'remito'), 'Transportes del Sur S.R.L.|20-30405060-9|Av. Mitre 1234', 'T-06 los datos del cliente se copian al documento');

-- 7-8. Remito sin precios: ítem toma el nombre del producto y el precio queda en cero
SELECT is((SELECT description || '|' || unit_price || '|' || line_total FROM public.document_items WHERE company_id = :'comp_a' AND product_id = :'prod_a'), 'Neumático 205/55 R16|0.00|0.00', 'T-07 el remito sin precios guarda el nombre del producto y precios en cero');
SELECT is((SELECT total FROM public.documents WHERE company_id = :'comp_a' AND doc_type = 'remito'), 0.00::NUMERIC, 'T-08 un remito sin precios tiene total cero');

-- 9-10. Idempotencia
SELECT is((public.create_document(:'comp_a', 'dddd0032-0000-0000-0000-000000000002',
  '{"doc_type":"ticket","items":[{"description":"Servicio","quantity":1,"unit_price":100}]}'::JSONB) ->> 'doc_number')::INT, 2, 'T-09 reenviar el mismo pedido devuelve el mismo documento');
SELECT is((SELECT count(*) FROM public.documents WHERE company_id = :'comp_a' AND doc_type = 'ticket'), 2::BIGINT, 'T-10 y no crea un documento repetido');
SELECT throws_like(format($q$SELECT public.create_document(%L, 'dddd0032-0000-0000-0000-000000000002', '{"doc_type":"ticket","items":[{"description":"Otra cosa","quantity":1,"unit_price":5}]}'::JSONB)$q$, :'comp_a'), '%Idempotency key mismatch%', 'T-11 reutilizar la clave con otros datos se rechaza');

-- 12-17. Validaciones
SELECT throws_like(format($q$SELECT public.create_document(%L, 'dddd0032-0000-0000-0000-000000000010', '{"doc_type":"presupuesto","items":[{"description":"X","quantity":1,"unit_price":5}]}'::JSONB)$q$, :'comp_a'), '%nombre del cliente%', 'T-12 el presupuesto exige cliente');
SELECT throws_like(format($q$SELECT public.create_document(%L, 'dddd0032-0000-0000-0000-000000000011', '{"doc_type":"garantia","customer_name":"Juan","items":[{"description":"Batería","quantity":1}]}'::JSONB)$q$, :'comp_a'), '%plazo de la garantía%', 'T-13 la garantía exige el plazo');
SELECT throws_like(format($q$SELECT public.create_document(%L, 'dddd0032-0000-0000-0000-000000000012', '{"doc_type":"ticket","items":[{"description":"Sin precio","quantity":1,"unit_price":0}]}'::JSONB)$q$, :'comp_a'), '%indicá el precio%', 'T-14 un ticket no admite precio cero');
SELECT throws_like(format($q$SELECT public.create_document(%L, 'dddd0032-0000-0000-0000-000000000013', '{"doc_type":"ticket","items":[{"description":"X","quantity":0,"unit_price":5}]}'::JSONB)$q$, :'comp_a'), '%cantidad%', 'T-15 la cantidad debe ser mayor a cero');
SELECT throws_like(format($q$SELECT public.create_document(%L, 'dddd0032-0000-0000-0000-000000000014', '{"doc_type":"ticket","discount":500,"items":[{"description":"X","quantity":1,"unit_price":100}]}'::JSONB)$q$, :'comp_a'), '%descuento%', 'T-16 el descuento no supera el subtotal');
SELECT throws_like(format($q$SELECT public.create_document(%L, 'dddd0032-0000-0000-0000-000000000015', jsonb_build_object('doc_type','ticket','items',jsonb_build_array(jsonb_build_object('product_id',%L,'quantity',1,'unit_price',5))))$q$, :'comp_a', :'prod_b'), '%no pertenece a esta empresa%', 'T-17 no se usa un producto de otra empresa');

-- 18-19. Un error no deja números salteados
SELECT is((public.create_document(:'comp_a', 'dddd0032-0000-0000-0000-000000000004',
  '{"doc_type":"ticket","discount":10,"items":[{"description":"Cubierta","quantity":2,"unit_price":50.25}]}'::JSONB) ->> 'doc_number')::INT, 3, 'T-18 tras varios errores el siguiente ticket es el 3 (sin saltos)');
SELECT is((SELECT subtotal || '|' || discount || '|' || total FROM public.documents WHERE company_id = :'comp_a' AND doc_type = 'ticket' AND doc_number = 3), '100.50|10.00|90.50', 'T-19 subtotal, descuento y total quedan guardados');

-- 20. No toca stock
SELECT is((SELECT count(*) FROM public.stock_movements WHERE company_id = :'comp_a'), :'stock_before'::BIGINT, 'T-20 los documentos no generan movimientos de stock');

-- 21-23. Anulación
SELECT throws_like(format($q$SELECT public.void_document(%L, (SELECT id FROM public.documents WHERE company_id = %L AND doc_type = 'ticket' AND doc_number = 1), '  ')$q$, :'comp_a', :'comp_a'), '%motivo%', 'T-21 anular exige un motivo');
SELECT lives_ok(format($q$SELECT public.void_document(%L, (SELECT id FROM public.documents WHERE company_id = %L AND doc_type = 'ticket' AND doc_number = 1), 'Se cargó mal el precio')$q$, :'comp_a', :'comp_a'), 'T-22 el admin anula un documento con motivo');
SELECT throws_like(format($q$SELECT public.void_document(%L, (SELECT id FROM public.documents WHERE company_id = %L AND doc_type = 'ticket' AND doc_number = 1), 'Otra vez')$q$, :'comp_a', :'comp_a'), '%ya está anulado%', 'T-23 no se anula dos veces');

-- 24. Datos del emisor y punto de venta
SELECT lives_ok(format($q$SELECT public.save_document_settings(%L, 'Ruta 5 km 10', '11 5555-0000', 'info@empresa.com', 'monotributo', 3, 'Gracias por su compra')$q$, :'comp_a'), 'T-24 el admin guarda los datos del emisor');
SELECT is((public.create_document(:'comp_a', 'dddd0032-0000-0000-0000-000000000005',
  '{"doc_type":"ticket","items":[{"description":"Servicio","quantity":1,"unit_price":100}]}'::JSONB) ->> 'point_of_sale')::INT, 3, 'T-25 los documentos nuevos usan el punto de venta configurado');
SELECT is((SELECT doc_number FROM public.documents WHERE company_id = :'comp_a' AND doc_type = 'ticket' AND point_of_sale = 3), 1, 'T-26 cada punto de venta numera desde 1');

-- 27-29. Inmutabilidad (aun con acceso directo a la tabla)
RESET ROLE;
SELECT throws_like(format($q$UPDATE public.documents SET notes = 'cambio' WHERE company_id = %L AND doc_type = 'remito'$q$, :'comp_a'), '%no se pueden editar%', 'T-27 un documento no se edita');
SELECT throws_like(format($q$DELETE FROM public.documents WHERE company_id = %L$q$, :'comp_a'), '%no se pueden borrar%', 'T-28 un documento no se borra');
SELECT throws_like(format($q$UPDATE public.document_items SET quantity = 99 WHERE company_id = %L$q$, :'comp_a'), '%no se pueden modificar%', 'T-29 los ítems no se modifican');

-- 30-34. Permisos del empleado (por defecto sin acceso)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0032-0000-0000-0000-000000000002';
SELECT is((SELECT count(*) FROM public.documents WHERE company_id = :'comp_a'), 0::BIGINT, 'T-30 el empleado sin acceso no ve documentos');
SELECT throws_like(format($q$SELECT public.create_document(%L, 'dddd0032-0000-0000-0000-000000000020', '{"doc_type":"ticket","items":[{"description":"X","quantity":1,"unit_price":5}]}'::JSONB)$q$, :'comp_a'), '%No tenés permiso%', 'T-31 el empleado sin acceso no emite documentos');

SET LOCAL "request.jwt.claim.sub" = 'aaaa0032-0000-0000-0000-000000000001';
SELECT public.set_module_permissions(:'comp_a', '{"documentos":"view"}'::JSONB);
SET LOCAL "request.jwt.claim.sub" = 'aaaa0032-0000-0000-0000-000000000002';
SELECT is((SELECT count(*) FROM public.documents WHERE company_id = :'comp_a'), 5::BIGINT, 'T-32 con "solo ver" el empleado ve los documentos pero no emite');

SET LOCAL "request.jwt.claim.sub" = 'aaaa0032-0000-0000-0000-000000000001';
SELECT public.set_module_permissions(:'comp_a', '{"documentos":"operate"}'::JSONB);
SET LOCAL "request.jwt.claim.sub" = 'aaaa0032-0000-0000-0000-000000000002';
SELECT is((public.create_document(:'comp_a', 'dddd0032-0000-0000-0000-000000000021',
  '{"doc_type":"ticket","items":[{"description":"X","quantity":1,"unit_price":5}]}'::JSONB) ->> 'doc_number')::INT, 2, 'T-33 con "ver y operar" el empleado emite documentos');

-- 35-36. Los datos del emisor los lee todo el equipo (salen en el ticket de venta), pero solo el admin los edita
SET LOCAL "request.jwt.claim.sub" = 'aaaa0032-0000-0000-0000-000000000001';
SELECT public.set_module_permissions(:'comp_a', '{"documentos":"none"}'::JSONB);
SET LOCAL "request.jwt.claim.sub" = 'aaaa0032-0000-0000-0000-000000000002';
SELECT is((SELECT point_of_sale FROM public.document_settings WHERE company_id = :'comp_a'), 3, 'T-35 el empleado sin acceso a Documentos igual lee los datos del emisor');
SELECT throws_like(format($q$SELECT public.save_document_settings(%L, 'x', 'x', 'x@x.com', 'monotributo', 1, 'x')$q$, :'comp_a'), '%master_admin%', 'T-36 el empleado no los edita');

-- 34. Otra empresa no ve ni opera estos documentos
SET LOCAL "request.jwt.claim.sub" = 'aaaa0032-0000-0000-0000-000000000003';
SELECT is((SELECT count(*) FROM public.documents WHERE company_id = :'comp_a'), 0::BIGINT, 'T-34 el admin de otra empresa no ve estos documentos');

SELECT * FROM finish();
ROLLBACK;
