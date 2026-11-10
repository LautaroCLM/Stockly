-- ============================================================================
-- SUITE DE PRUEBAS (pgTAP) - IMPORTACIÓN DE INVENTARIO
-- Módulo: import_inventory (crear, actualizar y sumar stock)
-- Estado: SUITE AISLADA E INDEPENDIENTE (Transacción con ROLLBACK)
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(30);

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
  ('aaaa0031-0000-0000-0000-000000000001', 'admin_im_a@stockly.local'),
  ('aaaa0031-0000-0000-0000-000000000002', 'empleado_im_a@stockly.local'),
  ('aaaa0031-0000-0000-0000-000000000003', 'admin_im_b@stockly.local');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0031-0000-0000-0000-000000000001';
SELECT public.create_company('Empresa IM Alpha', NULL) AS comp_a \gset
SELECT public.invite_user_to_company(:'comp_a', 'empleado_im_a@stockly.local', 'employee') AS tok_emp \gset
SET LOCAL "request.jwt.claim.sub" = 'aaaa0031-0000-0000-0000-000000000002';
SELECT public.accept_company_invitation(:'tok_emp');
SET LOCAL "request.jwt.claim.sub" = 'aaaa0031-0000-0000-0000-000000000003';
SELECT public.create_company('Empresa IM Beta', NULL) AS comp_b \gset
RESET ROLE;

-- Inventario de partida: milanesa con 20 y papa frita con 2
INSERT INTO public.products (company_id, sku, name, unit, selling_price, current_stock)
VALUES (:'comp_a', 'MIL-1', 'Milanesa', 'unidad', 100, 20), (:'comp_a', 'PAP-1', 'Papa frita', 'unidad', 50, 2);
INSERT INTO public.categories (company_id, name, is_active) VALUES (:'comp_a', 'Comidas', true);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0031-0000-0000-0000-000000000001';

-- 1-3. El ejemplo del usuario: milanesa 20 + 4 = 24, papa frita 2, napolitana 7
SELECT is(public.import_inventory(:'comp_a', 'cccc0031-0000-0000-0000-000000000001', '[{"row":2,"sku":"MIL-1","name":"Milanesa","stock":4},{"row":3,"sku":"NAP-1","name":"Napolitana","stock":7}]'::JSONB, '{"match_by":"sku","on_existing":"update"}'::JSONB),
  '{"created": 1, "updated": 1, "skipped": 0, "stock_entries": 2, "categories_created": 0}'::JSONB, 'T-01 crea la napolitana, actualiza la milanesa y suma stock');
SELECT is((SELECT current_stock FROM public.products WHERE company_id = :'comp_a' AND sku = 'MIL-1'), 24.00::NUMERIC, 'T-02 el stock importado se suma al que ya había (20 + 4 = 24)');
SELECT is((SELECT current_stock FROM public.products WHERE company_id = :'comp_a' AND sku = 'PAP-1') || '|' || (SELECT current_stock FROM public.products WHERE company_id = :'comp_a' AND sku = 'NAP-1'), '2.00|7.00', 'T-03 lo que no viene en el archivo no cambia y el nuevo arranca con el stock importado');

-- 4. Queda registrado como movimiento de importación
SELECT is((SELECT count(*) FROM public.stock_movements WHERE company_id = :'comp_a' AND reason = 'import' AND direction = 'increase'), 2::BIGINT, 'T-04 cada entrada de stock queda en el historial con motivo "import"');

