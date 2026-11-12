-- ============================================================================
-- SUITE DE PRUEBAS (pgTAP) - CAMBIO DE PRECIOS MASIVO
-- Cálculo, redondeo, filtros, permisos, idempotencia, reversión e inmutabilidad
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
  ('aaaa0034-0000-0000-0000-000000000001', 'admin_pre_a@stockly.local'),
  ('aaaa0034-0000-0000-0000-000000000002', 'empleado_pre_a@stockly.local'),
  ('aaaa0034-0000-0000-0000-000000000003', 'admin_pre_b@stockly.local');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0034-0000-0000-0000-000000000001';
SELECT public.create_company('Empresa PRE Alpha', NULL) AS comp_a \gset
SELECT public.invite_user_to_company(:'comp_a', 'empleado_pre_a@stockly.local', 'employee') AS tok_emp \gset
SET LOCAL "request.jwt.claim.sub" = 'aaaa0034-0000-0000-0000-000000000002';
SELECT public.accept_company_invitation(:'tok_emp');
SET LOCAL "request.jwt.claim.sub" = 'aaaa0034-0000-0000-0000-000000000003';
SELECT public.create_company('Empresa PRE Beta', NULL) AS comp_b \gset
RESET ROLE;

INSERT INTO public.categories (company_id, name) VALUES (:'comp_a', 'Lubricantes'), (:'comp_a', 'Neumáticos');
SELECT id AS cat_lub FROM public.categories WHERE company_id = :'comp_a' AND name = 'Lubricantes' \gset
SELECT id AS cat_neu FROM public.categories WHERE company_id = :'comp_a' AND name = 'Neumáticos' \gset

INSERT INTO public.products (company_id, sku, name, unit, selling_price, category_id, current_stock) VALUES
  (:'comp_a', 'ACE-1', 'Aceite 10W40', 'unidad', 1000.00, :'cat_lub', 5),
  (:'comp_a', 'ACE-2', 'Aceite 5W30', 'unidad', 1234.56, :'cat_lub', 5),
  (:'comp_a', 'NEU-1', 'Neumático 205', 'unidad', 90000.00, :'cat_neu', 5),
  (:'comp_a', 'SIN-1', 'Producto sin precio', 'unidad', 0, :'cat_neu', 5),
  (:'comp_b', 'OTRO-1', 'Producto de otra empresa', 'unidad', 500.00, NULL, 5);
INSERT INTO public.products (company_id, sku, name, unit, selling_price, is_active) VALUES
  (:'comp_a', 'OFF-1', 'Producto inactivo', 'unidad', 800.00, false);
SELECT id AS p_ace1 FROM public.products WHERE company_id = :'comp_a' AND sku = 'ACE-1' \gset
SELECT id AS p_ace2 FROM public.products WHERE company_id = :'comp_a' AND sku = 'ACE-2' \gset
SELECT id AS p_neu1 FROM public.products WHERE company_id = :'comp_a' AND sku = 'NEU-1' \gset
SELECT id AS p_otro FROM public.products WHERE company_id = :'comp_b' \gset

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0034-0000-0000-0000-000000000001';

-- 1-4. Vista previa: cálculo, redondeo, filtro por categoría y exclusiones silenciosas
SELECT is(jsonb_array_length(public.preview_price_change(:'comp_a', 10, 0.01)), 3, 'T-01 la vista previa toma solo productos activos con precio');
SELECT is((SELECT (e ->> 'newPrice')::NUMERIC FROM jsonb_array_elements(public.preview_price_change(:'comp_a', 10, 0.01)) e WHERE e ->> 'sku' = 'ACE-2'), 1358.02::NUMERIC, 'T-02 +10 % sobre 1.234,56 da 1.358,02');
SELECT is((SELECT (e ->> 'newPrice')::NUMERIC FROM jsonb_array_elements(public.preview_price_change(:'comp_a', 10, 10)) e WHERE e ->> 'sku' = 'ACE-2'), 1360::NUMERIC, 'T-03 el redondeo a 10 lleva 1.358,02 a 1.360');
SELECT is(jsonb_array_length(public.preview_price_change(:'comp_a', 10, 1, ARRAY[:'cat_lub']::UUID[])), 2, 'T-04 filtrar por categoría deja solo los de esa categoría');

-- 5. La vista previa no modifica nada
SELECT is((SELECT selling_price FROM public.products WHERE id = :'p_ace1'), 1000.00::NUMERIC, 'T-05 la vista previa no cambia precios');

