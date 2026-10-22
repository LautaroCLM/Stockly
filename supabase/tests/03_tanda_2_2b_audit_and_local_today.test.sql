-- ============================================================================
-- SUITE DE PRUEBAS TDD (pgTAP) - TANDA 2.2B (MIGRACIÓN 1)
-- Módulo: Auditoría Universal (audit_trigger) y Endurecimiento de local_today
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
-- Estado: SUITE AISLADA E INDEPENDIENTE (Transacción con ROLLBACK)
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(16);

-- ============================================================================
-- 1. ARNÉS DE PERMISOS PARA EJECUCIÓN DE ASERCIONES BAJO ROL authenticated
-- ============================================================================
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

-- ============================================================================
-- 2. SETUP INDEPENDIENTE: Tenants y Usuarios Propios de esta Suite
-- ============================================================================
CREATE TEMP TABLE test_ctx_22b_m1 (
  key TEXT PRIMARY KEY,
  id UUID
);
GRANT SELECT, INSERT, UPDATE ON TABLE test_ctx_22b_m1 TO authenticated;

INSERT INTO auth.users (id, email) VALUES
  ('aaaa0001-0000-0000-0000-000000000001', 'admin_m1_a@stockly.local'),
  ('bbbb0002-0000-0000-0000-000000000002', 'admin_m1_b@stockly.local');

-- Crear Empresa A con admin_m1_a
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0001-0000-0000-0000-000000000001';
SET LOCAL "request.jwt.claim.email" = 'admin_m1_a@stockly.local';

SELECT public.create_company('Empresa M1 Alpha', '30-71111111-1') AS comp_m1_a_id \gset
INSERT INTO test_ctx_22b_m1 VALUES ('comp_a', :'comp_m1_a_id');

-- Crear Empresa B con admin_m1_b
SET LOCAL "request.jwt.claim.sub" = 'bbbb0002-0000-0000-0000-000000000002';
SET LOCAL "request.jwt.claim.email" = 'admin_m1_b@stockly.local';

SELECT public.create_company('Empresa M1 Beta', '30-70000004-0') AS comp_m1_b_id \gset
INSERT INTO test_ctx_22b_m1 VALUES ('comp_b', :'comp_m1_b_id');

RESET ROLE;

-- ============================================================================
-- 3. ASERCIONES TDD: EXISTENCIA Y ACL EFECTIVA DE audit_trigger()
-- ============================================================================

-- T-01: Existencia de la función public.audit_trigger() en pg_proc
SELECT has_function(
  'public',
  'audit_trigger',
  ARRAY[]::TEXT[],
  'T-01: Debe existir la función de disparador public.audit_trigger().'
);

