-- ============================================================================
-- SUITE DE PRUEBAS (pgTAP) - DEPÓSITOS
-- Módulo: warehouses, product_stock, depósito de la PC (cabecera), stock negativo por depósito,
--         transferencias, conteo por depósito, anulaciones al depósito de origen, permisos
-- Estado: SUITE AISLADA E INDEPENDIENTE (Transacción con ROLLBACK)
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(20);

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
  ('aaaa0043-0000-0000-0000-000000000001', 'admin_wh_a@stockly.local'),
  ('aaaa0043-0000-0000-0000-000000000002', 'empleado_wh_a@stockly.local'),
  ('aaaa0043-0000-0000-0000-000000000003', 'admin_wh_b@stockly.local');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0043-0000-0000-0000-000000000001';
SELECT public.create_company('Empresa Depósitos Alpha', NULL) AS comp_a \gset
SELECT public.invite_user_to_company(:'comp_a', 'empleado_wh_a@stockly.local', 'employee') AS tok_emp \gset
SET LOCAL "request.jwt.claim.sub" = 'aaaa0043-0000-0000-0000-000000000002';
SELECT public.accept_company_invitation(:'tok_emp');
SET LOCAL "request.jwt.claim.sub" = 'aaaa0043-0000-0000-0000-000000000003';
SELECT public.create_company('Empresa Depósitos Beta', NULL) AS comp_b \gset
RESET ROLE;

INSERT INTO public.products (company_id, sku, name, unit, selling_price, current_stock) VALUES
  (:'comp_a', 'P', 'Taladro', 'unidad', 1000.00, 10),
  (:'comp_a', 'Q', 'Yogur', 'unidad', 100.00, 5);
SELECT id AS p FROM public.products WHERE company_id = :'comp_a' AND sku = 'P' \gset
SELECT id AS q FROM public.products WHERE company_id = :'comp_a' AND sku = 'Q' \gset
UPDATE public.companies SET allow_negative_stock = false WHERE id = :'comp_a';
INSERT INTO public.suppliers (company_id, name) VALUES (:'comp_a', 'Proveedor');
SELECT id AS sup FROM public.suppliers WHERE company_id = :'comp_a' \gset
SELECT id AS principal FROM public.warehouses WHERE company_id = :'comp_a' AND is_default \gset
SELECT id AS wh_b FROM public.warehouses WHERE company_id = :'comp_b' \gset

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0043-0000-0000-0000-000000000001';
SELECT public.save_warehouse(:'comp_a', NULL, 'Salón', true) AS salon \gset
SELECT public.set_product_tracks_expiry(:'comp_a', :'q', true);

-- 1-2. Principal automático y stock inicial ahí
SELECT is((SELECT name FROM public.warehouses WHERE id = :'principal'), 'Principal', 'T-01 cada empresa nace con el depósito Principal');
SELECT is((SELECT COALESCE(sum(quantity), 0)::NUMERIC(12, 2) FROM public.product_stock WHERE product_id = :'p' AND warehouse_id = :'principal'), 10.00::NUMERIC, 'T-02 el stock existente queda en el Principal');

-- 3. Vender desde un depósito sin stock: no (la empresa no permite stock negativo)
SELECT set_config('request.headers', format('{"x-stockly-warehouse": "%s"}', :'salon'), true);
SELECT throws_like(format($q$SELECT public.process_sale(%L, 'bbbb0043-0000-0000-0000-000000000001', '[{"product_id": "%s", "quantity": 1}]'::JSONB, 0, '[{"method": "efectivo", "amount": 1000}]'::JSONB)$q$, :'comp_a', :'p'),
  '%Stock insuficiente de "Taladro" en el depósito Salón%', 'T-03 el stock negativo se controla por depósito');

-- 4. Transferencia: cada depósito cambia, el total no
SELECT public.create_stock_transfer(:'comp_a', 'cccc0043-0000-0000-0000-000000000001', :'principal', :'salon',
  format('[{"product_id": "%s", "quantity": 4}, {"product_id": "%s", "quantity": 2}]', :'p', :'q')::JSONB, 'Reposición del salón') AS trf \gset
