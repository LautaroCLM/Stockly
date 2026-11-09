-- ============================================================================
-- SUITE DE PRUEBAS (pgTAP) - EMPLEADOS Y ASISTENCIA
-- Módulo: employees, schedules, attendance
-- Estado: SUITE AISLADA E INDEPENDIENTE (Transacción con ROLLBACK)
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(24);

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
  ('aaaa0026-0000-0000-0000-000000000001', 'admin_em_a@stockly.local'),
  ('aaaa0026-0000-0000-0000-000000000002', 'empleado_em_a@stockly.local'),
  ('aaaa0026-0000-0000-0000-000000000003', 'admin_em_b@stockly.local');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0026-0000-0000-0000-000000000001';
SELECT public.create_company('Empresa EM Alpha', NULL) AS comp_a \gset
SELECT public.invite_user_to_company(:'comp_a', 'empleado_em_a@stockly.local', 'employee') AS tok_emp \gset
SET LOCAL "request.jwt.claim.sub" = 'aaaa0026-0000-0000-0000-000000000002';
SELECT public.accept_company_invitation(:'tok_emp');
SET LOCAL "request.jwt.claim.sub" = 'aaaa0026-0000-0000-0000-000000000003';
SELECT public.create_company('Empresa EM Beta', NULL) AS comp_b \gset

-- 1. Un usuario con rol empleado no gestiona personal
SET LOCAL "request.jwt.claim.sub" = 'aaaa0026-0000-0000-0000-000000000002';
SELECT throws_like(
  format($q$SELECT public.upsert_employee(%L, NULL, 'X', NULL, NULL, NULL, NULL, 'active', NULL)$q$, :'comp_a'),
  '%master_admin%', 'T-01 el rol empleado no crea empleados');

-- 2. El admin crea empleados
SET LOCAL "request.jwt.claim.sub" = 'aaaa0026-0000-0000-0000-000000000001';
SELECT public.upsert_employee(:'comp_a', NULL, 'Juan Pérez', '30111222', 'Operario', '11-5555-0000', DATE '2024-03-01', 'active', NULL) AS emp \gset
SELECT public.upsert_employee(:'comp_a', NULL, 'Ana Gómez', NULL, 'Administrativa', NULL, NULL, 'active', NULL) AS emp2 \gset
SELECT is((SELECT full_name || '|' || job_title FROM public.employees WHERE id = :'emp'), 'Juan Pérez|Operario', 'T-02 el admin crea un empleado');

-- 3. Documento repetido
SELECT throws_ok(
  format($q$SELECT public.upsert_employee(%L, NULL, 'Otro', '30111222', NULL, NULL, NULL, 'active', NULL)$q$, :'comp_a'),
  NULL, 'Ya hay un empleado con ese documento.', 'T-03 documento repetido rechazado');

-- 4. Horario: lunes 08-12 y 14-18 (turno cortado)
SELECT is(public.set_employee_schedule(:'comp_a', :'emp', '[{"weekday":1,"start":"08:00","end":"12:00"},{"weekday":1,"start":"14:00","end":"18:00"}]'::JSONB), 2, 'T-04 se guarda un horario con turno cortado');
SELECT throws_ok(
  format($q$SELECT public.set_employee_schedule(%L, %L, '[{"weekday":2,"start":"08:00","end":"12:00"},{"weekday":2,"start":"11:00","end":"15:00"}]'::JSONB)$q$, :'comp_a', :'emp'),
  NULL, 'Hay bloques horarios que se superponen en un mismo día.', 'T-05 bloques superpuestos rechazados');
SELECT throws_ok(
  format($q$SELECT public.set_employee_schedule(%L, %L, '[{"weekday":2,"start":"18:00","end":"08:00"}]'::JSONB)$q$, :'comp_a', :'emp'),
  NULL, 'Cada bloque horario debe terminar después de empezar (dentro del mismo día).', 'T-06 un bloque no puede terminar antes de empezar');
SELECT is((SELECT count(*) FROM public.employee_schedules WHERE employee_id = :'emp'), 2::BIGINT, 'T-07 un horario inválido no cambia el anterior');

-- 8. Marcar entrada y salida
SELECT public.clock_in(:'comp_a', :'emp2');
SELECT throws_ok(format($q$SELECT public.clock_in(%L, %L)$q$, :'comp_a', :'emp2'), NULL, 'El empleado ya tiene una entrada abierta: primero marcá su salida.', 'T-08 no se puede marcar dos entradas seguidas');
SELECT public.clock_out(:'comp_a', :'emp2');
SELECT ok((SELECT check_out > check_in FROM public.attendance_records WHERE employee_id = :'emp2'), 'T-09 la salida queda registrada después de la entrada');
SELECT throws_ok(format($q$SELECT public.clock_out(%L, %L)$q$, :'comp_a', :'emp2'), NULL, 'El empleado no tiene una entrada abierta: primero marcá su entrada.', 'T-10 no se puede marcar salida sin entrada');

