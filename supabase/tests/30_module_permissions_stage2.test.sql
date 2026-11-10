-- ============================================================================
-- SUITE DE PRUEBAS (pgTAP) - PERMISOS POR MÓDULO (ETAPA 2)
-- Módulo: productos, caja, clientes, proveedores y anular ventas
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
  ('aaaa0030-0000-0000-0000-000000000001', 'admin_p2_a@stockly.local'),
  ('aaaa0030-0000-0000-0000-000000000002', 'empleado_p2_a@stockly.local'),
  ('aaaa0030-0000-0000-0000-000000000003', 'admin_p2_b@stockly.local');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0030-0000-0000-0000-000000000001';
SELECT public.create_company('Empresa P2 Alpha', NULL) AS comp_a \gset
SELECT public.invite_user_to_company(:'comp_a', 'empleado_p2_a@stockly.local', 'employee') AS tok_emp \gset
SET LOCAL "request.jwt.claim.sub" = 'aaaa0030-0000-0000-0000-000000000002';
SELECT public.accept_company_invitation(:'tok_emp');
SET LOCAL "request.jwt.claim.sub" = 'aaaa0030-0000-0000-0000-000000000003';
SELECT public.create_company('Empresa P2 Beta', NULL) AS comp_b \gset
RESET ROLE;

INSERT INTO public.products (company_id, sku, name, selling_price, current_stock)
VALUES (:'comp_a', 'P2-1', 'Producto P2', 100, 100) RETURNING id AS prod \gset
INSERT INTO public.product_costs (company_id, product_id, cost_price, updated_by) VALUES (:'comp_a', :'prod', 40, 'aaaa0030-0000-0000-0000-000000000001');
INSERT INTO public.suppliers (company_id, name, is_active) VALUES (:'comp_a', 'Proveedor P2', true) RETURNING id AS sup \gset
INSERT INTO public.customers (company_id, name, identification_type, is_active) VALUES (:'comp_a', 'Cliente P2', 'CUIT', true) RETURNING id AS cust \gset

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0030-0000-0000-0000-000000000001';
SELECT (public.process_sale(:'comp_a', 'cccc0030-0000-0000-0000-000000000001', format('[{"product_id": "%s", "quantity": 1}]', :'prod')::JSONB, 0, '[{"method": "efectivo", "amount": 100}]'::JSONB) ->> 'sale_id') AS sale1 \gset
SELECT (public.process_sale(:'comp_a', 'cccc0030-0000-0000-0000-000000000002', format('[{"product_id": "%s", "quantity": 1}]', :'prod')::JSONB, 0, '[{"method": "efectivo", "amount": 100}]'::JSONB) ->> 'sale_id') AS sale2 \gset

-- 1-3. Por defecto: caja abierta al empleado (como hoy)
SET LOCAL "request.jwt.claim.sub" = 'aaaa0030-0000-0000-0000-000000000002';
SELECT (public.open_cash_session(:'comp_a', 1000.00, 'Turno') ->> 'session_id') AS ses \gset
SELECT ok(:'ses' IS NOT NULL, 'T-01 por defecto el empleado abre la caja');
SELECT is((SELECT count(*) FROM public.cash_sessions WHERE company_id = :'comp_a'), 1::BIGINT, 'T-02 por defecto el empleado lee las sesiones de caja');
SELECT lives_ok(format($q$SELECT public.register_cash_movement(%L, %L, 'in', 50, 'Cambio')$q$, :'comp_a', :'ses'), 'T-03 por defecto el empleado registra movimientos de caja');

-- 4-9. Por defecto: lo demás sigue como hoy
SELECT is((SELECT count(*) FROM public.product_costs), 0::BIGINT, 'T-04 por defecto el empleado no ve los costos');
SELECT is((SELECT count(*) FROM public.suppliers) + (SELECT count(*) FROM public.customers), 2::BIGINT, 'T-05 por defecto ve proveedores y clientes');
SELECT throws_like(format($q$SELECT public.create_product(%L, 'P2-X', 'X', 'unidad', 10, 5, 1, NULL, NULL, NULL, NULL)$q$, :'comp_a'), '%No tenés permiso%', 'T-06 por defecto no crea productos');
SELECT throws_like(format($q$SELECT public.upsert_customer(%L, 'Otro', 'CUIT', NULL, NULL, NULL, NULL, NULL, NULL, true)$q$, :'comp_a'), '%No tenés permiso%', 'T-07 por defecto no crea clientes');
SELECT throws_like(format($q$SELECT public.upsert_supplier(%L, 'Otro', NULL, NULL, NULL, NULL, NULL, NULL, true)$q$, :'comp_a'), '%No tenés permiso%', 'T-08 por defecto no crea proveedores');
SELECT throws_like(format($q$SELECT public.cancel_sale(%L, %L, 'x')$q$, :'comp_a', :'sale1'), '%No tenés permiso%', 'T-09 por defecto no anula ventas');