SELECT is((SELECT COALESCE(sum(quantity), 0)::NUMERIC(12, 2) FROM public.product_stock WHERE product_id = :'p' AND warehouse_id = :'principal') || '/' || (SELECT COALESCE(sum(quantity), 0)::NUMERIC(12, 2) FROM public.product_stock WHERE product_id = :'p' AND warehouse_id = :'salon') || '/' ||
  (SELECT current_stock FROM public.products WHERE id = :'p'), '6.00/4.00/10.00', 'T-04 la transferencia mueve entre depósitos sin cambiar el total');

-- 5. Idempotencia de la transferencia
SELECT is((public.create_stock_transfer(:'comp_a', 'cccc0043-0000-0000-0000-000000000001', :'principal', :'salon',
  format('[{"product_id": "%s", "quantity": 4}, {"product_id": "%s", "quantity": 2}]', :'p', :'q')::JSONB) ->> 'already_registered'), 'true',
  'T-05 repetir la transferencia con la misma clave no la duplica');

-- 6. Los lotes no se mueven con transferencias
SELECT is((SELECT sum(remaining_quantity) FROM public.stock_lots WHERE product_id = :'q'), 5.00::NUMERIC, 'T-06 la transferencia no cambia los lotes');

-- 7. Venta desde el depósito de la PC
SELECT public.process_sale(:'comp_a', 'bbbb0043-0000-0000-0000-000000000002', format('[{"product_id": "%s", "quantity": 1}]', :'p')::JSONB,
  0, '[{"method": "efectivo", "amount": 1000}]'::JSONB) ->> 'sale_id' AS s1 \gset
SELECT is((SELECT warehouse_id FROM public.stock_movements WHERE reference_sale_id = :'s1'), :'salon'::UUID, 'T-07 la venta sale del depósito elegido en la PC');

-- 8. Anular desde otra PC (sin depósito elegido): vuelve al depósito de la venta
SELECT set_config('request.headers', '{}', true);
SELECT public.cancel_sale(:'comp_a', :'s1', 'Error de cobro');
SELECT is((SELECT COALESCE(sum(quantity), 0)::NUMERIC(12, 2) FROM public.product_stock WHERE product_id = :'p' AND warehouse_id = :'salon'), 4.00::NUMERIC, 'T-08 la anulación devuelve al depósito de donde salió la venta');

-- 9. Sin depósito elegido: el principal
SELECT public.process_sale(:'comp_a', 'bbbb0043-0000-0000-0000-000000000003', format('[{"product_id": "%s", "quantity": 1}]', :'p')::JSONB,
  0, '[{"method": "efectivo", "amount": 1000}]'::JSONB);
SELECT is((SELECT COALESCE(sum(quantity), 0)::NUMERIC(12, 2) FROM public.product_stock WHERE product_id = :'p' AND warehouse_id = :'principal'), 5.00::NUMERIC, 'T-09 sin depósito elegido, el movimiento va al Principal');

-- 10. Conteo físico del depósito de la PC
SELECT set_config('request.headers', format('{"x-stockly-warehouse": "%s"}', :'salon'), true);
SELECT public.register_physical_count(:'comp_a', 'eeee0043-0000-0000-0000-000000000001', :'p', 2);
SELECT is((SELECT COALESCE(sum(quantity), 0)::NUMERIC(12, 2) FROM public.product_stock WHERE product_id = :'p' AND warehouse_id = :'salon') || '/' || (SELECT COALESCE(sum(quantity), 0)::NUMERIC(12, 2) FROM public.product_stock WHERE product_id = :'p' AND warehouse_id = :'principal') || '/' ||
  (SELECT current_stock FROM public.products WHERE id = :'p'), '2.00/5.00/7.00', 'T-10 el conteo ajusta solo el depósito contado');

