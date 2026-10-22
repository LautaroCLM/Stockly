-- ============================================================================
-- SUITE DE PRUEBAS TDD (pgTAP) - TANDA 2.2B (MIGRACIÓN 3)
-- Módulo: Alcance de Idempotencia por Usuario (created_by) y Expiración TTL (expires_at)
--         en operation_idempotency, register_stock_adjustment e import_initial_stock
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
-- Estado: SUITE AISLADA E INDEPENDIENTE (Transacción con ROLLBACK)
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(12);

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
-- 2. SETUP INDEPENDIENTE: Empresa con dos master_admin y Productos de Prueba
-- ============================================================================
CREATE TEMP TABLE test_ctx_22b_m3 (
  key TEXT PRIMARY KEY,
  id UUID
);
GRANT SELECT, INSERT, UPDATE ON TABLE test_ctx_22b_m3 TO authenticated;

INSERT INTO auth.users (id, email) VALUES
  ('aaaa0003-0000-0000-0000-000000000001', 'admin1_m3_a@stockly.local'),
  ('aaaa0003-0000-0000-0000-000000000002', 'admin2_m3_a@stockly.local');

-- Crear Empresa A con admin1_m3_a (owner) e invitar a admin2_m3_a (master_admin secundario)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0003-0000-0000-0000-000000000001';
SET LOCAL "request.jwt.claim.email" = 'admin1_m3_a@stockly.local';

SELECT public.create_company('Empresa M3 Alpha', '30-71111111-1') AS comp_m3_a_id \gset
INSERT INTO test_ctx_22b_m3 VALUES ('comp_a', :'comp_m3_a_id');

SELECT public.invite_user_to_company(:'comp_m3_a_id', 'admin2_m3_a@stockly.local', 'master_admin') AS tok_admin2_m3 \gset

SET LOCAL "request.jwt.claim.sub" = 'aaaa0003-0000-0000-0000-000000000002';
SET LOCAL "request.jwt.claim.email" = 'admin2_m3_a@stockly.local';
SELECT public.accept_company_invitation(:'tok_admin2_m3');

RESET ROLE;

DO $$
DECLARE
  v_comp_a UUID := (SELECT id FROM test_ctx_22b_m3 WHERE key = 'comp_a');
  v_prod_adj UUID;
  v_prod_init_1 UUID;
  v_prod_init_2 UUID;
  v_prod_init_3 UUID;
BEGIN
  INSERT INTO public.products (company_id, sku, name, unit, selling_price, min_stock, current_stock)
  VALUES (v_comp_a, 'M3-ADJ-01', 'Producto Ajuste M3', 'unidad', 1000.00, 1.00, 10.00)
  RETURNING id INTO v_prod_adj;

  INSERT INTO public.products (company_id, sku, name, unit, selling_price, min_stock, current_stock)
  VALUES (v_comp_a, 'M3-INIT-01', 'Producto Carga Inicial 1', 'unidad', 500.00, 0.00, 0.00)
  RETURNING id INTO v_prod_init_1;

  INSERT INTO public.products (company_id, sku, name, unit, selling_price, min_stock, current_stock)
  VALUES (v_comp_a, 'M3-INIT-02', 'Producto Carga Inicial 2', 'unidad', 600.00, 0.00, 0.00)
  RETURNING id INTO v_prod_init_2;

  INSERT INTO public.products (company_id, sku, name, unit, selling_price, min_stock, current_stock)
  VALUES (v_comp_a, 'M3-INIT-03', 'Producto Carga Inicial 3', 'unidad', 700.00, 0.00, 0.00)
  RETURNING id INTO v_prod_init_3;

  INSERT INTO test_ctx_22b_m3 VALUES
    ('prod_adj', v_prod_adj),
    ('prod_init_1', v_prod_init_1),
    ('prod_init_2', v_prod_init_2),
    ('prod_init_3', v_prod_init_3);
END;
$$;

-- ============================================================================
-- 3. ASERCIONES TDD: ESQUEMA DE public.operation_idempotency (expires_at y UNIQUE)
-- ============================================================================