-- 10-12. Productos y costos
SET LOCAL "request.jwt.claim.sub" = 'aaaa0030-0000-0000-0000-000000000001';
SELECT public.set_module_permissions(:'comp_a', '{"productos":"view"}'::JSONB);
SET LOCAL "request.jwt.claim.sub" = 'aaaa0030-0000-0000-0000-000000000002';
SELECT is((SELECT count(*) FROM public.product_costs), 1::BIGINT, 'T-10 con productos en "ver" lee los costos');
SELECT throws_like(format($q$SELECT public.create_product(%L, 'P2-X', 'X', 'unidad', 10, 5, 1, NULL, NULL, NULL, NULL)$q$, :'comp_a'), '%No tenés permiso%', 'T-11 con "ver" no crea productos');
SET LOCAL "request.jwt.claim.sub" = 'aaaa0030-0000-0000-0000-000000000001';
SELECT public.set_module_permissions(:'comp_a', '{"productos":"operate"}'::JSONB);
SET LOCAL "request.jwt.claim.sub" = 'aaaa0030-0000-0000-0000-000000000002';
SELECT lives_ok(format($q$SELECT public.create_product(%L, 'P2-X', 'X', 'unidad', 10, 5, 1, NULL, NULL, NULL, NULL)$q$, :'comp_a'), 'T-12 con "operar" crea productos');
SELECT lives_ok(format($q$SELECT public.update_product_cost(%L, %L, 55)$q$, :'comp_a', :'prod'), 'T-13 con "operar" cambia costos');
SET LOCAL "request.jwt.claim.sub" = 'aaaa0030-0000-0000-0000-000000000001';
SELECT public.set_module_permissions(:'comp_a', '{"productos":"none"}'::JSONB);
SET LOCAL "request.jwt.claim.sub" = 'aaaa0030-0000-0000-0000-000000000002';
SELECT is((SELECT count(*) FROM public.product_costs), 0::BIGINT, 'T-14 al quitar el acceso deja de ver los costos');

-- 15-18. Caja
SET LOCAL "request.jwt.claim.sub" = 'aaaa0030-0000-0000-0000-000000000001';
SELECT public.set_module_permissions(:'comp_a', '{"caja":"view"}'::JSONB);
SET LOCAL "request.jwt.claim.sub" = 'aaaa0030-0000-0000-0000-000000000002';
SELECT is((SELECT count(*) FROM public.cash_movements WHERE company_id = :'comp_a'), 1::BIGINT, 'T-15 con caja en "ver" consulta los movimientos');
SELECT throws_like(format($q$SELECT public.register_cash_movement(%L, %L, 'in', 10, 'x')$q$, :'comp_a', :'ses'), '%No tenés permiso%', 'T-16 con "ver" no registra movimientos');
SELECT throws_like(format($q$SELECT public.close_cash_session(%L, %L, 1050, NULL)$q$, :'comp_a', :'ses'), '%No tenés permiso%', 'T-17 con "ver" no cierra la caja');
SET LOCAL "request.jwt.claim.sub" = 'aaaa0030-0000-0000-0000-000000000001';
SELECT public.set_module_permissions(:'comp_a', '{"caja":"none"}'::JSONB);
SET LOCAL "request.jwt.claim.sub" = 'aaaa0030-0000-0000-0000-000000000002';
SELECT is((SELECT count(*) FROM public.cash_sessions) + (SELECT count(*) FROM public.cash_movements), 0::BIGINT, 'T-18 sin acceso a caja no lee sesiones ni movimientos');

-- 19-21. Clientes
SET LOCAL "request.jwt.claim.sub" = 'aaaa0030-0000-0000-0000-000000000001';
SELECT public.set_module_permissions(:'comp_a', '{"clientes":"operate"}'::JSONB);
SET LOCAL "request.jwt.claim.sub" = 'aaaa0030-0000-0000-0000-000000000002';
SELECT lives_ok(format($q$SELECT public.upsert_customer(%L, 'Cliente Nuevo', 'CUIT', NULL, NULL, NULL, NULL, NULL, NULL, true)$q$, :'comp_a'), 'T-19 con clientes en "operar" crea clientes');
SET LOCAL "request.jwt.claim.sub" = 'aaaa0030-0000-0000-0000-000000000001';
SELECT throws_ok(format($q$SELECT public.set_module_permissions(%L, '{"clientes":"none"}'::JSONB)$q$, :'comp_a'), NULL, 'Clientes no se puede ocultar: hace falta para vender a un cliente.', 'T-20 clientes no se puede ocultar');
SET LOCAL "request.jwt.claim.sub" = 'aaaa0030-0000-0000-0000-000000000002';
SELECT is((SELECT count(*) FROM public.customers), 2::BIGINT, 'T-21 el empleado sigue viendo a los clientes');