-- 11. Compra al depósito de la PC y su anulación desde otra PC
SELECT public.process_purchase(:'comp_a', 'ffff0043-0000-0000-0000-000000000001', :'sup',
  format('[{"product_id": "%s", "quantity": 5, "unit_cost": 500}]', :'p')::JSONB) ->> 'purchase_id' AS pur \gset
SELECT set_config('request.headers', '{}', true);
SELECT public.cancel_purchase(:'comp_a', :'pur', 'Devuelta al proveedor');
SELECT is((SELECT COALESCE(sum(quantity), 0)::NUMERIC(12, 2) FROM public.product_stock WHERE product_id = :'p' AND warehouse_id = :'salon'), 2.00::NUMERIC, 'T-11 anular la compra descuenta del depósito al que entró');

-- 12. Suma por depósito = total
SELECT is((SELECT sum(quantity) FROM public.product_stock WHERE product_id = :'p'), (SELECT current_stock FROM public.products WHERE id = :'p'),
  'T-12 la suma de los depósitos es el stock total');

-- 13. Depósito de otra empresa en la cabecera: rechazado
SELECT set_config('request.headers', format('{"x-stockly-warehouse": "%s"}', :'wh_b'), true);
SELECT throws_like(format($q$SELECT public.process_sale(%L, 'bbbb0043-0000-0000-0000-000000000004', '[{"product_id": "%s", "quantity": 1}]'::JSONB, 0, '[{"method": "efectivo", "amount": 1000}]'::JSONB)$q$, :'comp_a', :'p'),
  '%no existe o está desactivado%', 'T-13 no se usa un depósito de otra empresa');
SELECT set_config('request.headers', '{}', true);

-- 14. Transferir más de lo que hay: no
SELECT throws_like(format($q$SELECT public.create_stock_transfer(%L, 'cccc0043-0000-0000-0000-000000000002', %L, %L, '[{"product_id": "%s", "quantity": 50}]'::JSONB)$q$, :'comp_a', :'salon', :'principal', :'p'),
  '%Stock insuficiente%', 'T-14 no se transfiere más de lo que hay en el depósito');

-- 15-17. Administración de depósitos
SELECT throws_like(format($q$SELECT public.save_warehouse(%L, %L, 'Salón', false)$q$, :'comp_a', :'salon'), '%todavía tiene stock%', 'T-15 no se desactiva un depósito con stock');
SELECT throws_like(format($q$SELECT public.save_warehouse(%L, %L, 'Principal', false)$q$, :'comp_a', :'principal'), '%principal%', 'T-16 no se desactiva el principal');
SELECT throws_like(format($q$SELECT public.save_warehouse(%L, NULL, 'salón', true)$q$, :'comp_a'), '%Ya existe%', 'T-17 no se repiten nombres de depósito');

-- 18-19. Empleado sin permisos
SET LOCAL "request.jwt.claim.sub" = 'aaaa0043-0000-0000-0000-000000000002';
SELECT throws_like(format($q$SELECT public.save_warehouse(%L, NULL, 'Otro', true)$q$, :'comp_a'), '%Solo el Master Admin%', 'T-18 solo el admin administra depósitos');
SELECT throws_like(format($q$SELECT public.create_stock_transfer(%L, 'cccc0043-0000-0000-0000-000000000003', %L, %L, '[{"product_id": "%s", "quantity": 1}]'::JSONB)$q$, :'comp_a', :'principal', :'salon', :'p'),
  '%permiso%', 'T-19 sin permiso de productos no transfiere');

-- 20. Aislamiento
SET LOCAL "request.jwt.claim.sub" = 'aaaa0043-0000-0000-0000-000000000003';
SELECT is((SELECT count(*) FROM public.warehouses WHERE company_id = :'comp_a'), 0::BIGINT, 'T-20 otra empresa no ve los depósitos ajenos');

SELECT * FROM finish();
ROLLBACK;
