-- ============================================================================
-- SUITE DE PRUEBAS (pgTAP) - VENCIMIENTOS POR LOTE
-- Módulo: stock_lots, trigger allocate_stock_lots, compras con fecha, ventas por vencimiento,
--         devoluciones, anulaciones, conteos, separar y dar de baja, permisos y aislamiento
-- Estado: SUITE AISLADA E INDEPENDIENTE (Transacción con ROLLBACK)
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(25);

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
  ('aaaa0041-0000-0000-0000-000000000001', 'admin_lot_a@stockly.local'),
  ('aaaa0041-0000-0000-0000-000000000002', 'empleado_lot_a@stockly.local'),
  ('aaaa0041-0000-0000-0000-000000000003', 'admin_lot_b@stockly.local');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0041-0000-0000-0000-000000000001';
SELECT public.create_company('Empresa Lotes Alpha', NULL) AS comp_a \gset
SELECT public.invite_user_to_company(:'comp_a', 'empleado_lot_a@stockly.local', 'employee') AS tok_emp \gset
SET LOCAL "request.jwt.claim.sub" = 'aaaa0041-0000-0000-0000-000000000002';
SELECT public.accept_company_invitation(:'tok_emp');
SET LOCAL "request.jwt.claim.sub" = 'aaaa0041-0000-0000-0000-000000000003';
SELECT public.create_company('Empresa Lotes Beta', NULL) AS comp_b \gset
RESET ROLE;

INSERT INTO public.products (company_id, sku, name, unit, selling_price, current_stock) VALUES
  (:'comp_a', 'YOG', 'Yogur', 'unidad', 100.00, 0),
  (:'comp_a', 'MAR', 'Martillo', 'unidad', 500.00, 20),
  (:'comp_a', 'LEC', 'Leche', 'unidad', 80.00, 50);
SELECT id AS yog FROM public.products WHERE company_id = :'comp_a' AND sku = 'YOG' \gset
SELECT id AS mar FROM public.products WHERE company_id = :'comp_a' AND sku = 'MAR' \gset
SELECT id AS lec FROM public.products WHERE company_id = :'comp_a' AND sku = 'LEC' \gset
INSERT INTO public.suppliers (company_id, name) VALUES (:'comp_a', 'Láctea SA');
SELECT id AS sup FROM public.suppliers WHERE company_id = :'comp_a' \gset

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0041-0000-0000-0000-000000000001';
SELECT public.open_cash_session(:'comp_a', 1000, NULL);
SELECT public.set_product_tracks_expiry(:'comp_a', :'yog', true);

-- 1-3. Compras: crean un lote por línea con fecha; sin fecha no se acepta
SELECT public.process_purchase(:'comp_a', 'cccc0041-0000-0000-0000-000000000001', :'sup',
  format('[{"product_id": "%s", "quantity": 10, "unit_cost": 50, "expires_on": "2030-03-01", "lot_code": " A1 "}]', :'yog')::JSONB) ->> 'purchase_id' AS pur_a \gset
SELECT public.process_purchase(:'comp_a', 'cccc0041-0000-0000-0000-000000000002', :'sup',
  format('[{"product_id": "%s", "quantity": 5, "unit_cost": 50, "expires_on": "2030-01-01", "lot_code": "B1"}]', :'yog')::JSONB) ->> 'purchase_id' AS pur_b \gset
SELECT id AS lot_a FROM public.stock_lots WHERE purchase_id = :'pur_a' \gset
SELECT id AS lot_b FROM public.stock_lots WHERE purchase_id = :'pur_b' \gset
SELECT is((SELECT lot_code || '/' || expires_on || '/' || remaining_quantity FROM public.stock_lots WHERE id = :'lot_a'),
  'A1/2030-03-01/10.00', 'T-01 la compra crea el lote con número, fecha y cantidad');
SELECT is((SELECT expires_on::TEXT FROM public.purchase_items WHERE purchase_id = :'pur_b'), '2030-01-01', 'T-02 la línea de compra guarda el vencimiento');
SELECT throws_like(format($q$SELECT public.process_purchase(%L, 'cccc0041-0000-0000-0000-000000000003', %L, '[{"product_id": "%s", "quantity": 1, "unit_cost": 50}]'::JSONB)$q$, :'comp_a', :'sup', :'yog'),
  '%fecha de vencimiento de "Yogur"%', 'T-03 un producto con vencimiento exige fecha en la compra');

-- 4-5. Venta: sale primero del lote que vence antes y sigue con el siguiente
SELECT public.process_sale(:'comp_a', 'bbbb0041-0000-0000-0000-000000000001', format('[{"product_id": "%s", "quantity": 7}]', :'yog')::JSONB,
  0, '[{"method": "efectivo", "amount": 700}]'::JSONB) ->> 'sale_id' AS s1 \gset
