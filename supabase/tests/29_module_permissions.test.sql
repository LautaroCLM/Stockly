-- ============================================================================
-- SUITE DE PRUEBAS (pgTAP) - PERMISOS POR MÓDULO (ETAPA 1)
-- Módulo: company_module_permissions y acceso del rol empleado
-- Estado: SUITE AISLADA E INDEPENDIENTE (Transacción con ROLLBACK)
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(34);

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
  ('aaaa0029-0000-0000-0000-000000000001', 'admin_pm_a@stockly.local'),
  ('aaaa0029-0000-0000-0000-000000000002', 'empleado_pm_a@stockly.local'),
  ('aaaa0029-0000-0000-0000-000000000003', 'admin_pm_b@stockly.local');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0029-0000-0000-0000-000000000001';
SELECT public.create_company('Empresa PM Alpha', NULL) AS comp_a \gset
SELECT public.invite_user_to_company(:'comp_a', 'empleado_pm_a@stockly.local', 'employee') AS tok_emp \gset
SET LOCAL "request.jwt.claim.sub" = 'aaaa0029-0000-0000-0000-000000000002';
SELECT public.accept_company_invitation(:'tok_emp');
SET LOCAL "request.jwt.claim.sub" = 'aaaa0029-0000-0000-0000-000000000003';
SELECT public.create_company('Empresa PM Beta', NULL) AS comp_b \gset
RESET ROLE;

INSERT INTO public.products (company_id, sku, name, selling_price, current_stock)
VALUES (:'comp_a', 'PM-1', 'Producto PM', 100, 0) RETURNING id AS prod \gset
INSERT INTO public.suppliers (company_id, name, is_active) VALUES (:'comp_a', 'Proveedor PM', true) RETURNING id AS sup \gset

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0029-0000-0000-0000-000000000001';
-- Datos que crea el administrador (siempre tiene acceso a todo, sin configurar nada)
SELECT (public.process_purchase(:'comp_a', 'cccc0029-0000-0000-0000-000000000001', :'sup', format('[{"product_id": "%s", "quantity": 1, "unit_cost": 100}]', :'prod')::JSONB) ->> 'purchase_id') AS pur1 \gset
SELECT (public.process_purchase(:'comp_a', 'cccc0029-0000-0000-0000-000000000002', :'sup', format('[{"product_id": "%s", "quantity": 1, "unit_cost": 100}]', :'prod')::JSONB) ->> 'purchase_id') AS pur2 \gset
SELECT (public.create_expense(:'comp_a', current_date, 'servicios', 'Luz', 100, 'transferencia', NULL, false) ->> 'expense_id') AS exp1 \gset
SELECT public.upsert_employee(:'comp_a', NULL, 'Juan Pérez', NULL, 'Operario', NULL, NULL, 'active', NULL) AS emp \gset
SELECT is((public.financial_summary(:'comp_a', current_date - 1, current_date + 1) ->> 'purchases_count')::INTEGER, 2, 'T-01 el administrador accede a todo sin configurar nada');

-- 2-4. Valores por defecto del rol empleado
SET LOCAL "request.jwt.claim.sub" = 'aaaa0029-0000-0000-0000-000000000002';
SELECT is((SELECT string_agg(module || ':' || employee_level, ',' ORDER BY module) FROM public.get_module_permissions(:'comp_a')),
  'anular_ventas:none,caja:operate,clientes:view,cobros_pagos:none,compras:none,fichaje:operate,finanzas:none,gastos:none,informes:none,maquinas:none,personal:none,productos:none,proveedores:view', 'T-02 por defecto el empleado solo ficha');
SELECT throws_like(format($q$SELECT public.set_module_permissions(%L, '{"compras":"view"}'::JSONB)$q$, :'comp_a'), '%master_admin%', 'T-03 el empleado no cambia los permisos');
SELECT is((SELECT count(*) FROM public.purchases) + (SELECT count(*) FROM public.expenses) + (SELECT count(*) FROM public.employees), 0::BIGINT, 'T-04 por defecto el empleado no lee compras, gastos ni personal');

