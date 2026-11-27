-- ============================================================================
-- SUITE DE PRUEBAS (pgTAP) - FACTURA ELECTRÓNICA: DATOS FISCALES (TANDA 1)
-- Módulo: arca_settings, alícuota de IVA del producto y condición de IVA del cliente
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
  ('aaaa0035-0000-0000-0000-000000000001', 'admin_arca_a@stockly.local'),
  ('aaaa0035-0000-0000-0000-000000000002', 'empleado_arca_a@stockly.local'),
  ('aaaa0035-0000-0000-0000-000000000003', 'admin_arca_b@stockly.local');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0035-0000-0000-0000-000000000001';
SELECT public.create_company('Empresa ARCA Alpha', NULL) AS comp_a \gset
SELECT public.invite_user_to_company(:'comp_a', 'empleado_arca_a@stockly.local', 'employee') AS tok_emp \gset
SET LOCAL "request.jwt.claim.sub" = 'aaaa0035-0000-0000-0000-000000000002';
SELECT public.accept_company_invitation(:'tok_emp');
SET LOCAL "request.jwt.claim.sub" = 'aaaa0035-0000-0000-0000-000000000003';
SELECT public.create_company('Empresa ARCA Beta', NULL) AS comp_b \gset
RESET ROLE;

INSERT INTO public.products (company_id, sku, name, unit, selling_price) VALUES
  (:'comp_a', 'PAN-1', 'Pan lactal', 'unidad', 1500.00);
SELECT id AS p_pan FROM public.products WHERE company_id = :'comp_a' AND sku = 'PAN-1' \gset
INSERT INTO public.customers (company_id, name, identification_type, tax_id) VALUES
  (:'comp_a', 'Ferretería del Centro', 'CUIT', '20329642330'),
  (:'comp_a', 'Juan Pérez', 'DNI', '30111222');
SELECT id AS c_cuit FROM public.customers WHERE company_id = :'comp_a' AND name = 'Ferretería del Centro' \gset
SELECT id AS c_dni FROM public.customers WHERE company_id = :'comp_a' AND name = 'Juan Pérez' \gset

-- 1-3. Valores por defecto
SELECT is((SELECT vat_rate FROM public.products WHERE id = :'p_pan'), 21.00::NUMERIC, 'T-01 un producto nuevo tiene IVA 21 %');
SELECT is((SELECT vat_condition FROM public.customers WHERE id = :'c_dni'), 'consumidor_final', 'T-02 un cliente nuevo es consumidor final');
SELECT throws_like(format($q$UPDATE public.products SET vat_rate = 19 WHERE id = %L$q$, :'p_pan'), '%chk_products_vat_rate%', 'T-03 la tabla rechaza una alícuota que ARCA no acepta');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0035-0000-0000-0000-000000000001';

-- 4-8. Datos de ARCA de la empresa
SELECT lives_ok(format($q$SELECT public.save_arca_settings(%L, 3, DATE '2015-04-01', '901-123456-7')$q$, :'comp_a'), 'T-04 el admin guarda los datos de ARCA');
SELECT is((SELECT point_of_sale FROM public.arca_settings WHERE company_id = :'comp_a'), 3, 'T-05 queda guardado el punto de venta');
SELECT lives_ok(format($q$SELECT public.save_arca_settings(%L, 4, NULL, '  ')$q$, :'comp_a'), 'T-06 guardar de nuevo actualiza la misma fila');
SELECT is((SELECT gross_income_number FROM public.arca_settings WHERE company_id = :'comp_a'), NULL, 'T-07 un texto en blanco se guarda vacío');
SELECT throws_like(format($q$SELECT public.save_arca_settings(%L, 100000, NULL, NULL)$q$, :'comp_a'), '%entre 1 y 99998%', 'T-08 un punto de venta fuera de rango se rechaza');
SELECT throws_like(format($q$SELECT public.save_arca_settings(%L, 1, CURRENT_DATE + 1, NULL)$q$, :'comp_a'), '%inicio de actividades%', 'T-09 una fecha de inicio futura se rechaza');

-- 10-12. IVA del producto
SELECT lives_ok(format($q$SELECT public.set_product_vat_rate(%L, %L, 10.5)$q$, :'comp_a', :'p_pan'), 'T-10 el admin cambia la alícuota');
SELECT is((SELECT vat_rate FROM public.products WHERE id = :'p_pan'), 10.50::NUMERIC, 'T-11 la alícuota queda en 10,5 %');
SELECT throws_like(format($q$SELECT public.set_product_vat_rate(%L, %L, 19)$q$, :'comp_a', :'p_pan'), '%Alícuota de IVA inválida%', 'T-12 la función rechaza una alícuota inválida');

-- 13-15. Condición de IVA del cliente
SELECT lives_ok(format($q$SELECT public.set_customer_vat_condition(%L, %L, 'responsable_inscripto')$q$, :'comp_a', :'c_cuit'), 'T-13 un cliente con CUIT puede ser Responsable Inscripto');
SELECT throws_like(format($q$SELECT public.set_customer_vat_condition(%L, %L, 'responsable_inscripto')$q$, :'comp_a', :'c_dni'), '%necesita un CUIT%', 'T-14 un cliente con DNI no puede ser Responsable Inscripto');
SELECT lives_ok(format($q$SELECT public.set_customer_vat_condition(%L, %L, 'monotributo')$q$, :'comp_a', :'c_dni'), 'T-15 un cliente con DNI puede ser monotributista');

-- 16-17. El cliente no escribe directo en las tablas
SELECT throws_like(format($q$INSERT INTO public.arca_settings (company_id) VALUES (%L)$q$, :'comp_b'), '%permission denied%', 'T-16 no se puede escribir arca_settings sin la función');

-- 17-18. Empleado: lee los datos de ARCA, no los cambia ni toca el IVA sin permiso
SET LOCAL "request.jwt.claim.sub" = 'aaaa0035-0000-0000-0000-000000000002';
SELECT is((SELECT count(*) FROM public.arca_settings WHERE company_id = :'comp_a'), 1::BIGINT, 'T-17 el empleado lee los datos de ARCA de su empresa');
SELECT throws_like(format($q$SELECT public.save_arca_settings(%L, 9, NULL, NULL)$q$, :'comp_a'), '%', 'T-18 el empleado no puede cambiar los datos de ARCA');

-- 19-20. Aislamiento entre empresas
SET LOCAL "request.jwt.claim.sub" = 'aaaa0035-0000-0000-0000-000000000003';
SELECT is((SELECT count(*) FROM public.arca_settings), 0::BIGINT, 'T-19 otra empresa no ve los datos de ARCA ajenos');
SELECT throws_like(format($q$SELECT public.set_product_vat_rate(%L, %L, 21)$q$, :'comp_a', :'p_pan'), '%', 'T-20 un admin de otra empresa no puede cambiar el IVA de un producto ajeno');

SELECT * FROM finish();
ROLLBACK;