SELECT is((SELECT remaining_quantity FROM public.stock_lots WHERE id = :'lot_b') || '/' || (SELECT remaining_quantity FROM public.stock_lots WHERE id = :'lot_a'),
  '0.00/8.00', 'T-04 la venta de 7 toma 5 del lote que vence primero y 2 del siguiente');
SELECT is((SELECT count(*) FROM public.stock_lot_allocations a JOIN public.stock_movements m ON m.id = a.movement_id WHERE m.reference_sale_id = :'s1'),
  2::BIGINT, 'T-05 queda registrado de qué lotes salió la venta');

-- 6. Devolución: vuelve a los lotes de los que salió
SELECT public.process_sale_return(:'comp_a', :'s1',
  format('[{"sale_item_id": "%s", "quantity": 3}]', (SELECT id FROM public.sale_items WHERE sale_id = :'s1'))::JSONB,
  'Cliente arrepentido', 'dddd0041-0000-0000-0000-000000000001');
SELECT is((SELECT remaining_quantity FROM public.stock_lots WHERE id = :'lot_b') || '/' || (SELECT remaining_quantity FROM public.stock_lots WHERE id = :'lot_a'),
  '3.00/8.00', 'T-06 la devolución vuelve al lote del que salió');

-- 7. Anular una venta: las unidades vuelven a los mismos lotes
SELECT public.process_sale(:'comp_a', 'bbbb0041-0000-0000-0000-000000000002', format('[{"product_id": "%s", "quantity": 4}]', :'yog')::JSONB,
  0, '[{"method": "efectivo", "amount": 400}]'::JSONB) ->> 'sale_id' AS s2 \gset
SELECT public.cancel_sale(:'comp_a', :'s2', 'Error de carga');
SELECT is((SELECT remaining_quantity FROM public.stock_lots WHERE id = :'lot_b') || '/' || (SELECT remaining_quantity FROM public.stock_lots WHERE id = :'lot_a'),
  '3.00/8.00', 'T-07 anular la venta devuelve las unidades a los mismos lotes');

-- 8-9. Conteo físico: hacia abajo descuenta por vencimiento; hacia arriba va a "sin fecha"
SELECT public.register_physical_count(:'comp_a', 'eeee0041-0000-0000-0000-000000000001', :'yog', 9);
SELECT is((SELECT remaining_quantity FROM public.stock_lots WHERE id = :'lot_b'), 1.00::NUMERIC, 'T-08 el conteo hacia abajo descuenta del lote que vence primero');
SELECT public.register_physical_count(:'comp_a', 'eeee0041-0000-0000-0000-000000000002', :'yog', 12);
SELECT id AS lot_u FROM public.stock_lots WHERE product_id = :'yog' AND expires_on IS NULL \gset
SELECT is((SELECT remaining_quantity FROM public.stock_lots WHERE id = :'lot_u'), 3.00::NUMERIC, 'T-09 el conteo hacia arriba va al lote "sin fecha"');

-- 10. Invariante: lo que queda en los lotes es el stock
SELECT is((SELECT sum(remaining_quantity) FROM public.stock_lots WHERE product_id = :'yog'),
  (SELECT current_stock FROM public.products WHERE id = :'yog'), 'T-10 la suma de los lotes coincide con el stock');

-- 11. Anular una compra: descuenta primero del lote que creó esa compra
SELECT public.cancel_purchase(:'comp_a', :'pur_a', 'Mercadería devuelta al proveedor');
SELECT is((SELECT remaining_quantity FROM public.stock_lots WHERE id = :'lot_a') || '/' || (SELECT remaining_quantity FROM public.stock_lots WHERE id = :'lot_b') || '/' || (SELECT remaining_quantity FROM public.stock_lots WHERE id = :'lot_u'),
  '0.00/0.00/2.00', 'T-11 anular la compra vacía su lote y el faltante sale por vencimiento');

-- 12-13. Separar unidades del lote "sin fecha" en un lote con fecha (sin mover stock)
SELECT public.split_stock_lot(:'comp_a', :'lot_u', 1, 'V-OLD', '2020-01-01') AS lot_old \gset
SELECT is((SELECT remaining_quantity FROM public.stock_lots WHERE id = :'lot_u') || '/' || (SELECT remaining_quantity FROM public.stock_lots WHERE id = :'lot_old'),
  '1.00/1.00', 'T-12 separar reparte las unidades entre los dos lotes');
