-- ============================================================================
-- SUITE DE PRUEBAS (pgTAP) - PRODUCTOS CON MOVIMIENTOS (Hallazgo H-02)
-- Módulo: public.products_with_movements
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
-- Estado: SUITE AISLADA E INDEPENDIENTE (Transacción con ROLLBACK)
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(5);

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
-- 2. SETUP: Empresa A (admin + empleado) con un producto con historia y otro sin;
--    Empresa B con un producto con historia
-- ============================================================================
INSERT INTO auth.users (id, email) VALUES
  ('aaaa0014-0000-0000-0000-000000000001', 'admin_pwm_a@stockly.local'),
  ('aaaa0014-0000-0000-0000-000000000002', 'empleado_pwm_a@stockly.local'),
  ('aaaa0014-0000-0000-0000-000000000003', 'admin_pwm_b@stockly.local');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0014-0000-0000-0000-000000000001';
SELECT public.create_company('Empresa PWM Alpha', NULL) AS comp_a \gset
SELECT public.invite_user_to_company(:'comp_a', 'empleado_pwm_a@stockly.local', 'employee') AS tok_emp \gset

SET LOCAL "request.jwt.claim.sub" = 'aaaa0014-0000-0000-0000-000000000002';
SELECT public.accept_company_invitation(:'tok_emp');

SET LOCAL "request.jwt.claim.sub" = 'aaaa0014-0000-0000-0000-000000000003';
SELECT public.create_company('Empresa PWM Beta', NULL) AS comp_b \gset

RESET ROLE;

INSERT INTO public.products (company_id, sku, name, selling_price)
VALUES (:'comp_a', 'PWM-A-HIST', 'Con historia A', 10) RETURNING id AS prod_hist \gset
INSERT INTO public.products (company_id, sku, name, selling_price)
VALUES (:'comp_a', 'PWM-A-NUEVO', 'Sin historia A', 10) RETURNING id AS prod_new \gset
INSERT INTO public.products (company_id, sku, name, selling_price)
VALUES (:'comp_b', 'PWM-B-HIST', 'Con historia B', 10) RETURNING id AS prod_b \gset

INSERT INTO public.stock_movements (company_id, product_id, direction, reason, quantity, previous_stock, new_stock, created_by)
VALUES
  (:'comp_a', :'prod_hist', 'increase', 'initial_load', 5, 0, 0, 'aaaa0014-0000-0000-0000-000000000001'),
  (:'comp_b', :'prod_b', 'increase', 'initial_load', 5, 0, 0, 'aaaa0014-0000-0000-0000-000000000003');

-- ============================================================================
-- 3. ASERCIONES
-- ============================================================================

-- T-01: La función existe con la firma esperada
SELECT has_function(
  'public', 'products_with_movements', ARRAY['uuid', 'uuid[]'],
  'T-01: public.products_with_movements debe existir.'
);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0014-0000-0000-0000-000000000001';

-- T-02: Devuelve solo los productos con movimientos
SELECT set_eq(
  format('SELECT product_id FROM public.products_with_movements(%L, ARRAY[%L, %L]::UUID[])', :'comp_a', :'prod_hist', :'prod_new'),
  format('VALUES (%L::UUID)', :'prod_hist'),
  'T-02: Solo devuelve el producto que tiene movimientos.'
);

-- T-03: Un empleado también puede consultarla (lectura permitida por RLS)
SET LOCAL "request.jwt.claim.sub" = 'aaaa0014-0000-0000-0000-000000000002';
SELECT set_eq(
  format('SELECT product_id FROM public.products_with_movements(%L, ARRAY[%L]::UUID[])', :'comp_a', :'prod_hist'),
  format('VALUES (%L::UUID)', :'prod_hist'),
  'T-03: Un empleado activo obtiene el mismo resultado.'
);

-- T-04/T-05: No revela datos de otra empresa, ni pidiendo la empresa ajena ni mezclando ids
SET LOCAL "request.jwt.claim.sub" = 'aaaa0014-0000-0000-0000-000000000001';
SELECT is_empty(
  format('SELECT product_id FROM public.products_with_movements(%L, ARRAY[%L]::UUID[])', :'comp_b', :'prod_b'),
  'T-04: Consultar la empresa ajena no devuelve nada (RLS).'
);
SELECT is_empty(
  format('SELECT product_id FROM public.products_with_movements(%L, ARRAY[%L]::UUID[])', :'comp_a', :'prod_b'),
  'T-05: Un producto ajeno no aparece aunque tenga movimientos.'
);

RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