-- 6-9. Aplicar por categoría
SELECT is((public.apply_price_change(:'comp_a', 'eeee0034-0000-0000-0000-000000000001', 10, 1, ARRAY[:'cat_lub']::UUID[]) ->> 'updated')::INT, 2, 'T-06 aplicar actualiza los 2 productos de la categoría');
SELECT is((SELECT selling_price FROM public.products WHERE id = :'p_ace1'), 1100.00::NUMERIC, 'T-07 el precio se actualizó con el porcentaje');
SELECT is((SELECT selling_price FROM public.products WHERE id = :'p_neu1'), 90000.00::NUMERIC, 'T-08 los productos fuera del filtro no cambian');
SELECT is((SELECT count(*) FROM public.price_change_items WHERE batch_id = 'eeee0034-0000-0000-0000-000000000001'), 2::BIGINT, 'T-09 el lote guarda los precios anteriores');

-- 10-11. Idempotencia: el mismo lote no se aplica dos veces
SELECT is((public.apply_price_change(:'comp_a', 'eeee0034-0000-0000-0000-000000000001', 10, 1, ARRAY[:'cat_lub']::UUID[]) ->> 'duplicate')::BOOLEAN, true, 'T-10 reenviar el mismo lote se reconoce como repetido');
SELECT is((SELECT selling_price FROM public.products WHERE id = :'p_ace1'), 1100.00::NUMERIC, 'T-11 y no vuelve a aumentar el precio');

-- 12-13. Exclusiones del usuario y validaciones
SELECT is((public.apply_price_change(:'comp_a', 'eeee0034-0000-0000-0000-000000000002', -10, 1, NULL, NULL, ARRAY[:'p_ace2']::UUID[]) ->> 'updated')::INT, 2, 'T-12 un producto excluido no se modifica (baja de 10 %)');
SELECT is((SELECT selling_price FROM public.products WHERE id = :'p_ace2'), 1358.00::NUMERIC, 'T-13 el excluido conserva su precio del lote anterior');
SELECT throws_like(format($q$SELECT public.apply_price_change(%L, 'eeee0034-0000-0000-0000-000000000003', 0, 1)$q$, :'comp_a'), '%distinto de 0%', 'T-14 un porcentaje 0 se rechaza');
SELECT throws_like(format($q$SELECT public.apply_price_change(%L, 'eeee0034-0000-0000-0000-000000000004', -95, 1)$q$, :'comp_a'), '%entre -90 y 1000%', 'T-15 una baja mayor a 90 % se rechaza');

-- 16-18. Revertir: solo a quien conserva el precio del cambio
RESET ROLE;
UPDATE public.products SET selling_price = 7777.00 WHERE id = :'p_ace1';
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0034-0000-0000-0000-000000000001';
SELECT is((public.revert_price_change(:'comp_a', 'eeee0034-0000-0000-0000-000000000001') ->> 'reverted')::INT, 1, 'T-16 revertir devuelve solo el producto que no se tocó después');
SELECT is((SELECT selling_price FROM public.products WHERE id = :'p_ace1'), 7777.00::NUMERIC, 'T-17 y no pisa un precio editado a mano después');
SELECT throws_like(format($q$SELECT public.revert_price_change(%L, 'eeee0034-0000-0000-0000-000000000001')$q$, :'comp_a'), '%ya fue revertido%', 'T-18 un lote revertido no se revierte dos veces');

-- 19. El historial no se edita
SELECT throws_like($q$UPDATE public.price_change_items SET new_price = 1$q$, '%permission denied%', 'T-19 el cliente no puede escribir en el historial');

-- 20-22. Permisos del empleado: sin acceso por defecto, con acceso si el admin lo habilita
SET LOCAL "request.jwt.claim.sub" = 'aaaa0034-0000-0000-0000-000000000002';
SELECT throws_like(format($q$SELECT public.preview_price_change(%L, 10, 1)$q$, :'comp_a'), '%permiso%', 'T-20 un empleado sin permiso no puede usar el cambio de precios');
SET LOCAL "request.jwt.claim.sub" = 'aaaa0034-0000-0000-0000-000000000001';
SELECT public.set_module_permissions(:'comp_a', '{"precios":"operate"}'::JSONB);
SET LOCAL "request.jwt.claim.sub" = 'aaaa0034-0000-0000-0000-000000000002';
SELECT is(jsonb_array_length(public.preview_price_change(:'comp_a', 10, 1)) > 0, true, 'T-21 con el permiso habilitado el empleado puede ver la vista previa');
SELECT is((SELECT count(*) FROM public.price_change_batches WHERE company_id = :'comp_a'), 2::BIGINT, 'T-22 y ve el historial de su empresa');

-- 23-24. Aislamiento entre empresas
SET LOCAL "request.jwt.claim.sub" = 'aaaa0034-0000-0000-0000-000000000003';
SELECT is((SELECT count(*) FROM public.price_change_batches), 0::BIGINT, 'T-23 otra empresa no ve el historial ajeno');
SELECT throws_like(format($q$SELECT public.apply_price_change(%L, 'eeee0034-0000-0000-0000-000000000005', 10, 1)$q$, :'comp_a'), '%', 'T-24 un admin de otra empresa no puede aplicar cambios aquí');

SELECT * FROM finish();
ROLLBACK;