-- T-02: Verificación de seguridad y ACL efectiva en catálogo (SECURITY DEFINER, search_path='', sin EXECUTE a PUBLIC/anon/authenticated)
-- Nota: Se usa to_regprocedure('public.audit_trigger()') para que la consulta no aborte en fase roja si la función aún no existe.
SELECT is(
  (
    SELECT
      p.prosecdef = true
      AND COALESCE('search_path=""' = ANY(p.proconfig) OR 'search_path=''''' = ANY(p.proconfig), false)
      AND NOT pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
        WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
      )
    FROM pg_catalog.pg_proc p
    WHERE p.oid = pg_catalog.to_regprocedure('public.audit_trigger()')
  ),
  true,
  'T-02: public.audit_trigger() debe ser SECURITY DEFINER, con search_path vacío y EXECUTE revocado a PUBLIC, anon y authenticated.'
);

-- ============================================================================
-- 4. ASERCIONES TDD: COMPORTAMIENTO DE AUDITORÍA (INSERT, UPDATE, DELETE, PK COMPUESTA, RUIDO)
-- ============================================================================

-- Simular contexto autenticado de admin_m1_a en claims JWT mientras el dueño ejecuta DML de prueba sobre el catálogo
SET LOCAL "request.jwt.claim.sub" = 'aaaa0001-0000-0000-0000-000000000001';
SET LOCAL "request.jwt.claim.email" = 'admin_m1_a@stockly.local';

DO $$
DECLARE
  v_comp_a UUID := (SELECT id FROM test_ctx_22b_m1 WHERE key = 'comp_a');
  v_cat_id UUID;
  v_sup_id UUID;
  v_prod_id UUID;
BEGIN
  INSERT INTO public.categories (company_id, name, description)
  VALUES (v_comp_a, 'Cat Auditoria M1', 'Categoria inicial')
  RETURNING id INTO v_cat_id;

  INSERT INTO public.suppliers (company_id, name, email)
  VALUES (v_comp_a, 'Proveedor Auditoria M1', 'prov@m1.local')
  RETURNING id INTO v_sup_id;

  INSERT INTO public.products (company_id, sku, name, category_id, supplier_id, unit, selling_price, min_stock, current_stock)
  VALUES (v_comp_a, 'PROD-M1-01', 'Producto M1 Original', v_cat_id, v_sup_id, 'unidad', 1000.00, 1.00, 10.00)
  RETURNING id INTO v_prod_id;

  INSERT INTO test_ctx_22b_m1 VALUES
    ('cat_a', v_cat_id),
    ('sup_a', v_sup_id),
    ('prod_a', v_prod_id);
END;
$$;

-- T-03: Auditoría de INSERT en categories (PK simple 'id', resolución de company_id, performed_by y actor_role)
SELECT is(
  (
    SELECT count(*)::INT
    FROM public.audit_log
    WHERE company_id = (SELECT id FROM test_ctx_22b_m1 WHERE key = 'comp_a')
      AND table_name = 'categories'
      AND record_id = (SELECT id::TEXT FROM test_ctx_22b_m1 WHERE key = 'cat_a')
      AND action = 'INSERT'
      AND old_data IS NULL
      AND new_data->>'name' = 'Cat Auditoria M1'
      AND performed_by = 'aaaa0001-0000-0000-0000-000000000001'::UUID
      AND actor_role = 'master_admin'
  ),
  1,
  'T-03: INSERT en categories debe quedar registrado en audit_log con record_id TEXT, performed_by y actor_role.'
);

-- T-04: Auditoría de UPDATE en categories (captura de old_data y new_data)
UPDATE public.categories
SET description = 'Categoria actualizada'
WHERE id = (SELECT id FROM test_ctx_22b_m1 WHERE key = 'cat_a');

SELECT is(
  (
    SELECT count(*)::INT
    FROM public.audit_log
    WHERE company_id = (SELECT id FROM test_ctx_22b_m1 WHERE key = 'comp_a')
      AND table_name = 'categories'
      AND record_id = (SELECT id::TEXT FROM test_ctx_22b_m1 WHERE key = 'cat_a')
      AND action = 'UPDATE'
      AND old_data->>'description' = 'Categoria inicial'
      AND new_data->>'description' = 'Categoria actualizada'
      AND performed_by = 'aaaa0001-0000-0000-0000-000000000001'::UUID
  ),
  1,
  'T-04: UPDATE en categories debe registrar old_data y new_data en audit_log.'
);

-- T-05: Auditoría de INSERT en suppliers
SELECT is(
  (
    SELECT count(*)::INT
    FROM public.audit_log
    WHERE company_id = (SELECT id FROM test_ctx_22b_m1 WHERE key = 'comp_a')
      AND table_name = 'suppliers'
      AND record_id = (SELECT id::TEXT FROM test_ctx_22b_m1 WHERE key = 'sup_a')
      AND action = 'INSERT'
      AND new_data->>'name' = 'Proveedor Auditoria M1'
  ),
  1,
  'T-05: INSERT en suppliers debe quedar registrado en audit_log.'
);

-- T-06: Auditoría de INSERT en products
SELECT is(
  (
    SELECT count(*)::INT
    FROM public.audit_log
    WHERE company_id = (SELECT id FROM test_ctx_22b_m1 WHERE key = 'comp_a')
      AND table_name = 'products'
      AND record_id = (SELECT id::TEXT FROM test_ctx_22b_m1 WHERE key = 'prod_a')
      AND action = 'INSERT'
      AND new_data->>'sku' = 'PROD-M1-01'
  ),
  1,
  'T-06: INSERT en products debe quedar registrado en audit_log.'
);

-- T-07: Auditoría de INSERT en tabla con PK compuesta sin columna id (product_costs: PK (company_id, product_id), TG_ARGV[0] = 'product_id')
INSERT INTO public.product_costs (company_id, product_id, cost_price, updated_by)
VALUES (
  (SELECT id FROM test_ctx_22b_m1 WHERE key = 'comp_a'),
  (SELECT id FROM test_ctx_22b_m1 WHERE key = 'prod_a'),
  500.00,
  'aaaa0001-0000-0000-0000-000000000001'
);

SELECT is(
  (
    SELECT count(*)::INT
    FROM public.audit_log
    WHERE company_id = (SELECT id FROM test_ctx_22b_m1 WHERE key = 'comp_a')
      AND table_name = 'product_costs'
      AND record_id = (SELECT id::TEXT FROM test_ctx_22b_m1 WHERE key = 'prod_a')
      AND action = 'INSERT'
      AND old_data IS NULL
      AND (new_data->>'cost_price')::NUMERIC = 500.00
      AND new_data->>'updated_by' = 'aaaa0001-0000-0000-0000-000000000001'
  ),
  1,
  'T-07: INSERT en product_costs (PK compuesta) debe registrar action = INSERT con record_id = product_id::TEXT y new_data esperado.'
);

-- T-08: Auditoría de UPDATE en tabla con PK compuesta (product_costs)
UPDATE public.product_costs
SET cost_price = 650.00
WHERE company_id = (SELECT id FROM test_ctx_22b_m1 WHERE key = 'comp_a')
  AND product_id = (SELECT id FROM test_ctx_22b_m1 WHERE key = 'prod_a');

SELECT is(
  (
    SELECT count(*)::INT
    FROM public.audit_log
    WHERE company_id = (SELECT id FROM test_ctx_22b_m1 WHERE key = 'comp_a')
      AND table_name = 'product_costs'
      AND record_id = (SELECT id::TEXT FROM test_ctx_22b_m1 WHERE key = 'prod_a')
      AND action = 'UPDATE'
      AND (old_data->>'cost_price')::NUMERIC = 500.00
      AND (new_data->>'cost_price')::NUMERIC = 650.00
  ),
  1,
  'T-08: UPDATE en product_costs (PK compuesta) debe usar TG_ARGV[0] = product_id como record_id TEXT en audit_log.'
);

-- T-09: Auditoría de DELETE en tabla con PK compuesta (product_costs), sin eliminar el producto padre en products
DELETE FROM public.product_costs
WHERE company_id = (SELECT id FROM test_ctx_22b_m1 WHERE key = 'comp_a')
  AND product_id = (SELECT id FROM test_ctx_22b_m1 WHERE key = 'prod_a');

SELECT is(
  (
    SELECT count(*)::INT
    FROM public.audit_log
    WHERE company_id = (SELECT id FROM test_ctx_22b_m1 WHERE key = 'comp_a')
      AND table_name = 'product_costs'
      AND record_id = (SELECT id::TEXT FROM test_ctx_22b_m1 WHERE key = 'prod_a')
      AND action = 'DELETE'
      AND (old_data->>'cost_price')::NUMERIC = 650.00
      AND new_data IS NULL
  ),
  1,
  'T-09: DELETE en product_costs (PK compuesta) debe registrar action = DELETE con record_id = product_id::TEXT, old_data y new_data IS NULL.'
);

-- T-10: Filtro anti-ruido en products cuando solo cambian current_stock y updated_at (vía ajuste de stock)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0001-0000-0000-0000-000000000001';
SET LOCAL "request.jwt.claim.email" = 'admin_m1_a@stockly.local';

SELECT public.register_stock_adjustment(
  (SELECT id FROM test_ctx_22b_m1 WHERE key = 'comp_a'),
  'cccc0001-0000-0000-0000-000000000001'::UUID,
  (SELECT id FROM test_ctx_22b_m1 WHERE key = 'prod_a'),
  'increase',
  'physical_count',
  5.00,
  'Ajuste para verificar filtro anti-ruido'
) AS dummy_adj_m1 \gset

RESET ROLE;

SELECT is(
  (
    SELECT count(*)::INT
    FROM public.audit_log
    WHERE company_id = (SELECT id FROM test_ctx_22b_m1 WHERE key = 'comp_a')
      AND table_name = 'products'
      AND record_id = (SELECT id::TEXT FROM test_ctx_22b_m1 WHERE key = 'prod_a')
      AND action = 'UPDATE'
  ),
  0,
  'T-10: Un cambio en products que solo modifica current_stock y updated_at NO debe generar fila UPDATE en audit_log.'
);

-- T-11: UPDATE comercial en products (cambio de selling_price) SÍ debe registrarse en audit_log
SET LOCAL "request.jwt.claim.sub" = 'aaaa0001-0000-0000-0000-000000000001';
UPDATE public.products
SET selling_price = 1250.00
WHERE id = (SELECT id FROM test_ctx_22b_m1 WHERE key = 'prod_a');

SELECT is(
  (
    SELECT count(*)::INT
    FROM public.audit_log
    WHERE company_id = (SELECT id FROM test_ctx_22b_m1 WHERE key = 'comp_a')
      AND table_name = 'products'
      AND record_id = (SELECT id::TEXT FROM test_ctx_22b_m1 WHERE key = 'prod_a')
      AND action = 'UPDATE'
      AND (old_data->>'selling_price')::NUMERIC = 1000.00
      AND (new_data->>'selling_price')::NUMERIC = 1250.00
  ),
  1,
  'T-11: Un UPDATE en products que modifica selling_price debe registrarse en audit_log.'
);

-- T-12: Soporte de performed_by IS NULL cuando auth.uid() retorna NULL (operación sin JWT de usuario)
-- Alcance explícito de la prueba: Se verifica que cuando las variables GUC de JWT están vacías y auth.uid() es NULL,
-- audit_trigger() inserta performed_by IS NULL y actor_role IS NULL sin fallar.
-- (En un contexto real de proceso de fondo / migración / cron sin PostgREST, esas GUCs tampoco existen en la sesión).
SELECT pg_catalog.set_config('request.jwt.claim.sub', '', true);
SELECT pg_catalog.set_config('request.jwt.claims', '', true);

UPDATE public.products
SET name = 'Producto M1 Editado Por Sistema'
WHERE id = (SELECT id FROM test_ctx_22b_m1 WHERE key = 'prod_a');

SELECT is(
  (
    SELECT count(*)::INT
    FROM public.audit_log
    WHERE company_id = (SELECT id FROM test_ctx_22b_m1 WHERE key = 'comp_a')
      AND table_name = 'products'
      AND record_id = (SELECT id::TEXT FROM test_ctx_22b_m1 WHERE key = 'prod_a')
      AND action = 'UPDATE'
      AND new_data->>'name' = 'Producto M1 Editado Por Sistema'
      AND performed_by IS NULL
      AND actor_role IS NULL
  ),
  1,
  'T-12: Cuando auth.uid() es NULL, audit_trigger() debe registrar performed_by IS NULL y actor_role IS NULL.'
);

-- T-13: Auditoría de DELETE (creación y eliminación de una categoría sin productos asociados)
SET LOCAL "request.jwt.claim.sub" = 'aaaa0001-0000-0000-0000-000000000001';

DO $$
DECLARE
  v_comp_a UUID := (SELECT id FROM test_ctx_22b_m1 WHERE key = 'comp_a');
  v_cat_del UUID;
BEGIN
  INSERT INTO public.categories (company_id, name)
  VALUES (v_comp_a, 'Cat Efimera Borrable')
  RETURNING id INTO v_cat_del;

  INSERT INTO test_ctx_22b_m1 VALUES ('cat_del', v_cat_del);

  DELETE FROM public.categories WHERE id = v_cat_del;
END;
$$;

SELECT is(
  (
    SELECT count(*)::INT
    FROM public.audit_log
    WHERE company_id = (SELECT id FROM test_ctx_22b_m1 WHERE key = 'comp_a')
      AND table_name = 'categories'
      AND record_id = (SELECT id::TEXT FROM test_ctx_22b_m1 WHERE key = 'cat_del')
      AND action = 'DELETE'
      AND old_data->>'name' = 'Cat Efimera Borrable'
      AND new_data IS NULL
      AND performed_by = 'aaaa0001-0000-0000-0000-000000000001'::UUID
  ),
  1,
  'T-13: DELETE en categories debe registrar old_data, new_data IS NULL y action = DELETE en audit_log.'
);

-- ============================================================================
-- 5. ASERCIONES TDD: ENDURECIMIENTO DE public.local_today(p_company_id UUID)
-- ============================================================================
-- Contrato exacto de error verificado en private.assert_company_role (20261016000002 líneas 256-282):
--   - SQLSTATE: 'P0001' (RAISE EXCEPTION por omisión en PL/pgSQL)
--   - Usuario que no es miembro activo de la empresa: 'El usuario no es un miembro activo de esta empresa.'
--   - Empresa inexistente: format('Empresa con ID %s no encontrada.', p_company_id)

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0001-0000-0000-0000-000000000001';
SET LOCAL "request.jwt.claim.email" = 'admin_m1_a@stockly.local';

-- T-14: Negativo - Miembro de Empresa A NO puede consultar local_today de Empresa B
SELECT throws_ok(
  format('SELECT public.local_today(''%s''::UUID)', (SELECT id FROM test_ctx_22b_m1 WHERE key = 'comp_b')),
  'P0001',
  'El usuario no es un miembro activo de esta empresa.',
  'T-14: local_today(comp_b) invocado por miembro de comp_a debe fallar con P0001 y mensaje exacto de assert_company_role.'
);

-- T-15: Negativo - Empresa inexistente en local_today debe fallar con P0001 y mensaje exacto
SELECT throws_ok(
  'SELECT public.local_today(''00000000-0000-0000-0000-000000000000''::UUID)',
  'P0001',
  'Empresa con ID 00000000-0000-0000-0000-000000000000 no encontrada.',
  'T-15: local_today con UUID inexistente debe fallar con P0001 y mensaje exacto de assert_company_role.'
);

-- T-16: Positivo - Miembro activo de Empresa A obtiene la fecha local de su empresa
SELECT is(
  public.local_today((SELECT id FROM test_ctx_22b_m1 WHERE key = 'comp_a')),
  (pg_catalog.now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::DATE,
  'T-16: local_today(comp_a) invocado por miembro activo de comp_a debe retornar la fecha local en Buenos Aires.'
);

SELECT * FROM finish();

ROLLBACK;