-- T-01: Existencia de la columna expires_at en public.operation_idempotency
SELECT has_column(
  'public',
  'operation_idempotency',
  'expires_at',
  'T-01: public.operation_idempotency debe poseer la columna expires_at.'
);

-- T-02: La columna expires_at debe ser NOT NULL
SELECT col_not_null(
  'public',
  'operation_idempotency',
  'expires_at',
  'T-02: public.operation_idempotency.expires_at debe ser NOT NULL.'
);

-- T-03: La restricción única uq_operation_idempotency debe incluir created_by
SELECT is(
  (
    SELECT array_agg(a.attname::TEXT ORDER BY array_position(c.conkey, a.attnum))
    FROM pg_catalog.pg_constraint c
    JOIN pg_catalog.pg_attribute a
      ON a.attrelid = c.conrelid
     AND a.attnum = ANY(c.conkey)
    WHERE c.conrelid = 'public.operation_idempotency'::regclass
      AND c.conname = 'uq_operation_idempotency'
      AND c.contype = 'u'
  ),
  ARRAY['company_id', 'created_by', 'operation_type', 'idempotency_key']::TEXT[],
  'T-03: uq_operation_idempotency debe tener alcance (company_id, created_by, operation_type, idempotency_key).'
);

-- ============================================================================
-- 4. ASERCIONES TDD: ALCANCE POR USUARIO Y TTL EN register_stock_adjustment
-- ============================================================================

-- Admin 1 ejecuta un ajuste (+5.00 -> stock 15.00) con la clave 11110000-...-0001
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0003-0000-0000-0000-000000000001';
SET LOCAL "request.jwt.claim.email" = 'admin1_m3_a@stockly.local';

SELECT public.register_stock_adjustment(
  (SELECT id FROM test_ctx_22b_m3 WHERE key = 'comp_a'),
  '11110000-0000-0000-0000-000000000001'::UUID,
  (SELECT id FROM test_ctx_22b_m3 WHERE key = 'prod_adj'),
  'increase',
  'physical_count',
  5.00,
  'Ajuste por Admin 1'
) AS dummy_m3_adj1 \gset

-- T-04: Admin 2 (distinto created_by en la misma empresa) usa el mismo UUID de idempotency_key con otros parámetros (+3.00)
SET LOCAL "request.jwt.claim.sub" = 'aaaa0003-0000-0000-0000-000000000002';
SET LOCAL "request.jwt.claim.email" = 'admin2_m3_a@stockly.local';

SELECT lives_ok(
  format(
    'SELECT public.register_stock_adjustment(''%s''::UUID, ''11110000-0000-0000-0000-000000000001''::UUID, ''%s''::UUID, ''increase'', ''physical_count'', 3.00, ''Ajuste por Admin 2'')',
    (SELECT id FROM test_ctx_22b_m3 WHERE key = 'comp_a'),
    (SELECT id FROM test_ctx_22b_m3 WHERE key = 'prod_adj')
  ),
  'T-04: Dos usuarios distintos de la misma empresa pueden usar el mismo idempotency_key en register_stock_adjustment sin colisionar.'
);

RESET ROLE;

-- T-05: El stock resultante debe reflejar ambos ajustes independientes (10.00 + 5.00 + 3.00 = 18.00)
SELECT is(
  (SELECT current_stock FROM public.products WHERE id = (SELECT id FROM test_ctx_22b_m3 WHERE key = 'prod_adj')),
  18.00,
  'T-05: El stock tras los ajustes independientes de Admin 1 y Admin 2 debe ser 18.00.'
);