-- 5-6. Sin columna de stock no se mueven existencias; sin precio no se toca el precio
SELECT is((public.import_inventory(:'comp_a', 'cccc0031-0000-0000-0000-000000000002', '[{"row":2,"sku":"MIL-1"},{"row":3,"sku":"NAP-2","name":"Napolitana especial"}]'::JSONB, '{"match_by":"sku","on_existing":"update"}'::JSONB) ->> 'created')::INT, 1, 'T-05 se puede importar sin la columna de stock');
SELECT is((SELECT current_stock FROM public.products WHERE company_id = :'comp_a' AND sku = 'MIL-1') || '|' || (SELECT current_stock FROM public.products WHERE company_id = :'comp_a' AND sku = 'NAP-2') || '|' || (SELECT selling_price FROM public.products WHERE company_id = :'comp_a' AND sku = 'MIL-1'), '24.00|0.00|100.00', 'T-06 sin stock queda igual, el producto nuevo en 0 y el precio no cambia');

-- 7. Con precio, costo y mínimo: se actualizan
SELECT public.import_inventory(:'comp_a', 'cccc0031-0000-0000-0000-000000000003', '[{"row": 2, "sku": "MIL-1", "selling_price": 150.5}]'::JSONB, '{"match_by":"sku","on_existing":"update"}'::JSONB) IS NOT NULL AS dummy;
SELECT is((SELECT selling_price FROM public.products WHERE company_id = :'comp_a' AND sku = 'MIL-1'), 150.50::NUMERIC, 'T-07 el precio importado reemplaza al anterior') ;

-- 8-9. Existentes: omitir y rechazar
SELECT is((public.import_inventory(:'comp_a', 'cccc0031-0000-0000-0000-000000000004', '[{"row":2,"sku":"MIL-1","stock":100}]'::JSONB, '{"match_by":"sku","on_existing":"skip"}'::JSONB) ->> 'skipped')::INT, 1, 'T-08 con "omitir" el producto existente no se toca');
SELECT is((SELECT current_stock FROM public.products WHERE company_id = :'comp_a' AND sku = 'MIL-1'), 24.00::NUMERIC, 'T-09 y su stock sigue igual');
SELECT throws_like(format($q$SELECT public.import_inventory(%L, 'cccc0031-0000-0000-0000-000000000005', '[{"row":7,"sku":"MIL-1","stock":1}]'::JSONB, '{"match_by":"sku","on_existing":"error"}'::JSONB)$q$, :'comp_a'), '%Fila 7%ya existe%', 'T-10 con "error" se rechaza el producto repetido y dice la fila');

-- 11-12. Coincidencia por nombre
SELECT is((public.import_inventory(:'comp_a', 'cccc0031-0000-0000-0000-000000000006', '[{"row":2,"name":"milanesa","stock":6}]'::JSONB, '{"match_by":"name","on_existing":"update"}'::JSONB) ->> 'updated')::INT, 1, 'T-11 por nombre encuentra el producto sin importar mayúsculas');
SELECT is((SELECT current_stock FROM public.products WHERE company_id = :'comp_a' AND sku = 'MIL-1'), 30.00::NUMERIC, 'T-12 y le suma el stock (24 + 6 = 30)');

-- 13. Nombres repetidos en el inventario: no adivina
RESET ROLE;
INSERT INTO public.products (company_id, sku, name, unit, selling_price, current_stock) VALUES (:'comp_a', 'GAS-1', 'Gaseosa', 'unidad', 10, 0), (:'comp_a', 'GAS-2', 'gaseosa', 'unidad', 10, 0);
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0031-0000-0000-0000-000000000001';
SELECT throws_like(format($q$SELECT public.import_inventory(%L, 'cccc0031-0000-0000-0000-000000000007', '[{"row":2,"name":"Gaseosa","stock":1}]'::JSONB, '{"match_by":"name","on_existing":"update"}'::JSONB)$q$, :'comp_a'), '%2 productos llamados%usá el SKU%', 'T-13 con nombres repetidos pide usar el SKU');