-- 5-8. Validaciones y otra empresa
SET LOCAL "request.jwt.claim.sub" = 'aaaa0029-0000-0000-0000-000000000001';
SELECT throws_ok(format($q$SELECT public.set_module_permissions(%L, '{"ventas":"view"}'::JSONB)$q$, :'comp_a'), NULL, 'Módulo inválido: ventas.', 'T-05 módulo inválido rechazado');
SELECT throws_ok(format($q$SELECT public.set_module_permissions(%L, '{"compras":"todo"}'::JSONB)$q$, :'comp_a'), NULL, 'Nivel inválido para el módulo compras.', 'T-06 nivel inválido rechazado');
SELECT throws_ok(format($q$SELECT public.set_module_permissions(%L, '["compras"]'::JSONB)$q$, :'comp_a'), NULL, 'Los permisos deben indicarse como un objeto {módulo: nivel}.', 'T-07 formato inválido rechazado');
SET LOCAL "request.jwt.claim.sub" = 'aaaa0029-0000-0000-0000-000000000003';
SELECT throws_ok(format($q$SELECT public.set_module_permissions(%L, '{"compras":"view"}'::JSONB)$q$, :'comp_a'), NULL, NULL, 'T-08 el admin de otra empresa no cambia estos permisos');

-- 9-13. Compras: solo ver y luego operar
SET LOCAL "request.jwt.claim.sub" = 'aaaa0029-0000-0000-0000-000000000001';
SELECT public.set_module_permissions(:'comp_a', '{"compras":"view"}'::JSONB);
SET LOCAL "request.jwt.claim.sub" = 'aaaa0029-0000-0000-0000-000000000002';
SELECT is((SELECT count(*) FROM public.purchases), 2::BIGINT, 'T-09 con compras en "solo ver" el empleado lee las compras');
SELECT throws_like(format($q$SELECT public.process_purchase(%L, 'cccc0029-0000-0000-0000-000000000003', %L, '[{"product_id": "%s", "quantity": 1, "unit_cost": 100}]'::JSONB)$q$, :'comp_a', :'sup', :'prod'), '%No tenés permiso%', 'T-10 con "solo ver" no puede registrar compras');
SELECT throws_like(format($q$SELECT public.cancel_purchase(%L, %L, 'x')$q$, :'comp_a', :'pur1'), '%No tenés permiso%', 'T-11 con "solo ver" no puede anular compras');
SET LOCAL "request.jwt.claim.sub" = 'aaaa0029-0000-0000-0000-000000000001';
SELECT public.set_module_permissions(:'comp_a', '{"compras":"operate"}'::JSONB);
SET LOCAL "request.jwt.claim.sub" = 'aaaa0029-0000-0000-0000-000000000002';
SELECT lives_ok(format($q$SELECT public.process_purchase(%L, 'cccc0029-0000-0000-0000-000000000003', %L, '[{"product_id": "%s", "quantity": 1, "unit_cost": 100}]'::JSONB)$q$, :'comp_a', :'sup', :'prod'), 'T-12 con "operar" registra compras');
SELECT lives_ok(format($q$SELECT public.cancel_purchase(%L, %L, 'Duplicada')$q$, :'comp_a', :'pur1'), 'T-13 con "operar" anula compras');

-- 14. Quitar el acceso corta la lectura en el acto
SET LOCAL "request.jwt.claim.sub" = 'aaaa0029-0000-0000-0000-000000000001';
SELECT public.set_module_permissions(:'comp_a', '{"compras":"none"}'::JSONB);
SET LOCAL "request.jwt.claim.sub" = 'aaaa0029-0000-0000-0000-000000000002';
SELECT is((SELECT count(*) FROM public.purchases), 0::BIGINT, 'T-14 al quitar el acceso el empleado deja de leer las compras');