-- T-06: El registro de idempotencia debe crearse con expires_at a 24 horas de created_at
-- Nota: Se accede vía to_jsonb(oi)->>'expires_at' para no abortar la consulta en fase roja si la columna aún no existe.
SELECT is(
  (
    SELECT
      ((pg_catalog.to_jsonb(oi)->>'expires_at')::TIMESTAMPTZ = oi.created_at + interval '24 hours')
    FROM public.operation_idempotency oi
    WHERE oi.company_id = (SELECT id FROM test_ctx_22b_m3 WHERE key = 'comp_a')
      AND oi.created_by = 'aaaa0003-0000-0000-0000-000000000001'::UUID
      AND oi.operation_type = 'stock_adjustment'
      AND oi.idempotency_key = '11110000-0000-0000-0000-000000000001'::UUID
  ),
  true,
  'T-06: La fila de operation_idempotency debe inicializar expires_at exactamente en created_at + 24 hours.'
);

-- Simular vencimiento (TTL expirado) de la clave de Admin 1 sin abortar en fase roja si la columna no existe aún
DO $$
BEGIN
  EXECUTE format(
    'UPDATE public.operation_idempotency SET expires_at = pg_catalog.now() - interval ''1 minute'' WHERE company_id = %L::UUID AND created_by = ''aaaa0003-0000-0000-0000-000000000001''::UUID AND operation_type = ''stock_adjustment'' AND idempotency_key = ''11110000-0000-0000-0000-000000000001''::UUID',
    (SELECT id FROM test_ctx_22b_m3 WHERE key = 'comp_a')
  );
EXCEPTION
  WHEN undefined_column THEN
    NULL;
END;
$$;

-- T-07: Admin 1 reutiliza la misma clave una vez vencida con nuevos parámetros (+2.00) -> debe purgar la vencida y ejecutar
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0003-0000-0000-0000-000000000001';
SET LOCAL "request.jwt.claim.email" = 'admin1_m3_a@stockly.local';

SELECT lives_ok(
  format(
    'SELECT public.register_stock_adjustment(''%s''::UUID, ''11110000-0000-0000-0000-000000000001''::UUID, ''%s''::UUID, ''increase'', ''physical_count'', 2.00, ''Nuevo ajuste tras expiración TTL'')',
    (SELECT id FROM test_ctx_22b_m3 WHERE key = 'comp_a'),
    (SELECT id FROM test_ctx_22b_m3 WHERE key = 'prod_adj')
  ),
  'T-07: Una clave de idempotencia expirada (expires_at <= now()) en register_stock_adjustment debe ser reemplazada permitiendo nueva ejecución.'
);

RESET ROLE;

-- T-08: El stock debe actualizarse a 20.00 (18.00 + 2.00) y la fila renovada debe tener expires_at > now()
SELECT is(
  (
    SELECT count(*)::INT
    FROM public.products p
    JOIN public.operation_idempotency oi
      ON oi.company_id = p.company_id
    WHERE p.id = (SELECT id FROM test_ctx_22b_m3 WHERE key = 'prod_adj')
      AND p.current_stock = 20.00
      AND oi.created_by = 'aaaa0003-0000-0000-0000-000000000001'::UUID
      AND oi.operation_type = 'stock_adjustment'
      AND oi.idempotency_key = '11110000-0000-0000-0000-000000000001'::UUID
      AND ((pg_catalog.to_jsonb(oi)->>'expires_at')::TIMESTAMPTZ > pg_catalog.now())
  ),
  1,
  'T-08: Tras reutilizar una clave expirada en register_stock_adjustment, el stock debe ser 20.00 y expires_at renovarse en el futuro.'
);

-- ============================================================================
-- 5. ASERCIONES TDD: ALCANCE POR USUARIO Y TTL EN import_initial_stock
-- ============================================================================

-- Admin 1 ejecuta carga inicial sobre prod_init_1 (10 unidades) con la clave 22220000-...-0002
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0003-0000-0000-0000-000000000001';
SET LOCAL "request.jwt.claim.email" = 'admin1_m3_a@stockly.local';

SELECT public.import_initial_stock(
  (SELECT id FROM test_ctx_22b_m3 WHERE key = 'comp_a'),
  '22220000-0000-0000-0000-000000000002'::UUID,
  jsonb_build_array(
    jsonb_build_object(
      'product_id', (SELECT id FROM test_ctx_22b_m3 WHERE key = 'prod_init_1'),
      'quantity', 10.00,
      'unit_cost', 100.00
    )
  )
) AS dummy_m3_init1 \gset