-- 22-26. Proveedores
SET LOCAL "request.jwt.claim.sub" = 'aaaa0030-0000-0000-0000-000000000001';
SELECT public.set_module_permissions(:'comp_a', '{"proveedores":"operate"}'::JSONB);
SET LOCAL "request.jwt.claim.sub" = 'aaaa0030-0000-0000-0000-000000000002';
SELECT lives_ok(format($q$SELECT public.upsert_supplier(%L, 'Proveedor Nuevo', NULL, NULL, NULL, NULL, NULL, NULL, true)$q$, :'comp_a'), 'T-22 con proveedores en "operar" crea proveedores');
SET LOCAL "request.jwt.claim.sub" = 'aaaa0030-0000-0000-0000-000000000001';
SELECT public.set_module_permissions(:'comp_a', '{"proveedores":"none"}'::JSONB);
SET LOCAL "request.jwt.claim.sub" = 'aaaa0030-0000-0000-0000-000000000002';
SELECT is((SELECT count(*) FROM public.suppliers), 0::BIGINT, 'T-23 sin acceso a proveedores (ni a compras, gastos o cobros) no los lista');
SET LOCAL "request.jwt.claim.sub" = 'aaaa0030-0000-0000-0000-000000000001';
SELECT public.set_module_permissions(:'comp_a', '{"compras":"view"}'::JSONB);
SET LOCAL "request.jwt.claim.sub" = 'aaaa0030-0000-0000-0000-000000000002';
SELECT is((SELECT count(*) FROM public.suppliers), 2::BIGINT, 'T-24 con acceso a compras sigue viendo los nombres de proveedores');

-- 25-26. Anular ventas
SET LOCAL "request.jwt.claim.sub" = 'aaaa0030-0000-0000-0000-000000000001';
SELECT public.set_module_permissions(:'comp_a', '{"anular_ventas":"operate"}'::JSONB);
SET LOCAL "request.jwt.claim.sub" = 'aaaa0030-0000-0000-0000-000000000002';
SELECT lives_ok(format($q$SELECT public.cancel_sale(%L, %L, 'Error de carga')$q$, :'comp_a', :'sale1'), 'T-25 con el permiso anula ventas');
SELECT throws_like(format($q$SELECT public.set_module_permissions(%L, '{"caja":"none"}'::JSONB)$q$, :'comp_a'), '%master_admin%', 'T-26 el empleado no cambia permisos');

-- 27-28. El administrador sigue pudiendo todo
SET LOCAL "request.jwt.claim.sub" = 'aaaa0030-0000-0000-0000-000000000001';
SELECT public.set_module_permissions(:'comp_a', '{"productos":"none","caja":"none","clientes":"view","proveedores":"none","anular_ventas":"none"}'::JSONB);
SET LOCAL "request.jwt.claim.sub" = 'aaaa0030-0000-0000-0000-000000000002';
SET LOCAL "request.jwt.claim.sub" = 'aaaa0030-0000-0000-0000-000000000001';
SELECT lives_ok(format($q$SELECT public.cancel_sale(%L, %L, 'Duplicada')$q$, :'comp_a', :'sale2'), 'T-27 el administrador anula ventas siempre');
SELECT is((SELECT count(*) FROM public.product_costs WHERE company_id = :'comp_a'), 2::BIGINT, 'T-28 el administrador ve los costos siempre');

-- 29-30. Otra empresa
SET LOCAL "request.jwt.claim.sub" = 'aaaa0030-0000-0000-0000-000000000003';
SELECT is((SELECT count(*) FROM public.cash_sessions) + (SELECT count(*) FROM public.product_costs) + (SELECT count(*) FROM public.suppliers), 0::BIGINT, 'T-29 otra empresa no ve estos datos');
SELECT throws_ok(format($q$SELECT public.cancel_sale(%L, %L, 'x')$q$, :'comp_a', :'sale2'), NULL, NULL, 'T-30 el admin de otra empresa no anula estas ventas');

SELECT * FROM finish();
ROLLBACK;
