-- ============================================================================
-- SUITE DE PRUEBAS (pgTAP) - FICHAJE DESDE UNA CUENTA DE EMPLEADO
-- Módulo: clock_in / clock_out / clock_roster con rol empleado
-- Estado: SUITE AISLADA E INDEPENDIENTE (Transacción con ROLLBACK)
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(19);

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
  ('aaaa0027-0000-0000-0000-000000000001', 'admin_fc_a@stockly.local'),
  ('aaaa0027-0000-0000-0000-000000000002', 'empleado_fc_a@stockly.local'),
  ('aaaa0027-0000-0000-0000-000000000003', 'admin_fc_b@stockly.local'),
  ('aaaa0027-0000-0000-0000-000000000004', 'sin_empresa_fc@stockly.local');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0027-0000-0000-0000-000000000001';
SELECT public.create_company('Empresa FC Alpha', NULL) AS comp_a \gset
SELECT public.invite_user_to_company(:'comp_a', 'empleado_fc_a@stockly.local', 'employee') AS tok_emp \gset
SET LOCAL "request.jwt.claim.sub" = 'aaaa0027-0000-0000-0000-000000000002';
SELECT public.accept_company_invitation(:'tok_emp');
SET LOCAL "request.jwt.claim.sub" = 'aaaa0027-0000-0000-0000-000000000003';
SELECT public.create_company('Empresa FC Beta', NULL) AS comp_b \gset

-- Datos: el administrador carga personal, un horario (miércoles) y un registro viejo
SET LOCAL "request.jwt.claim.sub" = 'aaaa0027-0000-0000-0000-000000000001';
SELECT public.upsert_employee(:'comp_a', NULL, 'Juan Pérez', '30111222', 'Operario', '11-5555-0000', NULL, 'active', 'nota privada') AS emp \gset
SELECT public.upsert_employee(:'comp_a', NULL, 'Ana Gómez', NULL, 'Administrativa', NULL, NULL, 'active', NULL) AS emp2 \gset
SELECT public.upsert_employee(:'comp_a', NULL, 'Marta Inactiva', NULL, NULL, NULL, NULL, 'inactive', NULL) AS emp3 \gset
SELECT public.set_employee_schedule(:'comp_a', :'emp', '[{"weekday":3,"start":"08:00","end":"12:00"}]'::JSONB);
SELECT public.save_attendance(:'comp_a', :'emp', NULL, now() - interval '5 days', now() - interval '5 days' + interval '8 hours', 'Carga de prueba') AS rec \gset

-- 1-3. El empleado marca entrada y salida de un compañero
SET LOCAL "request.jwt.claim.sub" = 'aaaa0027-0000-0000-0000-000000000002';
SELECT lives_ok(format($q$SELECT public.clock_in(%L, %L)$q$, :'comp_a', :'emp'), 'T-01 el rol empleado marca la entrada de un compañero');
SELECT lives_ok(format($q$SELECT public.clock_out(%L, %L)$q$, :'comp_a', :'emp'), 'T-02 el rol empleado marca la salida de un compañero');
SET LOCAL "request.jwt.claim.sub" = 'aaaa0027-0000-0000-0000-000000000001';
SELECT is((SELECT created_by::TEXT || '|' || (check_out IS NOT NULL)::TEXT FROM public.attendance_records WHERE employee_id = :'emp' AND source = 'clock'),
  'aaaa0027-0000-0000-0000-000000000002|true', 'T-03 el registro guarda quién marcó y la salida queda cerrada');