-- 15-17. Gastos
SET LOCAL "request.jwt.claim.sub" = 'aaaa0029-0000-0000-0000-000000000001';
SELECT public.set_module_permissions(:'comp_a', '{"gastos":"view"}'::JSONB);
SET LOCAL "request.jwt.claim.sub" = 'aaaa0029-0000-0000-0000-000000000002';
SELECT is((SELECT count(*) FROM public.expenses), 1::BIGINT, 'T-15 con gastos en "solo ver" lee los gastos');
SELECT throws_like(format($q$SELECT public.create_expense(%L, current_date, 'otros', 'x', 10, 'transferencia', NULL, false)$q$, :'comp_a'), '%No tenés permiso%', 'T-16 con "solo ver" no registra gastos');
SET LOCAL "request.jwt.claim.sub" = 'aaaa0029-0000-0000-0000-000000000001';
SELECT public.set_module_permissions(:'comp_a', '{"gastos":"operate"}'::JSONB);
SET LOCAL "request.jwt.claim.sub" = 'aaaa0029-0000-0000-0000-000000000002';
SELECT lives_ok(format($q$SELECT public.create_expense(%L, current_date, 'otros', 'Resma', 10, 'transferencia', NULL, false)$q$, :'comp_a'), 'T-17 con "operar" registra gastos');

-- 18-20. Cobros y pagos
SELECT throws_like(format($q$SELECT * FROM public.customer_balances(%L)$q$, :'comp_a'), '%No tenés permiso%', 'T-18 sin acceso no ve las cuentas corrientes');
SET LOCAL "request.jwt.claim.sub" = 'aaaa0029-0000-0000-0000-000000000001';
SELECT public.set_module_permissions(:'comp_a', '{"cobros_pagos":"view"}'::JSONB);
SET LOCAL "request.jwt.claim.sub" = 'aaaa0029-0000-0000-0000-000000000002';
SELECT lives_ok(format($q$SELECT * FROM public.supplier_balances(%L)$q$, :'comp_a'), 'T-19 con "solo ver" consulta las deudas');
SELECT throws_like(format($q$SELECT public.register_supplier_payment(%L, %L, '[{"method":"transferencia","amount":10}]'::JSONB, NULL, false, 'cccc0029-0000-0000-0000-000000000020')$q$, :'comp_a', :'sup'), '%No tenés permiso%', 'T-20 con "solo ver" no registra pagos');

-- 21-22. Finanzas e informes
SELECT throws_like(format($q$SELECT public.financial_summary(%L, current_date - 1, current_date)$q$, :'comp_a'), '%No tenés permiso%', 'T-21 sin acceso no ve el resumen financiero');
SET LOCAL "request.jwt.claim.sub" = 'aaaa0029-0000-0000-0000-000000000001';
SELECT public.set_module_permissions(:'comp_a', '{"finanzas":"view","informes":"view"}'::JSONB);
SET LOCAL "request.jwt.claim.sub" = 'aaaa0029-0000-0000-0000-000000000002';
SELECT lives_ok(format($q$SELECT public.financial_summary(%L, current_date - 1, current_date)$q$, :'comp_a'), 'T-22 con acceso ve el resumen financiero');
SELECT lives_ok(format($q$SELECT * FROM public.report_sales_by_day(%L, current_date - 1, current_date)$q$, :'comp_a'), 'T-23 con acceso ve los informes');

-- 24-25. Máquinas
SET LOCAL "request.jwt.claim.sub" = 'aaaa0029-0000-0000-0000-000000000001';
SELECT public.set_module_permissions(:'comp_a', '{"maquinas":"view"}'::JSONB);
SET LOCAL "request.jwt.claim.sub" = 'aaaa0029-0000-0000-0000-000000000002';
SELECT throws_like(format($q$SELECT public.upsert_machine(%L, NULL, 'X', 'camion', NULL, NULL, NULL, NULL, 'active', NULL)$q$, :'comp_a'), '%No tenés permiso%', 'T-24 con "solo ver" no crea máquinas');
SET LOCAL "request.jwt.claim.sub" = 'aaaa0029-0000-0000-0000-000000000001';
SELECT public.set_module_permissions(:'comp_a', '{"maquinas":"operate"}'::JSONB);
SET LOCAL "request.jwt.claim.sub" = 'aaaa0029-0000-0000-0000-000000000002';
SELECT lives_ok(format($q$SELECT public.upsert_machine(%L, NULL, 'Camión', 'camion', NULL, NULL, NULL, NULL, 'active', NULL)$q$, :'comp_a'), 'T-25 con "operar" crea máquinas');

