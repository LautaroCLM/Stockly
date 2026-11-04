-- ============================================================================
-- SUITE DE PRUEBAS (pgTAP) - CAJA DIARIA
-- Módulo: cash_sessions, cash_movements y sus RPC
-- Estado: SUITE AISLADA E INDEPENDIENTE (Transacción con ROLLBACK)
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(22);

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
-- 2. SETUP: Empresa A (admin + empleado) y Empresa B (otro admin)
-- ============================================================================
INSERT INTO auth.users (id, email) VALUES
  ('aaaa0020-0000-0000-0000-000000000001', 'admin_caja_a@stockly.local'),
  ('aaaa0020-0000-0000-0000-000000000002', 'empleado_caja_a@stockly.local'),
  ('aaaa0020-0000-0000-0000-000000000003', 'admin_caja_b@stockly.local');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0020-0000-0000-0000-000000000001';
SELECT public.create_company('Empresa Caja Alpha', NULL) AS comp_a \gset
SELECT public.invite_user_to_company(:'comp_a', 'empleado_caja_a@stockly.local', 'employee') AS tok_emp \gset
SET LOCAL "request.jwt.claim.sub" = 'aaaa0020-0000-0000-0000-000000000002';
SELECT public.accept_company_invitation(:'tok_emp');
SET LOCAL "request.jwt.claim.sub" = 'aaaa0020-0000-0000-0000-000000000003';
SELECT public.create_company('Empresa Caja Beta', NULL) AS comp_b \gset
RESET ROLE;

-- ============================================================================
-- 3. APERTURA
-- ============================================================================
SELECT has_table('public', 'cash_sessions', 'T-01: existe public.cash_sessions.');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0020-0000-0000-0000-000000000002';
SELECT (public.open_cash_session(:'comp_a', 1000.00, 'Turno mañana') ->> 'session_id') AS session_a \gset
SELECT isnt(:'session_a'::TEXT, NULL::TEXT, 'T-02: un empleado puede abrir la caja.');

SELECT throws_like(
  format('SELECT public.open_cash_session(%L, 500, NULL)', :'comp_a'),
  '%Ya hay una caja abierta%',
  'T-03: no se puede abrir una segunda caja en la misma empresa.');

SELECT throws_like(
  format('SELECT public.open_cash_session(%L, -1, NULL)', :'comp_b'),
  '%miembro activo%',
  'T-04: no se puede abrir caja en una empresa ajena.');

SET LOCAL "request.jwt.claim.sub" = 'aaaa0020-0000-0000-0000-000000000003';
SELECT throws_like(
  format('SELECT public.open_cash_session(%L, 10.555, NULL)', :'comp_b'),
  '%dos decimales%',
  'T-05: el fondo inicial admite como máximo dos decimales.');
RESET ROLE;

-- ============================================================================
-- 4. VENTAS DEL TURNO (insertadas como postgres con fechas controladas)
-- ============================================================================

-- Venta en efectivo dentro del turno
INSERT INTO public.sales (company_id, sale_number, subtotal, total_amount, payments, created_by, created_at)
VALUES (:'comp_a', 'CJ-1', 300.50, 300.50, '[{"method": "efectivo", "amount": 300.50}]', 'aaaa0020-0000-0000-0000-000000000002', now());
-- Venta mixta: parte efectivo, parte transferencia
INSERT INTO public.sales (company_id, sale_number, subtotal, total_amount, payments, created_by, created_at)
VALUES (:'comp_a', 'CJ-2', 500, 500, '[{"method": "efectivo", "amount": 200}, {"method": "transferencia", "amount": 300}]', 'aaaa0020-0000-0000-0000-000000000002', now());
-- Venta de otra empresa: no cuenta
INSERT INTO public.sales (company_id, sale_number, subtotal, total_amount, payments, created_by, created_at)
VALUES (:'comp_b', 'CJ-B', 999, 999, '[{"method": "efectivo", "amount": 999}]', 'aaaa0020-0000-0000-0000-000000000003', now());
-- Venta anterior a la apertura, anulada durante el turno: se devuelve el efectivo desde esta caja
INSERT INTO public.sales (company_id, sale_number, status, subtotal, total_amount, payments, created_by, created_at, cancelled_at, cancelled_by, cancel_reason)
VALUES (:'comp_a', 'CJ-0', 'cancelled', 80, 80, '[{"method": "efectivo", "amount": 80}]', 'aaaa0020-0000-0000-0000-000000000001',
        now() - interval '2 days', now(), 'aaaa0020-0000-0000-0000-000000000001', 'Devolución');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0020-0000-0000-0000-000000000002';

SELECT is(
  (SELECT (s ->> 'cash_sales_amount') || '|' || (s ->> 'cash_refunds_amount') || '|' || (s ->> 'expected_amount')
   FROM public.cash_session_summary(:'comp_a', :'session_a') AS s),
  '500.50|80.00|1420.50',
  'T-06: esperado = fondo 1000 + efectivo 500.50 (incluye la parte en efectivo de la venta mixta) - devolución 80.');

