-- ============================================================================
-- SUITE DE PRUEBAS (pgTAP) - MÁQUINAS
-- Módulo: machines (upsert_machine, machine_costs)
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
  ('aaaa0025-0000-0000-0000-000000000001', 'admin_mq_a@stockly.local'),
  ('aaaa0025-0000-0000-0000-000000000002', 'empleado_mq_a@stockly.local'),
  ('aaaa0025-0000-0000-0000-000000000003', 'admin_mq_b@stockly.local');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0025-0000-0000-0000-000000000001';
SELECT public.create_company('Empresa MQ Alpha', NULL) AS comp_a \gset
SELECT public.invite_user_to_company(:'comp_a', 'empleado_mq_a@stockly.local', 'employee') AS tok_emp \gset
SET LOCAL "request.jwt.claim.sub" = 'aaaa0025-0000-0000-0000-000000000002';
SELECT public.accept_company_invitation(:'tok_emp');
SET LOCAL "request.jwt.claim.sub" = 'aaaa0025-0000-0000-0000-000000000003';
SELECT public.create_company('Empresa MQ Beta', NULL) AS comp_b \gset
SELECT public.upsert_machine(:'comp_b', NULL, 'Camión de B', 'camion', NULL, NULL, NULL, NULL, 'active', NULL) AS mach_b \gset

-- 1. El empleado no gestiona máquinas
SET LOCAL "request.jwt.claim.sub" = 'aaaa0025-0000-0000-0000-000000000002';
SELECT throws_like(
  format($q$SELECT public.upsert_machine(%L, NULL, 'X', 'camion', NULL, NULL, NULL, NULL, 'active', NULL)$q$, :'comp_a'),
  '%No tenés permiso%', 'T-01 el empleado no crea máquinas');

-- 2. El admin crea y edita
SET LOCAL "request.jwt.claim.sub" = 'aaaa0025-0000-0000-0000-000000000001';
SELECT public.upsert_machine(:'comp_a', NULL, 'Retro 01', 'retroexcavadora', 'AB123CD', 'Case', '580N', 2019, 'active', 'Obra norte') AS mach \gset
SELECT is((SELECT name || '|' || machine_type || '|' || model_year FROM public.machines WHERE id = :'mach'), 'Retro 01|retroexcavadora|2019', 'T-02 el admin crea una máquina');
SELECT public.upsert_machine(:'comp_a', :'mach', 'Retro 01', 'retroexcavadora', 'AB123CD', 'Case', '580N', 2019, 'in_repair', 'En taller');
SELECT is((SELECT status FROM public.machines WHERE id = :'mach'), 'in_repair', 'T-03 el admin edita el estado');
SELECT public.upsert_machine(:'comp_a', :'mach', 'Retro 01', 'retroexcavadora', 'AB123CD', 'Case', '580N', 2019, 'active', NULL);

-- 4. Nombre repetido (sin distinguir mayúsculas)
SELECT throws_ok(
  format($q$SELECT public.upsert_machine(%L, NULL, 'retro 01', 'camion', NULL, NULL, NULL, NULL, 'active', NULL)$q$, :'comp_a'),
  NULL, 'Ya existe una máquina con ese nombre.', 'T-04 nombre repetido rechazado');

-- 5. Estado inválido
SELECT throws_ok(
  format($q$SELECT public.upsert_machine(%L, NULL, 'Otra', 'camion', NULL, NULL, NULL, NULL, 'roto', NULL)$q$, :'comp_a'),
  NULL, 'Estado de máquina inválido.', 'T-05 estado inválido rechazado');

-- 6. Costos: combustible 1000 + repuestos 500 + servicios 100; el anulado no cuenta
SELECT public.create_expense(:'comp_a', CURRENT_DATE, 'combustible', 'Nafta', 1000, 'transferencia', NULL, false, :'mach');
SELECT public.create_expense(:'comp_a', CURRENT_DATE, 'repuestos', 'Filtros', 500.50, 'transferencia', NULL, false, :'mach');
SELECT public.create_expense(:'comp_a', CURRENT_DATE, 'servicios', 'Seguro', 100, 'transferencia', NULL, false, :'mach');
SELECT (public.create_expense(:'comp_a', CURRENT_DATE, 'combustible', 'Error', 9999, 'transferencia', NULL, false, :'mach') ->> 'expense_id') AS exp_void \gset
SELECT public.void_expense(:'comp_a', :'exp_void', 'Error de carga');
SELECT is(
  (SELECT fuel_total || '|' || maintenance_total || '|' || other_total || '|' || total || '|' || expenses_count
   FROM public.machine_costs(:'comp_a', CURRENT_DATE - 1, CURRENT_DATE) WHERE machine_id = :'mach'),
  '1000.00|500.50|100.00|1600.50|3', 'T-06 costos por máquina sin gastos anulados');

-- 7. Período sin gastos
SELECT is(
  (SELECT total FROM public.machine_costs(:'comp_a', CURRENT_DATE - 60, CURRENT_DATE - 30) WHERE machine_id = :'mach'),
  0.00::NUMERIC, 'T-07 un período sin gastos da total 0');

-- 8. La máquina de otra empresa no se puede usar
SELECT throws_ok(
  format($q$SELECT public.create_expense(%L, CURRENT_DATE, 'otros', 'x', 10, 'transferencia', NULL, false, %L)$q$, :'comp_a', :'mach_b'),
  NULL, 'La máquina no pertenece a esta empresa.', 'T-08 máquina de otra empresa rechazada');

-- 9. Una máquina inactiva no admite gastos nuevos
SELECT public.upsert_machine(:'comp_a', :'mach', 'Retro 01', 'retroexcavadora', 'AB123CD', 'Case', '580N', 2019, 'inactive', NULL);
SELECT throws_ok(
  format($q$SELECT public.create_expense(%L, CURRENT_DATE, 'otros', 'x', 10, 'transferencia', NULL, false, %L)$q$, :'comp_a', :'mach'),
  NULL, 'La máquina está inactiva: reactivala para cargarle gastos.', 'T-09 máquina inactiva sin gastos nuevos');

-- 10. Sin borrado
SELECT throws_ok(format($q$DELETE FROM public.machines WHERE id = %L$q$, :'mach'), NULL, NULL, 'T-10 las máquinas no se borran');

-- 11. El gasto con máquina conserva el vínculo al leerlo
SELECT is((SELECT count(*) FROM public.expenses WHERE machine_id = :'mach'), 4::BIGINT, 'T-11 los gastos quedan vinculados a la máquina');

-- 12. El empleado no ve máquinas ni sus costos
SET LOCAL "request.jwt.claim.sub" = 'aaaa0025-0000-0000-0000-000000000002';
SELECT is((SELECT count(*) FROM public.machines), 0::BIGINT, 'T-12 el empleado no ve las máquinas');
SELECT throws_like(format('SELECT * FROM public.machine_costs(%L, CURRENT_DATE - 1, CURRENT_DATE)', :'comp_a'), '%No tenés permiso%', 'T-13 el empleado no ve costos');

-- 14. Aislamiento: el admin de B no ve las máquinas de A
SET LOCAL "request.jwt.claim.sub" = 'aaaa0025-0000-0000-0000-000000000003';
SELECT is((SELECT string_agg(name, ',') FROM public.machines), 'Camión de B', 'T-14 cada empresa ve solo sus máquinas');

SELECT * FROM finish();
ROLLBACK;
