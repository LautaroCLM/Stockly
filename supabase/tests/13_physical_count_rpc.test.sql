-- ============================================================================
-- SUITE DE PRUEBAS (pgTAP) - CONTEO FÍSICO CON VALOR ABSOLUTO (Hallazgo H-05)
-- Módulo: public.register_physical_count
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
-- 2. SETUP: Empresa A (admin + empleado), Empresa B (admin) y productos
-- ============================================================================
CREATE TEMP TABLE test_ctx_pc (
  key TEXT PRIMARY KEY,
  id UUID
);
GRANT SELECT, INSERT, UPDATE ON TABLE test_ctx_pc TO authenticated;

INSERT INTO auth.users (id, email) VALUES
  ('aaaa0013-0000-0000-0000-000000000001', 'admin_pc_a@stockly.local'),
  ('aaaa0013-0000-0000-0000-000000000002', 'empleado_pc_a@stockly.local'),
  ('aaaa0013-0000-0000-0000-000000000003', 'admin_pc_b@stockly.local');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0013-0000-0000-0000-000000000001';
SELECT public.create_company('Empresa PC Alpha', NULL) AS comp_pc_a \gset
SELECT public.invite_user_to_company(:'comp_pc_a', 'empleado_pc_a@stockly.local', 'employee') AS tok_emp_pc \gset

SET LOCAL "request.jwt.claim.sub" = 'aaaa0013-0000-0000-0000-000000000002';
SELECT public.accept_company_invitation(:'tok_emp_pc');

SET LOCAL "request.jwt.claim.sub" = 'aaaa0013-0000-0000-0000-000000000003';
SELECT public.create_company('Empresa PC Beta', NULL) AS comp_pc_b \gset

RESET ROLE;

INSERT INTO test_ctx_pc VALUES ('comp_a', :'comp_pc_a'), ('comp_b', :'comp_pc_b');

DO $$
DECLARE
  v_comp_a UUID := (SELECT id FROM test_ctx_pc WHERE key = 'comp_a');
  v_comp_b UUID := (SELECT id FROM test_ctx_pc WHERE key = 'comp_b');
  v_id UUID;
BEGIN
  INSERT INTO public.products (company_id, sku, name, unit, selling_price, current_stock)
  VALUES (v_comp_a, 'PC-UNI-01', 'Tornillo PC', 'unidad', 100.00, 10.00) RETURNING id INTO v_id;
  INSERT INTO test_ctx_pc VALUES ('prod_uni', v_id);

  INSERT INTO public.products (company_id, sku, name, unit, selling_price, current_stock)
  VALUES (v_comp_a, 'PC-KG-01', 'Clavos a granel PC', 'kg', 2500.00, 5.50) RETURNING id INTO v_id;
  INSERT INTO test_ctx_pc VALUES ('prod_kg', v_id);

  INSERT INTO public.products (company_id, sku, name, unit, selling_price, current_stock)
  VALUES (v_comp_b, 'PC-B-01', 'Producto Beta PC', 'unidad', 100.00, 50.00) RETURNING id INTO v_id;
  INSERT INTO test_ctx_pc VALUES ('prod_b', v_id);
END;
$$;

SELECT id AS prod_uni FROM test_ctx_pc WHERE key = 'prod_uni' \gset
SELECT id AS prod_kg FROM test_ctx_pc WHERE key = 'prod_kg' \gset
SELECT id AS prod_b FROM test_ctx_pc WHERE key = 'prod_b' \gset

-- ============================================================================
-- 3. ASERCIONES
-- ============================================================================

-- T-01: La función existe con la firma esperada
SELECT has_function(
  'public', 'register_physical_count',
  ARRAY['uuid', 'uuid', 'uuid', 'numeric', 'text', 'text'],
  'T-01: public.register_physical_count debe existir.'
);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0013-0000-0000-0000-000000000001';

-- T-02/T-03: Conteo mayor al stock (10 -> 14) fija el valor contado con entrada de 4
SELECT public.register_physical_count(:'comp_pc_a', 'bbbb0013-0000-0000-0000-000000000001', :'prod_uni', 14) AS res_up \gset
SELECT is((SELECT current_stock FROM public.products WHERE id = :'prod_uni'), 14.00::NUMERIC(12, 2),
  'T-02: Conteo mayor deja current_stock igual al valor contado.');
SELECT is(
  (SELECT direction || ':' || quantity::TEXT FROM public.stock_movements
   WHERE product_id = :'prod_uni' ORDER BY created_at DESC, id DESC LIMIT 1),
  'increase:4.00',
  'T-03: Conteo mayor registra un movimiento increase por la diferencia.');

-- T-04: Replay con la misma clave devuelve el mismo payload sin nuevo movimiento
SELECT is(
  public.register_physical_count(:'comp_pc_a', 'bbbb0013-0000-0000-0000-000000000001', :'prod_uni', 14),
  :'res_up'::JSONB,
  'T-04: Reintento con la misma clave devuelve el payload original.');