-- T-09: Admin 2 usa la misma clave 22220000-...-0002 para cargar prod_init_2 (25 unidades)
SET LOCAL "request.jwt.claim.sub" = 'aaaa0003-0000-0000-0000-000000000002';
SET LOCAL "request.jwt.claim.email" = 'admin2_m3_a@stockly.local';

SELECT lives_ok(
  format(
    'SELECT public.import_initial_stock(''%s''::UUID, ''22220000-0000-0000-0000-000000000002''::UUID, ''[{"product_id": "%s", "quantity": 25.00, "unit_cost": 200.00}]''::JSONB)',
    (SELECT id FROM test_ctx_22b_m3 WHERE key = 'comp_a'),
    (SELECT id FROM test_ctx_22b_m3 WHERE key = 'prod_init_2')
  ),
  'T-09: Dos usuarios distintos de la misma empresa pueden usar el mismo idempotency_key en import_initial_stock sin colisionar.'
);

RESET ROLE;

-- T-10: El stock de prod_init_2 debe ser 25.00
SELECT is(
  (SELECT current_stock FROM public.products WHERE id = (SELECT id FROM test_ctx_22b_m3 WHERE key = 'prod_init_2')),
  25.00,
  'T-10: El stock de prod_init_2 tras la carga inicial de Admin 2 debe ser 25.00.'
);

-- Simular vencimiento (TTL expirado) de la clave initial_load de Admin 1
DO $$
BEGIN
  EXECUTE format(
    'UPDATE public.operation_idempotency SET expires_at = pg_catalog.now() - interval ''1 minute'' WHERE company_id = %L::UUID AND created_by = ''aaaa0003-0000-0000-0000-000000000001''::UUID AND operation_type = ''initial_load'' AND idempotency_key = ''22220000-0000-0000-0000-000000000002''::UUID',
    (SELECT id FROM test_ctx_22b_m3 WHERE key = 'comp_a')
  );
EXCEPTION
  WHEN undefined_column THEN
    NULL;
END;
$$;

-- T-11: Admin 1 reutiliza la clave expirada 22220000-...-0002 para cargar prod_init_3 (40 unidades)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0003-0000-0000-0000-000000000001';
SET LOCAL "request.jwt.claim.email" = 'admin1_m3_a@stockly.local';

SELECT lives_ok(
  format(
    'SELECT public.import_initial_stock(''%s''::UUID, ''22220000-0000-0000-0000-000000000002''::UUID, ''[{"product_id": "%s", "quantity": 40.00, "unit_cost": 300.00}]''::JSONB)',
    (SELECT id FROM test_ctx_22b_m3 WHERE key = 'comp_a'),
    (SELECT id FROM test_ctx_22b_m3 WHERE key = 'prod_init_3')
  ),
  'T-11: Una clave de idempotencia expirada en import_initial_stock debe ser reemplazada permitiendo nueva ejecución.'
);

RESET ROLE;

-- T-12: El stock de prod_init_3 debe ser 40.00 y la fila renovada debe tener expires_at > now()
SELECT is(
  (
    SELECT count(*)::INT
    FROM public.products p
    JOIN public.operation_idempotency oi
      ON oi.company_id = p.company_id
    WHERE p.id = (SELECT id FROM test_ctx_22b_m3 WHERE key = 'prod_init_3')
      AND p.current_stock = 40.00
      AND oi.created_by = 'aaaa0003-0000-0000-0000-000000000001'::UUID
      AND oi.operation_type = 'initial_load'
      AND oi.idempotency_key = '22220000-0000-0000-0000-000000000002'::UUID
      AND ((pg_catalog.to_jsonb(oi)->>'expires_at')::TIMESTAMPTZ > pg_catalog.now())
  ),
  1,
  'T-12: Tras reutilizar una clave expirada en import_initial_stock, prod_init_3 debe tener stock 40.00 y expires_at renovado.'
);

SELECT * FROM finish();

ROLLBACK;