SELECT throws_like(format($q$SELECT public.split_stock_lot(%L, %L, 5, NULL, '2030-01-01')$q$, :'comp_a', :'lot_u'), '%no se pueden separar%', 'T-13 no se separan más unidades de las que hay');

-- 14. La lista marca días negativos para un lote vencido y nulos para "sin fecha"
SELECT is((SELECT (days_left < 0)::TEXT FROM public.stock_lots_list(:'comp_a') WHERE lot_id = :'lot_old') || '/' ||
          COALESCE((SELECT days_left::TEXT FROM public.stock_lots_list(:'comp_a') WHERE lot_id = :'lot_u'), 'null'),
  'true/null', 'T-14 la lista indica los vencidos y los "sin fecha"');

-- 15-17. Dar de baja un lote: pérdida por lo que queda, de ese lote; el reintento no repite
SELECT public.write_off_stock_lot(:'comp_a', 'ffff0041-0000-0000-0000-000000000001', :'lot_old');
SELECT is((SELECT remaining_quantity FROM public.stock_lots WHERE id = :'lot_old') || '/' || (SELECT remaining_quantity FROM public.stock_lots WHERE id = :'lot_u') || '/' || (SELECT current_stock FROM public.products WHERE id = :'yog'),
  '0.00/1.00/1.00', 'T-15 la baja sale del lote elegido, no del "sin fecha"');
SELECT is((SELECT m.reason FROM public.stock_lot_allocations a JOIN public.stock_movements m ON m.id = a.movement_id WHERE a.lot_id = :'lot_old' AND a.direction = 'out'), 'loss_damage', 'T-16 la baja queda como pérdida en el Historial');
SELECT lives_ok(format($q$SELECT public.write_off_stock_lot(%L, 'ffff0041-0000-0000-0000-000000000001', %L)$q$, :'comp_a', :'lot_old'), 'T-17 repetir la baja con la misma clave no falla ni descuenta de nuevo');

-- 18. Editar fecha y número
SELECT public.update_stock_lot(:'comp_a', :'lot_u', 'C9', '2031-05-05');
SELECT is((SELECT lot_code || '/' || expires_on FROM public.stock_lots WHERE id = :'lot_u'), 'C9/2031-05-05', 'T-18 se puede cargar fecha y número a un lote');

-- 19. Producto sin vencimiento: no crea lotes
SELECT public.process_sale(:'comp_a', 'bbbb0041-0000-0000-0000-000000000003', format('[{"product_id": "%s", "quantity": 1}]', :'mar')::JSONB,
  0, '[{"method": "efectivo", "amount": 500}]'::JSONB);
SELECT is((SELECT count(*) FROM public.stock_lots WHERE product_id = :'mar'), 0::BIGINT, 'T-19 un producto sin vencimiento no tiene lotes');

-- 20. Activar en un producto con stock: todo va a "sin fecha"
SELECT public.set_product_tracks_expiry(:'comp_a', :'lec', true);
SELECT is((SELECT remaining_quantity::TEXT || '/' || (expires_on IS NULL) FROM public.stock_lots WHERE product_id = :'lec'), '50.00/true', 'T-20 al activar, el stock actual queda en "sin fecha"');

-- 21-22. Permisos del empleado
SET LOCAL "request.jwt.claim.sub" = 'aaaa0041-0000-0000-0000-000000000002';
SELECT throws_like(format($q$SELECT public.set_product_tracks_expiry(%L, %L, false)$q$, :'comp_a', :'lec'), '%permiso%', 'T-21 sin permiso de productos no cambia el control de vencimiento');
SELECT throws_like(format($q$SELECT public.set_expiry_warning_days(%L, 10)$q$, :'comp_a'), '%Solo el Master Admin%', 'T-22 solo el admin cambia los días de aviso');

SELECT ok((SELECT count(*) FROM public.stock_lots_list(:'comp_a')) > 0, 'T-25 el empleado ve los lotes (aviso de vencidos en el carrito)');

-- 23-24. Aislamiento entre empresas
SET LOCAL "request.jwt.claim.sub" = 'aaaa0041-0000-0000-0000-000000000003';
SELECT is((SELECT count(*) FROM public.stock_lots WHERE company_id = :'comp_a'), 0::BIGINT, 'T-23 otra empresa no ve los lotes ajenos');
SELECT throws_like(format($q$SELECT public.write_off_stock_lot(%L, 'ffff0041-0000-0000-0000-000000000009', %L)$q$, :'comp_a', :'lot_u'), '%miembro activo%', 'T-24 otra empresa no da de baja lotes ajenos');

SELECT * FROM finish();
ROLLBACK;