SELECT is((SELECT count(*)::INT FROM public.stock_movements WHERE product_id = :'prod_uni'), 1,
  'T-05: El reintento no registra un segundo movimiento.');

-- T-06: Misma clave con otro valor contado es rechazada
SELECT throws_like(
  format('SELECT public.register_physical_count(%L, %L, %L, 15)', :'comp_pc_a', 'bbbb0013-0000-0000-0000-000000000001', :'prod_uni'),
  '%Idempotency key mismatch%',
  'T-06: Reutilizar la clave con otro conteo es rechazado.');

-- T-07/T-08: Carrera: el usuario vio 14, se vendieron 3 (stock 11) y cuenta 12 -> stock final 12
RESET ROLE;
INSERT INTO public.stock_movements (company_id, product_id, direction, reason, quantity, previous_stock, new_stock, created_by)
VALUES (:'comp_pc_a', :'prod_uni', 'decrease', 'loss_damage', 3, 0, 0, 'aaaa0013-0000-0000-0000-000000000001');
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0013-0000-0000-0000-000000000001';

SELECT public.register_physical_count(:'comp_pc_a', 'bbbb0013-0000-0000-0000-000000000002', :'prod_uni', 12) AS res_race \gset
SELECT is((SELECT current_stock FROM public.products WHERE id = :'prod_uni'), 12.00::NUMERIC(12, 2),
  'T-07: Con una salida concurrente el stock final igual queda en el valor contado.');
SELECT is((:'res_race'::JSONB ->> 'previous_stock')::NUMERIC, 11.00::NUMERIC,
  'T-08: La diferencia se calcula contra el stock vigente (11), no contra el visto en pantalla (14).');

-- T-09/T-10: Conteo igual al stock no registra movimiento
SELECT public.register_physical_count(:'comp_pc_a', 'bbbb0013-0000-0000-0000-000000000003', :'prod_uni', 12) AS res_same \gset
SELECT is((:'res_same'::JSONB ->> 'no_change')::BOOLEAN, true,
  'T-09: Conteo igual al stock devuelve no_change = true.');
SELECT is((SELECT count(*)::INT FROM public.stock_movements WHERE product_id = :'prod_uni'), 3,
  'T-10: Conteo igual al stock no agrega movimientos.');

-- T-11: Conteo menor con decimales en unidad divisible (5,50 kg -> 2,2 kg)
SELECT public.register_physical_count(:'comp_pc_a', 'bbbb0013-0000-0000-0000-000000000004', :'prod_kg', 2.2);
SELECT is((SELECT current_stock FROM public.products WHERE id = :'prod_kg'), 2.20::NUMERIC(12, 2),
  'T-11: Conteo fraccionario válido en kg queda registrado (2,2 kg).');

-- T-12: Fracción en unidad indivisible es rechazada
SELECT throws_like(
  format('SELECT public.register_physical_count(%L, %L, %L, 3.5)', :'comp_pc_a', 'bbbb0013-0000-0000-0000-000000000005', :'prod_uni'),
  '%indivisible%',
  'T-12: Unidad indivisible no admite conteo fraccionario.');

-- T-13: Más de 2 decimales es rechazado
SELECT throws_like(
  format('SELECT public.register_physical_count(%L, %L, %L, 1.234)', :'comp_pc_a', 'bbbb0013-0000-0000-0000-000000000006', :'prod_kg'),
  '%2 decimales%',
  'T-13: Conteo con más de 2 decimales es rechazado.');

-- T-14: Conteo negativo es rechazado
SELECT throws_like(
  format('SELECT public.register_physical_count(%L, %L, %L, -1)', :'comp_pc_a', 'bbbb0013-0000-0000-0000-000000000007', :'prod_uni'),
  '%fuera de rango%',
  'T-14: Conteo negativo es rechazado.');

-- T-15: Producto de otra empresa no se encuentra (sin tocar su stock)
SELECT throws_like(
  format('SELECT public.register_physical_count(%L, %L, %L, 1)', :'comp_pc_a', 'bbbb0013-0000-0000-0000-000000000008', :'prod_b'),
  '%no encontrado%',
  'T-15: Un producto de otra empresa es rechazado.');

-- T-16: Un empleado no puede registrar conteos
SET LOCAL "request.jwt.claim.sub" = 'aaaa0013-0000-0000-0000-000000000002';
SELECT throws_like(
  format('SELECT public.register_physical_count(%L, %L, %L, 1)', :'comp_pc_a', 'bbbb0013-0000-0000-0000-000000000009', :'prod_uni'),
  '%No tenés permiso%',
  'T-16: Un empleado no puede registrar conteos físicos.');

RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