-- 14-15. Validaciones del archivo
SELECT throws_like(format($q$SELECT public.import_inventory(%L, 'cccc0031-0000-0000-0000-000000000008', '[{"row":2,"sku":"X-1","name":"X"},{"row":3,"sku":"x-1","name":"Y"}]'::JSONB, '{"match_by":"sku","on_existing":"update"}'::JSONB)$q$, :'comp_a'), '%Fila 3%más de una vez%', 'T-14 detecta el mismo SKU dos veces en el archivo');
SELECT throws_like(format($q$SELECT public.import_inventory(%L, 'cccc0031-0000-0000-0000-000000000009', '[{"row":2,"name":"Sin sku"}]'::JSONB, '{"match_by":"sku","on_existing":"update"}'::JSONB)$q$, :'comp_a'), '%Fila 2%falta el SKU%', 'T-15 un producto sin SKU se rechaza');

-- 16. Todo o nada
SELECT throws_like(format($q$SELECT public.import_inventory(%L, 'cccc0031-0000-0000-0000-000000000010', '[{"row":2,"sku":"OK-1","name":"Bueno","stock":5},{"row":3,"sku":"BAD-1","name":"Malo","selling_price":-3}]'::JSONB, '{"match_by":"sku","on_existing":"update"}'::JSONB)$q$, :'comp_a'), '%Fila 3%precio%', 'T-16 una fila inválida cancela toda la importación');
SELECT is((SELECT count(*) FROM public.products WHERE company_id = :'comp_a' AND sku IN ('OK-1', 'BAD-1')), 0::BIGINT, 'T-17 y no se creó ninguna de las filas');

-- 18-20. Unidades
SELECT throws_like(format($q$SELECT public.import_inventory(%L, 'cccc0031-0000-0000-0000-000000000011', '[{"row":2,"sku":"U-1","name":"U","unit":"cajon"}]'::JSONB, '{"match_by":"sku","on_existing":"update"}'::JSONB)$q$, :'comp_a'), '%unidad inválida%', 'T-18 rechaza unidades desconocidas');
SELECT throws_like(format($q$SELECT public.import_inventory(%L, 'cccc0031-0000-0000-0000-000000000012', '[{"row":2,"sku":"U-2","name":"U2","unit":"unidad","stock":2.5}]'::JSONB, '{"match_by":"sku","on_existing":"update"}'::JSONB)$q$, :'comp_a'), '%no admite cantidades con decimales%', 'T-19 las unidades indivisibles no aceptan stock con decimales');
SELECT is((public.import_inventory(:'comp_a', 'cccc0031-0000-0000-0000-000000000013', '[{"row":2,"sku":"KG-1","name":"Harina","unit":"kg","stock":2.5}]'::JSONB, '{"match_by":"sku","on_existing":"update"}'::JSONB) ->> 'created')::INT, 1, 'T-20 el kilo sí acepta decimales');

-- 21-23. Categorías por nombre
SELECT is((public.import_inventory(:'comp_a', 'cccc0031-0000-0000-0000-000000000014', '[{"row":2,"sku":"CAT-1","name":"Con categoría","category":"comidas"}]'::JSONB, '{"match_by":"sku","on_existing":"update"}'::JSONB) ->> 'created')::INT, 1, 'T-21 asigna una categoría existente sin importar mayúsculas');
SELECT throws_like(format($q$SELECT public.import_inventory(%L, 'cccc0031-0000-0000-0000-000000000015', '[{"row":2,"sku":"CAT-2","name":"Otra","category":"Bebidas"}]'::JSONB, '{"match_by":"sku","on_existing":"update"}'::JSONB)$q$, :'comp_a'), '%Fila 2%categoría%Bebidas%no existe%', 'T-22 una categoría inexistente se rechaza si no se pidió crearla');
SELECT is((public.import_inventory(:'comp_a', 'cccc0031-0000-0000-0000-000000000016', '[{"row":2,"sku":"CAT-2","name":"Otra","category":"Bebidas"}]'::JSONB, '{"match_by":"sku","on_existing":"update","create_categories":true}'::JSONB) ->> 'categories_created')::INT, 1, 'T-23 crea las categorías nuevas si se pidió');