-- 11. Carga manual: hace una semana, con motivo
SELECT (date_trunc('week', (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::DATE - 7))::DATE AS monday \gset
SELECT public.save_attendance(:'comp_a', :'emp', NULL,
  (:'monday'::DATE + TIME '08:20') AT TIME ZONE 'America/Argentina/Buenos_Aires',
  (:'monday'::DATE + TIME '17:00') AT TIME ZONE 'America/Argentina/Buenos_Aires', 'Olvidó fichar') AS rec \gset
SELECT is((SELECT source FROM public.attendance_records WHERE id = :'rec'), 'manual', 'T-11 la carga manual queda marcada como manual');
SELECT throws_ok(
  format($q$SELECT public.save_attendance(%L, %L, NULL, %L::TIMESTAMPTZ, NULL, 'x')$q$, :'comp_a', :'emp',
    ((:'monday'::DATE + TIME '10:00') AT TIME ZONE 'America/Argentina/Buenos_Aires')::TEXT),
  NULL, 'Ese horario se superpone con otro registro del mismo empleado.', 'T-12 registros superpuestos rechazados');
SELECT throws_ok(
  format($q$SELECT public.save_attendance(%L, %L, NULL, now() + interval '2 hours', NULL, 'x')$q$, :'comp_a', :'emp'),
  NULL, 'Las horas no pueden ser futuras.', 'T-13 horas futuras rechazadas');
SELECT throws_ok(
  format($q$SELECT public.save_attendance(%L, %L, NULL, now() - interval '5 hours', NULL, '   ')$q$, :'comp_a', :'emp'),
  NULL, 'Indicá el motivo de la carga o corrección.', 'T-14 el motivo es obligatorio');

-- 15. Informe: un lunes con horario 08-12 y 14-18; llegó 08:20 (tarde) y trabajó 08:20-17:00 = 520 min
SELECT is(
  (SELECT days_worked || '|' || worked_minutes || '|' || scheduled_minutes || '|' || late_count
   FROM public.attendance_report(:'comp_a', :'monday'::DATE, :'monday'::DATE + 6) WHERE employee_id = :'emp'),
  '1|520|480|1', 'T-15 informe: días, minutos trabajados, previstos y llegadas tarde');

-- 16. Corregir la entrada a las 08:05 ya no es tarde
SELECT public.save_attendance(:'comp_a', :'emp', :'rec',
  (:'monday'::DATE + TIME '08:05') AT TIME ZONE 'America/Argentina/Buenos_Aires',
  (:'monday'::DATE + TIME '17:00') AT TIME ZONE 'America/Argentina/Buenos_Aires', 'Corrección de hora');
SELECT is(
  (SELECT late_count FROM public.attendance_report(:'comp_a', :'monday'::DATE, :'monday'::DATE + 6) WHERE employee_id = :'emp'),
  0::BIGINT, 'T-16 al corregir la entrada deja de ser llegada tarde');

-- 17. Anular: sale del informe; no se anula dos veces
SELECT public.void_attendance(:'comp_a', :'rec', 'Cargado por error');
SELECT is(
  (SELECT days_worked FROM public.attendance_report(:'comp_a', :'monday'::DATE, :'monday'::DATE + 6) WHERE employee_id = :'emp'),
  0::BIGINT, 'T-17 un registro anulado no cuenta');
SELECT throws_ok(format($q$SELECT public.void_attendance(%L, %L, 'otra')$q$, :'comp_a', :'rec'), NULL, 'Este registro ya está anulado.', 'T-18 no se anula dos veces');

-- 19. Empleado inactivo no ficha
SELECT public.upsert_employee(:'comp_a', :'emp2', 'Ana Gómez', NULL, 'Administrativa', NULL, NULL, 'inactive', NULL);
SELECT throws_ok(format($q$SELECT public.clock_in(%L, %L)$q$, :'comp_a', :'emp2'), NULL, 'El empleado está inactivo.', 'T-19 un empleado inactivo no puede fichar');

-- 20. Sin borrado directo
SELECT throws_ok(format($q$DELETE FROM public.employees WHERE id = %L$q$, :'emp'), NULL, NULL, 'T-20 los empleados no se borran');

-- 21/22. El rol empleado no ve ni consulta nada de personal
SET LOCAL "request.jwt.claim.sub" = 'aaaa0026-0000-0000-0000-000000000002';
SELECT is((SELECT count(*) FROM public.employees) + (SELECT count(*) FROM public.attendance_records) + (SELECT count(*) FROM public.employee_schedules), 0::BIGINT, 'T-21 el rol empleado no ve personal, horarios ni asistencia');
SELECT throws_like(format($q$SELECT public.void_attendance(%L, %L, 'x')$q$, :'comp_a', :'rec'), '%master_admin%', 'T-22 el rol empleado no anula asistencia');

-- 23. Aislamiento entre empresas
SET LOCAL "request.jwt.claim.sub" = 'aaaa0026-0000-0000-0000-000000000003';
SELECT is((SELECT count(*) FROM public.employees), 0::BIGINT, 'T-23 el admin de otra empresa no ve estos empleados');
SELECT throws_ok(format($q$SELECT public.clock_in(%L, %L)$q$, :'comp_b', :'emp'), NULL, 'Empleado no encontrado en esta empresa.', 'T-24 no se puede fichar a un empleado de otra empresa');

SELECT * FROM finish();
ROLLBACK;