-- 4-7. La lista mínima para fichar
SET LOCAL "request.jwt.claim.sub" = 'aaaa0027-0000-0000-0000-000000000002';
SELECT is((SELECT count(*) FROM public.clock_roster(:'comp_a', 3, now() - interval '1 hour')), 2::BIGINT, 'T-04 la lista trae solo empleados activos');
SELECT is((SELECT jsonb_array_length(schedule) FROM public.clock_roster(:'comp_a', 3, now() - interval '1 hour') WHERE employee_id = :'emp'), 1, 'T-05 trae el horario del día pedido');
SELECT is((SELECT jsonb_array_length(schedule) FROM public.clock_roster(:'comp_a', 4, now() - interval '1 hour') WHERE employee_id = :'emp'), 0, 'T-06 no trae los horarios de otros días');
SELECT is((SELECT jsonb_array_length(records) FROM public.clock_roster(:'comp_a', 3, now() - interval '10 days') WHERE employee_id = :'emp'), 1, 'T-07 trae los registros de hoy pero no el historial');

-- 8-11. Lo que el rol empleado no puede hacer
SELECT is((SELECT count(*) FROM public.employees) + (SELECT count(*) FROM public.attendance_records) + (SELECT count(*) FROM public.employee_schedules), 0::BIGINT, 'T-08 el rol empleado sigue sin leer las tablas');
SELECT throws_like(format($q$SELECT public.save_attendance(%L, %L, NULL, now() - interval '2 days', NULL, 'x')$q$, :'comp_a', :'emp'), '%master_admin%', 'T-09 el rol empleado no carga ni corrige registros');
SELECT throws_like(format($q$SELECT public.void_attendance(%L, %L, 'x')$q$, :'comp_a', :'rec'), '%master_admin%', 'T-10 el rol empleado no anula registros');
SELECT throws_like(format($q$SELECT public.set_employee_schedule(%L, %L, '[]'::JSONB)$q$, :'comp_a', :'emp'), '%master_admin%', 'T-11 el rol empleado no cambia horarios');

-- 12-13. Validaciones
SELECT throws_ok(format($q$SELECT * FROM public.clock_roster(%L, 9, now())$q$, :'comp_a'), NULL, 'Día de la semana inválido.', 'T-12 día de la semana inválido');
SELECT throws_ok(format($q$SELECT public.clock_in(%L, %L)$q$, :'comp_a', :'emp3'), NULL, 'El empleado está inactivo.', 'T-13 no se ficha a un empleado inactivo');

-- 14. La lista solo expone lo necesario
SELECT is((SELECT proargnames FROM pg_catalog.pg_proc WHERE proname = 'clock_roster' AND pronamespace = 'public'::regnamespace),
  ARRAY['p_company_id','p_weekday','p_since','employee_id','full_name','job_title','schedule','records']::TEXT[], 'T-14 la lista no expone documento, teléfono ni notas');

-- 15-17. Otra empresa y usuarios sin acceso
SET LOCAL "request.jwt.claim.sub" = 'aaaa0027-0000-0000-0000-000000000003';
SELECT throws_ok(format($q$SELECT * FROM public.clock_roster(%L, 3, now())$q$, :'comp_a'), NULL, NULL, 'T-15 el admin de otra empresa no ve la lista');
SELECT throws_ok(format($q$SELECT public.clock_in(%L, %L)$q$, :'comp_a', :'emp2'), NULL, NULL, 'T-16 el admin de otra empresa no ficha acá');
SET LOCAL "request.jwt.claim.sub" = 'aaaa0027-0000-0000-0000-000000000004';
SELECT throws_ok(format($q$SELECT public.clock_in(%L, %L)$q$, :'comp_a', :'emp2'), NULL, NULL, 'T-17 un usuario sin empresa no ficha');

-- 18. Sin sesión
SET LOCAL "request.jwt.claim.sub" = '';
SELECT throws_ok(format($q$SELECT * FROM public.clock_roster(%L, 3, now())$q$, :'comp_a'), NULL, 'Usuario no autenticado.', 'T-18 sin sesión no hay acceso');

-- 19. El administrador sigue pudiendo fichar
SET LOCAL "request.jwt.claim.sub" = 'aaaa0027-0000-0000-0000-000000000001';
SELECT lives_ok(format($q$SELECT public.clock_in(%L, %L)$q$, :'comp_a', :'emp2'), 'T-19 el administrador sigue pudiendo marcar');

SELECT * FROM finish();
ROLLBACK;