-- 24-25. Idempotencia
SELECT is((SELECT current_stock FROM public.products WHERE company_id = :'comp_a' AND sku = 'MIL-1'), 30.00::NUMERIC, 'T-24 (control) stock antes de repetir');
SELECT public.import_inventory(:'comp_a', 'cccc0031-0000-0000-0000-000000000020', '[{"row": 2, "sku": "MIL-1", "stock": 10}]'::JSONB, '{"match_by":"sku","on_existing":"update"}'::JSONB);
SELECT public.import_inventory(:'comp_a', 'cccc0031-0000-0000-0000-000000000020', '[{"row": 2, "sku": "MIL-1", "stock": 10}]'::JSONB, '{"match_by":"sku","on_existing":"update"}'::JSONB);
SELECT is((SELECT current_stock FROM public.products WHERE company_id = :'comp_a' AND sku = 'MIL-1'), 40.00::NUMERIC, 'T-25 reenviar la misma importación no suma dos veces');
SELECT throws_like(format($q$SELECT public.import_inventory(%L, 'cccc0031-0000-0000-0000-000000000020', '[{"row":2,"sku":"MIL-1","stock":99}]'::JSONB, '{"match_by":"sku","on_existing":"update"}'::JSONB)$q$, :'comp_a'), '%Idempotency key mismatch%', 'T-26 la misma clave con otro contenido se rechaza');

-- 27. Costo: el movimiento de stock usa el costo importado
SELECT public.import_inventory(:'comp_a', 'cccc0031-0000-0000-0000-000000000021', '[{"row": 2, "sku": "MIL-1", "cost_price": 40, "stock": 2}]'::JSONB, '{"match_by":"sku","on_existing":"update"}'::JSONB);
SELECT is((SELECT mc.unit_cost || '|' || mc.total_cost FROM public.movement_costs mc JOIN public.stock_movements sm ON sm.id = mc.movement_id AND sm.company_id = mc.company_id
  WHERE sm.company_id = :'comp_a' AND sm.reason = 'import' AND sm.quantity = 2), '40.00|80.00', 'T-27 la entrada de stock queda valuada al costo importado');

-- 28. Permisos
SET LOCAL "request.jwt.claim.sub" = 'aaaa0031-0000-0000-0000-000000000002';
SELECT throws_like(format($q$SELECT public.import_inventory(%L, 'cccc0031-0000-0000-0000-000000000022', '[{"row":2,"sku":"MIL-1","stock":1}]'::JSONB, '{"match_by":"sku","on_existing":"update"}'::JSONB)$q$, :'comp_a'), '%No tenés permiso%', 'T-28 un empleado sin permiso de productos no importa');

-- 29. Otra empresa
SET LOCAL "request.jwt.claim.sub" = 'aaaa0031-0000-0000-0000-000000000003';
SELECT throws_like(format($q$SELECT public.import_inventory(%L, 'cccc0031-0000-0000-0000-000000000023', '[{"row":2,"sku":"MIL-1","stock":1}]'::JSONB, '{"match_by":"sku","on_existing":"update"}'::JSONB)$q$, :'comp_a'), '%', 'T-29 el admin de otra empresa no importa en esta');

-- 30. Límite de filas
SET LOCAL "request.jwt.claim.sub" = 'aaaa0031-0000-0000-0000-000000000001';
SELECT throws_like(format($q$SELECT public.import_inventory(%L, 'cccc0031-0000-0000-0000-000000000024', (SELECT jsonb_agg(jsonb_build_object('sku', 'L-' || g, 'name', 'Lote ' || g)) FROM generate_series(1, 2001) g), '{"match_by":"sku","on_existing":"update"}'::JSONB)$q$, :'comp_a'), '%hasta 2000%', 'T-30 no acepta más de 2000 productos por vez');

SELECT * FROM finish();
ROLLBACK;