-- 26-28. Personal
SET LOCAL "request.jwt.claim.sub" = 'aaaa0029-0000-0000-0000-000000000001';
SELECT public.set_module_permissions(:'comp_a', '{"personal":"view"}'::JSONB);
SET LOCAL "request.jwt.claim.sub" = 'aaaa0029-0000-0000-0000-000000000002';
SELECT is((SELECT count(*) FROM public.employees), 1::BIGINT, 'T-26 con personal en "solo ver" lee los empleados');
SELECT throws_like(format($q$SELECT public.upsert_employee(%L, NULL, 'Otro', NULL, NULL, NULL, NULL, 'active', NULL)$q$, :'comp_a'), '%No tenés permiso%', 'T-27 con "solo ver" no crea empleados');
SELECT lives_ok(format($q$SELECT * FROM public.attendance_report(%L, current_date - 7, current_date)$q$, :'comp_a'), 'T-28 con "solo ver" consulta el informe de asistencia');

-- 29-31. Fichaje: su propio módulo o el de personal
SET LOCAL "request.jwt.claim.sub" = 'aaaa0029-0000-0000-0000-000000000001';
SELECT public.set_module_permissions(:'comp_a', '{"personal":"none","fichaje":"none"}'::JSONB);
SET LOCAL "request.jwt.claim.sub" = 'aaaa0029-0000-0000-0000-000000000002';
SELECT throws_like(format($q$SELECT public.clock_in(%L, %L)$q$, :'comp_a', :'emp'), '%No tenés permiso%', 'T-29 sin fichaje ni personal no puede marcar');
SET LOCAL "request.jwt.claim.sub" = 'aaaa0029-0000-0000-0000-000000000001';
SELECT public.set_module_permissions(:'comp_a', '{"fichaje":"operate"}'::JSONB);
SET LOCAL "request.jwt.claim.sub" = 'aaaa0029-0000-0000-0000-000000000002';
SELECT lives_ok(format($q$SELECT public.clock_in(%L, %L)$q$, :'comp_a', :'emp'), 'T-30 con fichaje puede marcar');
SET LOCAL "request.jwt.claim.sub" = 'aaaa0029-0000-0000-0000-000000000001';
SELECT public.set_module_permissions(:'comp_a', '{"fichaje":"none","personal":"operate"}'::JSONB);
SET LOCAL "request.jwt.claim.sub" = 'aaaa0029-0000-0000-0000-000000000002';
SELECT lives_ok(format($q$SELECT public.clock_out(%L, %L)$q$, :'comp_a', :'emp'), 'T-31 con el módulo personal también puede marcar');

-- 32. La auditoría registra los cambios de permisos
SET LOCAL "request.jwt.claim.sub" = 'aaaa0029-0000-0000-0000-000000000001';
SELECT ok((SELECT count(*) FROM public.audit_log WHERE table_name = 'company_module_permissions') > 0, 'T-32 los cambios de permisos quedan en la auditoría');

-- 33-34. El administrador no pierde acceso y otra empresa no se afecta
SET LOCAL "request.jwt.claim.sub" = 'aaaa0029-0000-0000-0000-000000000001';
SELECT public.set_module_permissions(:'comp_a', '{"compras":"none","finanzas":"none","gastos":"none","cobros_pagos":"none","informes":"none","maquinas":"none","personal":"none","fichaje":"none"}'::JSONB);
SET LOCAL "request.jwt.claim.sub" = 'aaaa0029-0000-0000-0000-000000000002';
SET LOCAL "request.jwt.claim.sub" = 'aaaa0029-0000-0000-0000-000000000001';
SELECT lives_ok(format($q$SELECT public.financial_summary(%L, current_date - 1, current_date)$q$, :'comp_a'), 'T-33 el administrador accede aunque todo esté en "sin acceso" para el empleado');
SET LOCAL "request.jwt.claim.sub" = 'aaaa0029-0000-0000-0000-000000000003';
SELECT is((SELECT count(*) FROM public.company_module_permissions), 0::BIGINT, 'T-34 otra empresa no ve estos permisos');

SELECT * FROM finish();
ROLLBACK;
