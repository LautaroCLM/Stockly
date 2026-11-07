-- ============================================================================
-- SUITE DE PRUEBAS (pgTAP) - GASTOS
-- Módulo: expenses (create_expense, void_expense)
-- Estado: SUITE AISLADA E INDEPENDIENTE (Transacción con ROLLBACK)
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(14);

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
  ('aaaa0022-0000-0000-0000-000000000001', 'admin_ex_a@stockly.local'),
  ('aaaa0022-0000-0000-0000-000000000002', 'empleado_ex_a@stockly.local'),
  ('aaaa0022-0000-0000-0000-000000000003', 'admin_ex_b@stockly.local');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0022-0000-0000-0000-000000000001';
SELECT public.create_company('Empresa EX Alpha', NULL) AS comp_a \gset
SELECT public.invite_user_to_company(:'comp_a', 'empleado_ex_a@stockly.local', 'employee') AS tok_emp \gset
SET LOCAL "request.jwt.claim.sub" = 'aaaa0022-0000-0000-0000-000000000002';
SELECT public.accept_company_invitation(:'tok_emp');
SET LOCAL "request.jwt.claim.sub" = 'aaaa0022-0000-0000-0000-000000000003';
SELECT public.create_company('Empresa EX Beta', NULL) AS comp_b \gset

-- 1. El empleado no puede registrar gastos
SET LOCAL "request.jwt.claim.sub" = 'aaaa0022-0000-0000-0000-000000000002';
SELECT throws_ok(
  format($q$SELECT public.create_expense(%L, current_date, 'otros', 'x', 10, 'transferencia', NULL, false)$q$, :'comp_a'),
  NULL, NULL, 'T-01 el empleado no puede registrar gastos');

-- 2. Admin registra un gasto por transferencia
SET LOCAL "request.jwt.claim.sub" = 'aaaa0022-0000-0000-0000-000000000001';
SELECT (public.create_expense(:'comp_a', current_date, 'servicios', 'Luz', 1500.50, 'transferencia', NULL, false) ->> 'expense_id') AS exp1 \gset
SELECT is((SELECT amount FROM public.expenses WHERE id = :'exp1'), 1500.50::NUMERIC, 'T-02 el gasto queda registrado con su importe exacto');

-- 3. Importe inválido, fecha futura y categoría inválida
SELECT throws_ok(
  format($q$SELECT public.create_expense(%L, current_date, 'otros', 'x', 0, 'transferencia', NULL, false)$q$, :'comp_a'),
  NULL, NULL, 'T-03 importe cero rechazado');
SELECT throws_ok(
  format($q$SELECT public.create_expense(%L, current_date + 2, 'otros', 'x', 5, 'transferencia', NULL, false)$q$, :'comp_a'),
  NULL, NULL, 'T-04 fecha futura rechazada');

-- 5. Pagar desde caja sin caja abierta falla
SELECT throws_ok(
  format($q$SELECT public.create_expense(%L, current_date, 'combustible', 'Nafta', 200, 'efectivo', NULL, true)$q$, :'comp_a'),
  NULL, 'No hay una caja abierta: abrila para pagar este gasto desde la caja.', 'T-05 sin caja abierta no se paga desde caja');

-- 6. Con caja abierta, el gasto retira efectivo
SELECT public.open_cash_session(:'comp_a', 1000, NULL);
SELECT (public.create_expense(:'comp_a', current_date, 'combustible', 'Nafta', 200, 'efectivo', NULL, true) ->> 'expense_id') AS exp2 \gset
SELECT is((SELECT (public.cash_session_summary(:'comp_a', (SELECT id FROM public.cash_sessions WHERE company_id = :'comp_a' AND status = 'open')) ->> 'expected_amount')::NUMERIC), 800.00::NUMERIC, 'T-06 el gasto en efectivo descuenta de la caja');

-- 7. No se puede pagar de caja un gasto que no es en efectivo
SELECT throws_ok(
  format($q$SELECT public.create_expense(%L, current_date, 'otros', 'x', 5, 'transferencia', NULL, true)$q$, :'comp_a'),
  NULL, 'Solo un gasto en efectivo puede salir de la caja.', 'T-07 solo efectivo sale de la caja');

-- 8. Anular devuelve el efectivo a la caja abierta
SELECT public.void_expense(:'comp_a', :'exp2', 'Error de carga');
SELECT is((SELECT (public.cash_session_summary(:'comp_a', (SELECT id FROM public.cash_sessions WHERE company_id = :'comp_a' AND status = 'open')) ->> 'expected_amount')::NUMERIC), 1000.00::NUMERIC, 'T-08 anular devuelve el efectivo a la caja');

-- 9. No se anula dos veces ni sin motivo
SELECT throws_ok(format($q$SELECT public.void_expense(%L, %L, 'otra vez')$q$, :'comp_a', :'exp2'), NULL, 'Este gasto ya está anulado.', 'T-09 no se anula dos veces');
SELECT throws_ok(format($q$SELECT public.void_expense(%L, %L, '  ')$q$, :'comp_a', :'exp1'), NULL, 'Indicá el motivo de la anulación.', 'T-10 anular exige motivo');

-- 11. Otra empresa no puede anular ni ver el gasto
SET LOCAL "request.jwt.claim.sub" = 'aaaa0022-0000-0000-0000-000000000003';
SELECT throws_ok(format($q$SELECT public.void_expense(%L, %L, 'x')$q$, :'comp_b', :'exp1'), NULL, 'Gasto no encontrado en esta empresa.', 'T-11 aislamiento entre empresas al anular');
SELECT is((SELECT count(*) FROM public.expenses), 0::BIGINT, 'T-12 la otra empresa no ve gastos ajenos');

-- 13. El empleado no ve los gastos
SET LOCAL "request.jwt.claim.sub" = 'aaaa0022-0000-0000-0000-000000000002';
SELECT is((SELECT count(*) FROM public.expenses), 0::BIGINT, 'T-13 el empleado no ve los gastos');

-- 14. Sin escritura directa
SET LOCAL "request.jwt.claim.sub" = 'aaaa0022-0000-0000-0000-000000000001';
SELECT throws_ok(format($q$DELETE FROM public.expenses WHERE id = %L$q$, :'exp1'), NULL, NULL, 'T-14 no hay borrado directo');

SELECT * FROM finish();
ROLLBACK;