SELECT is(
  (SELECT s -> 'other_payments' ->> 'transferencia' FROM public.cash_session_summary(:'comp_a', :'session_a') AS s),
  '300.00',
  'T-07: los cobros por transferencia se informan aparte y no suman al cajón.');

-- ============================================================================
-- 5. INGRESOS Y RETIROS
-- ============================================================================
SELECT lives_ok(
  format('SELECT public.register_cash_movement(%L, %L, %L, 100, %L)', :'comp_a', :'session_a', 'in', 'Cambio en monedas'),
  'T-08: se puede registrar un ingreso de efectivo.');

SELECT lives_ok(
  format('SELECT public.register_cash_movement(%L, %L, %L, 520.50, %L)', :'comp_a', :'session_a', 'out', 'Retiro a caja fuerte'),
  'T-09: se puede registrar un retiro de efectivo.');

SELECT throws_like(
  format('SELECT public.register_cash_movement(%L, %L, %L, 1000.01, %L)', :'comp_a', :'session_a', 'out', 'Demasiado'),
  '%No se puede retirar más efectivo%',
  'T-10: un retiro no puede superar el efectivo esperado (1000.00).');

SELECT throws_like(
  format('SELECT public.register_cash_movement(%L, %L, %L, 10, %L)', :'comp_a', :'session_a', 'out', '   '),
  '%motivo%',
  'T-11: un movimiento exige motivo.');

SELECT throws_like(
  format('SELECT public.register_cash_movement(%L, %L, %L, 0, %L)', :'comp_a', :'session_a', 'in', 'Cero'),
  '%mayor a 0%',
  'T-12: un movimiento exige importe mayor a cero.');

SELECT is(
  (SELECT s ->> 'expected_amount' FROM public.cash_session_summary(:'comp_a', :'session_a') AS s),
  '1000.00',
  'T-13: esperado tras ingreso y retiro = 1420.50 + 100 - 520.50.');

-- ============================================================================
-- 6. AISLAMIENTO Y ESCRITURA DIRECTA
-- ============================================================================
SET LOCAL "request.jwt.claim.sub" = 'aaaa0020-0000-0000-0000-000000000003';
SELECT is(
  (SELECT count(*)::INT FROM public.cash_sessions WHERE company_id = :'comp_a'),
  0,
  'T-14: el admin de otra empresa no ve las cajas de la empresa A.');

SELECT throws_like(
  format('SELECT public.cash_session_summary(%L, %L)', :'comp_a', :'session_a'),
  '%miembro activo%',
  'T-15: el admin de otra empresa no puede pedir el resumen de la caja A.');

SET LOCAL "request.jwt.claim.sub" = 'aaaa0020-0000-0000-0000-000000000002';
SELECT throws_like(
  format('INSERT INTO public.cash_movements (company_id, session_id, movement_type, amount, reason, created_by) VALUES (%L, %L, %L, 1, %L, %L)',
         :'comp_a', :'session_a', 'in', 'directo', 'aaaa0020-0000-0000-0000-000000000002'),
  '%permission denied%',
  'T-16: no se puede insertar movimientos directamente (solo por RPC).');

-- ============================================================================
-- 7. CIERRE CON ARQUEO
-- ============================================================================
SELECT throws_like(
  format('SELECT public.close_cash_session(%L, %L, 990, NULL)', :'comp_a', :'session_a'),
  '%indicá una observación%',
  'T-17: cerrar con diferencia exige una observación.');

SELECT is(
  (SELECT r ->> 'difference_amount'
   FROM public.close_cash_session(:'comp_a', :'session_a', 990, 'Faltante de 10 en monedas') AS r),
  '-10.00',
  'T-18: el cierre calcula la diferencia contado - esperado (990 - 1000).');

SELECT is(
  (SELECT status || '|' || expected_amount || '|' || counted_amount FROM public.cash_sessions WHERE id = :'session_a'),
  'closed|1000.00|990.00',
  'T-19: la caja queda cerrada con la foto del arqueo.');

SELECT throws_like(
  format('SELECT public.register_cash_movement(%L, %L, %L, 5, %L)', :'comp_a', :'session_a', 'in', 'Tarde'),
  '%cerrada%',
  'T-20: una caja cerrada no admite movimientos.');

SELECT lives_ok(
  format('SELECT public.open_cash_session(%L, 0, NULL)', :'comp_a'),
  'T-21: después del cierre se puede abrir una caja nueva.');
RESET ROLE;

SELECT throws_like(
  format('UPDATE public.cash_sessions SET counted_amount = 5000 WHERE id = %L', :'session_a'),
  '%inmutables%',
  'T-22: una caja cerrada no se puede modificar ni siquiera como superusuario.');

SELECT * FROM finish();

ROLLBACK;
