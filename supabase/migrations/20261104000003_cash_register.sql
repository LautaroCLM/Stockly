-- ============================================================================
-- MIGRACIÓN: CAJA DIARIA (TURNOS DE CAJA Y ARQUEO)
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
--
-- Alcance (solo control del efectivo físico del cajón):
--   * Apertura de caja con un fondo inicial de cambio.
--   * Ingresos y retiros de efectivo del cajón (agregar cambio, retirar efectivo
--     para guardarlo o depositarlo). No son gastos ni ingresos contables: eso es
--     responsabilidad de un futuro módulo de Finanzas.
--   * Cierre con arqueo: efectivo contado vs. efectivo esperado y diferencia.
--
-- Qué NO hace (lo hacen otros módulos):
--   * No registra ventas: las ventas siguen en process_sale. La caja solo LEE los
--     cobros en efectivo de las ventas hechas mientras estuvo abierta.
--   * No registra gastos, categorías contables ni cuentas bancarias.
--
-- Cálculo del efectivo esperado de un turno [opened_at, closed_at):
--   fondo inicial
--   + cobros en efectivo de ventas creadas en el turno (aunque luego se anulen)
--   - devoluciones en efectivo: ventas anuladas en el turno, por su parte en efectivo
--   + ingresos manuales - retiros manuales
-- Una venta creada y anulada en el mismo turno suma y resta lo mismo. Una venta de
-- un turno anterior anulada en este turno descuenta de este turno, que es de donde
-- sale el dinero devuelto.
--
-- Reglas:
--   * Una sola caja abierta por empresa (índice único parcial).
--   * Cualquier miembro activo opera la caja; todos los miembros la pueden ver.
--   * Un retiro no puede dejar el efectivo esperado en negativo.
--   * Cerrar con diferencia exige una observación.
--   * Las cajas cerradas y los movimientos son inmutables.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TABLAS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cash_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opened_by UUID NOT NULL REFERENCES auth.users(id),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  opening_amount NUMERIC(14, 2) NOT NULL CHECK (opening_amount >= 0),
  opening_notes TEXT CHECK (opening_notes IS NULL OR pg_catalog.length(opening_notes) <= 500),
  closed_by UUID REFERENCES auth.users(id),
  closed_at TIMESTAMPTZ,
  -- Foto del arqueo al cerrar (no cambia aunque luego se anule una venta del turno)
  cash_sales_amount NUMERIC(14, 2),
  cash_refunds_amount NUMERIC(14, 2),
  cash_in_amount NUMERIC(14, 2),
  cash_out_amount NUMERIC(14, 2),
  expected_amount NUMERIC(14, 2),
  counted_amount NUMERIC(14, 2) CHECK (counted_amount IS NULL OR counted_amount >= 0),
  difference_amount NUMERIC(14, 2),
  other_payments JSONB,
  closing_notes TEXT CHECK (closing_notes IS NULL OR pg_catalog.length(closing_notes) <= 500),
  CONSTRAINT chk_cash_sessions_state CHECK (
    (status = 'open' AND closed_at IS NULL AND closed_by IS NULL AND counted_amount IS NULL
      AND expected_amount IS NULL AND difference_amount IS NULL)
    OR (status = 'closed' AND closed_at IS NOT NULL AND closed_by IS NOT NULL AND counted_amount IS NOT NULL
      AND expected_amount IS NOT NULL AND difference_amount IS NOT NULL AND closed_at >= opened_at)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS cash_sessions_one_open_per_company
  ON public.cash_sessions (company_id) WHERE status = 'open';

CREATE INDEX IF NOT EXISTS cash_sessions_company_opened_idx
  ON public.cash_sessions (company_id, opened_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS public.cash_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  session_id UUID NOT NULL REFERENCES public.cash_sessions(id) ON DELETE RESTRICT,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('in', 'out')),
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL CHECK (pg_catalog.btrim(reason) <> '' AND pg_catalog.length(reason) <= 500),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cash_movements_session_idx
  ON public.cash_movements (session_id, created_at);

-- Índice para leer cobros por empresa y fecha (ventas del turno y anulaciones)
CREATE INDEX IF NOT EXISTS sales_company_created_idx ON public.sales (company_id, created_at);
CREATE INDEX IF NOT EXISTS sales_company_cancelled_idx
  ON public.sales (company_id, cancelled_at) WHERE cancelled_at IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. INMUTABILIDAD
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_cash_session_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Las cajas no se pueden eliminar.';
  END IF;

  -- Solo se admite el cierre: open -> closed, sin tocar los datos de apertura
  IF OLD.status = 'open' AND NEW.status = 'closed'
     AND NEW.id = OLD.id AND NEW.company_id = OLD.company_id
     AND NEW.opened_by = OLD.opened_by AND NEW.opened_at = OLD.opened_at
     AND NEW.opening_amount = OLD.opening_amount
     AND NEW.opening_notes IS NOT DISTINCT FROM OLD.opening_notes
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Una caja solo puede pasar de abierta a cerrada; las cajas cerradas son inmutables.';
END;
$$;

REVOKE ALL ON FUNCTION public.guard_cash_session_mutation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tr_cash_sessions_guard ON public.cash_sessions;
CREATE TRIGGER tr_cash_sessions_guard
  BEFORE UPDATE OR DELETE ON public.cash_sessions
  FOR EACH ROW EXECUTE FUNCTION public.guard_cash_session_mutation();

CREATE OR REPLACE FUNCTION public.guard_cash_movement_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Los movimientos de caja son inmutables.';
END;
$$;

REVOKE ALL ON FUNCTION public.guard_cash_movement_mutation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tr_cash_movements_guard ON public.cash_movements;
CREATE TRIGGER tr_cash_movements_guard
  BEFORE UPDATE OR DELETE ON public.cash_movements
  FOR EACH ROW EXECUTE FUNCTION public.guard_cash_movement_mutation();

-- ----------------------------------------------------------------------------
-- 3. AUDITORÍA
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS tr_audit_cash_sessions ON public.cash_sessions;
CREATE TRIGGER tr_audit_cash_sessions
  AFTER INSERT OR UPDATE OR DELETE ON public.cash_sessions
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger('id');

DROP TRIGGER IF EXISTS tr_audit_cash_movements ON public.cash_movements;
CREATE TRIGGER tr_audit_cash_movements
  AFTER INSERT OR UPDATE OR DELETE ON public.cash_movements
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger('id');

-- ----------------------------------------------------------------------------
-- 4. RLS: lectura para miembros; escritura solo por RPC
-- ----------------------------------------------------------------------------
ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_movements FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cash_sessions_select_member" ON public.cash_sessions;
CREATE POLICY "cash_sessions_select_member"
  ON public.cash_sessions FOR SELECT TO authenticated
  USING (company_id IN (SELECT private.my_accessible_company_ids()));

DROP POLICY IF EXISTS "cash_movements_select_member" ON public.cash_movements;
CREATE POLICY "cash_movements_select_member"
  ON public.cash_movements FOR SELECT TO authenticated
  USING (company_id IN (SELECT private.my_accessible_company_ids()));

REVOKE ALL ON public.cash_sessions FROM PUBLIC, anon;
REVOKE ALL ON public.cash_movements FROM PUBLIC, anon;
GRANT SELECT ON public.cash_sessions TO authenticated;
GRANT SELECT ON public.cash_movements TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.cash_sessions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.cash_movements FROM authenticated;

-- ----------------------------------------------------------------------------
-- 5. CÁLCULO DE TOTALES DE UN TURNO
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.cash_session_totals(
  p_company_id UUID,
  p_session_id UUID,
  p_until TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session public.cash_sessions%ROWTYPE;
  v_cash_sales NUMERIC(14, 2);
  v_cash_refunds NUMERIC(14, 2);
  v_cash_in NUMERIC(14, 2);
  v_cash_out NUMERIC(14, 2);
  v_sales_count INTEGER;
  v_other JSONB;
BEGIN
  SELECT * INTO v_session
  FROM public.cash_sessions
  WHERE id = p_session_id AND company_id = p_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caja no encontrada en esta empresa.';
  END IF;

  SELECT COALESCE(SUM((p.value ->> 'amount')::NUMERIC), 0)::NUMERIC(14, 2)
  INTO v_cash_sales
  FROM public.sales s
  CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(s.payments) AS p(value)
  WHERE s.company_id = p_company_id
    AND s.created_at >= v_session.opened_at
    AND s.created_at < p_until
    AND p.value ->> 'method' = 'efectivo';

  SELECT COALESCE(SUM((p.value ->> 'amount')::NUMERIC), 0)::NUMERIC(14, 2)
  INTO v_cash_refunds
  FROM public.sales s
  CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(s.payments) AS p(value)
  WHERE s.company_id = p_company_id
    AND s.status = 'cancelled'
    AND s.cancelled_at >= v_session.opened_at
    AND s.cancelled_at < p_until
    AND p.value ->> 'method' = 'efectivo';

  SELECT
    COALESCE(SUM(amount) FILTER (WHERE movement_type = 'in'), 0)::NUMERIC(14, 2),
    COALESCE(SUM(amount) FILTER (WHERE movement_type = 'out'), 0)::NUMERIC(14, 2)
  INTO v_cash_in, v_cash_out
  FROM public.cash_movements
  WHERE session_id = p_session_id;

  SELECT COUNT(*)::INTEGER INTO v_sales_count
  FROM public.sales s
  WHERE s.company_id = p_company_id
    AND s.status = 'completed'
    AND s.created_at >= v_session.opened_at
    AND s.created_at < p_until;

  -- Cobros con otros medios (no pasan por el cajón): solo informativo para el cierre
  SELECT COALESCE(pg_catalog.jsonb_object_agg(method, total), '{}'::jsonb)
  INTO v_other
  FROM (
    SELECT p.value ->> 'method' AS method,
           SUM((p.value ->> 'amount')::NUMERIC)::NUMERIC(14, 2) AS total
    FROM public.sales s
    CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(s.payments) AS p(value)
    WHERE s.company_id = p_company_id
      AND s.status = 'completed'
      AND s.created_at >= v_session.opened_at
      AND s.created_at < p_until
      AND p.value ->> 'method' <> 'efectivo'
    GROUP BY p.value ->> 'method'
  ) other_methods;

  RETURN pg_catalog.jsonb_build_object(
    'opening_amount', v_session.opening_amount,
    'cash_sales_amount', v_cash_sales,
    'cash_refunds_amount', v_cash_refunds,
    'cash_in_amount', v_cash_in,
    'cash_out_amount', v_cash_out,
    'expected_amount', (v_session.opening_amount + v_cash_sales - v_cash_refunds + v_cash_in - v_cash_out)::NUMERIC(14, 2),
    'completed_sales_count', v_sales_count,
    'other_payments', v_other
  );
END;
$$;

REVOKE ALL ON FUNCTION private.cash_session_totals(UUID, UUID, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;

-- Bloquea la empresa y valida que el usuario sea miembro activo
CREATE OR REPLACE FUNCTION private.lock_company_for_cash(p_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company_active BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'Falta indicar la empresa.';
  END IF;

  PERFORM private.assert_company_role(p_company_id, NULL);

  SELECT is_active INTO v_company_active
  FROM public.companies
  WHERE id = p_company_id
  FOR NO KEY UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Empresa con ID % no encontrada.', p_company_id;
  END IF;
  IF NOT v_company_active THEN
    RAISE EXCEPTION 'La empresa se encuentra inactiva. No se admiten operaciones.';
  END IF;

  -- Revalidación tras el bloqueo
  PERFORM private.assert_company_role(p_company_id, NULL);
END;
$$;

REVOKE ALL ON FUNCTION private.lock_company_for_cash(UUID) FROM PUBLIC, anon, authenticated;

-- Valida un importe de dinero con dos decimales como máximo
CREATE OR REPLACE FUNCTION private.assert_money(p_amount NUMERIC, p_label TEXT, p_allow_zero BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
BEGIN
  IF p_amount IS NULL THEN
    RAISE EXCEPTION 'Falta indicar %.', p_label;
  END IF;
  IF p_amount < 0 OR (NOT p_allow_zero AND p_amount = 0) THEN
    RAISE EXCEPTION '% debe ser mayor a %.', p_label, CASE WHEN p_allow_zero THEN 'o igual a 0' ELSE '0' END;
  END IF;
  IF p_amount <> pg_catalog.round(p_amount, 2) THEN
    RAISE EXCEPTION '% admite como máximo dos decimales.', p_label;
  END IF;
  IF p_amount > 999999999999.99 THEN
    RAISE EXCEPTION '% es demasiado grande.', p_label;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.assert_money(NUMERIC, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 6. RPC: abrir caja
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.open_cash_session(
  p_company_id UUID,
  p_opening_amount NUMERIC,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_notes TEXT := NULLIF(pg_catalog.btrim(p_notes), '');
  v_session_id UUID;
BEGIN
  PERFORM private.lock_company_for_cash(p_company_id);
  PERFORM private.assert_money(p_opening_amount, 'el fondo inicial', true);

  IF v_notes IS NOT NULL AND pg_catalog.length(v_notes) > 500 THEN
    RAISE EXCEPTION 'La observación no puede superar los 500 caracteres.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.cash_sessions WHERE company_id = p_company_id AND status = 'open') THEN
    RAISE EXCEPTION 'Ya hay una caja abierta en esta empresa. Cerrala antes de abrir otra.';
  END IF;

  INSERT INTO public.cash_sessions (company_id, opened_by, opening_amount, opening_notes)
  VALUES (p_company_id, auth.uid(), p_opening_amount, v_notes)
  RETURNING id INTO v_session_id;

  RETURN pg_catalog.jsonb_build_object('session_id', v_session_id);
END;
$$;

REVOKE ALL ON FUNCTION public.open_cash_session(UUID, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_cash_session(UUID, NUMERIC, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. RPC: ingreso o retiro de efectivo
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_cash_movement(
  p_company_id UUID,
  p_session_id UUID,
  p_movement_type TEXT,
  p_amount NUMERIC,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reason TEXT := pg_catalog.btrim(p_reason);
  v_status TEXT;
  v_totals JSONB;
  v_movement_id UUID;
BEGIN
  PERFORM private.lock_company_for_cash(p_company_id);

  IF p_movement_type IS NULL OR p_movement_type NOT IN ('in', 'out') THEN
    RAISE EXCEPTION 'Tipo de movimiento inválido: debe ser ingreso o retiro.';
  END IF;
  PERFORM private.assert_money(p_amount, 'el importe', false);
  IF v_reason IS NULL OR v_reason = '' THEN
    RAISE EXCEPTION 'Indicá el motivo del movimiento.';
  END IF;
  IF pg_catalog.length(v_reason) > 500 THEN
    RAISE EXCEPTION 'El motivo no puede superar los 500 caracteres.';
  END IF;

  SELECT status INTO v_status
  FROM public.cash_sessions
  WHERE id = p_session_id AND company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caja no encontrada en esta empresa.';
  END IF;
  IF v_status <> 'open' THEN
    RAISE EXCEPTION 'La caja está cerrada: no admite movimientos.';
  END IF;

  IF p_movement_type = 'out' THEN
    v_totals := private.cash_session_totals(p_company_id, p_session_id, now() + interval '1 microsecond');
    IF p_amount > (v_totals ->> 'expected_amount')::NUMERIC THEN
      RAISE EXCEPTION 'No se puede retirar más efectivo del que debería haber en la caja ($ %).',
        v_totals ->> 'expected_amount';
    END IF;
  END IF;

  INSERT INTO public.cash_movements (company_id, session_id, movement_type, amount, reason, created_by)
  VALUES (p_company_id, p_session_id, p_movement_type, p_amount, v_reason, auth.uid())
  RETURNING id INTO v_movement_id;

  RETURN pg_catalog.jsonb_build_object('movement_id', v_movement_id);
END;
$$;

REVOKE ALL ON FUNCTION public.register_cash_movement(UUID, UUID, TEXT, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_cash_movement(UUID, UUID, TEXT, NUMERIC, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 8. RPC: resumen del turno (en vivo si está abierta, foto del cierre si está cerrada)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cash_session_summary(
  p_company_id UUID,
  p_session_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session public.cash_sessions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  IF p_company_id IS NULL OR p_company_id NOT IN (SELECT private.my_accessible_company_ids()) THEN
    RAISE EXCEPTION 'El usuario no es un miembro activo de esta empresa.';
  END IF;

  SELECT * INTO v_session
  FROM public.cash_sessions
  WHERE id = p_session_id AND company_id = p_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caja no encontrada en esta empresa.';
  END IF;

  IF v_session.status = 'closed' THEN
    RETURN pg_catalog.jsonb_build_object(
      'opening_amount', v_session.opening_amount,
      'cash_sales_amount', v_session.cash_sales_amount,
      'cash_refunds_amount', v_session.cash_refunds_amount,
      'cash_in_amount', v_session.cash_in_amount,
      'cash_out_amount', v_session.cash_out_amount,
      'expected_amount', v_session.expected_amount,
      'completed_sales_count', NULL,
      'other_payments', COALESCE(v_session.other_payments, '{}'::jsonb),
      'counted_amount', v_session.counted_amount,
      'difference_amount', v_session.difference_amount
    );
  END IF;

  RETURN private.cash_session_totals(p_company_id, p_session_id, now() + interval '1 microsecond');
END;
$$;

REVOKE ALL ON FUNCTION public.cash_session_summary(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cash_session_summary(UUID, UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 9. RPC: cerrar caja con arqueo
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.close_cash_session(
  p_company_id UUID,
  p_session_id UUID,
  p_counted_amount NUMERIC,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_notes TEXT := NULLIF(pg_catalog.btrim(p_notes), '');
  v_status TEXT;
  v_now TIMESTAMPTZ := now();
  v_totals JSONB;
  v_expected NUMERIC(14, 2);
  v_difference NUMERIC(14, 2);
BEGIN
  PERFORM private.lock_company_for_cash(p_company_id);
  PERFORM private.assert_money(p_counted_amount, 'el efectivo contado', true);

  IF v_notes IS NOT NULL AND pg_catalog.length(v_notes) > 500 THEN
    RAISE EXCEPTION 'La observación no puede superar los 500 caracteres.';
  END IF;

  SELECT status INTO v_status
  FROM public.cash_sessions
  WHERE id = p_session_id AND company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caja no encontrada en esta empresa.';
  END IF;
  IF v_status <> 'open' THEN
    RAISE EXCEPTION 'La caja ya está cerrada.';
  END IF;

  v_totals := private.cash_session_totals(p_company_id, p_session_id, v_now + interval '1 microsecond');
  v_expected := (v_totals ->> 'expected_amount')::NUMERIC;
  v_difference := p_counted_amount - v_expected;

  IF v_difference <> 0 AND v_notes IS NULL THEN
    RAISE EXCEPTION 'Hay una diferencia de $ % entre lo contado y lo esperado: indicá una observación para cerrar.',
      v_difference;
  END IF;

  UPDATE public.cash_sessions
  SET status = 'closed',
      closed_by = auth.uid(),
      closed_at = v_now,
      cash_sales_amount = (v_totals ->> 'cash_sales_amount')::NUMERIC,
      cash_refunds_amount = (v_totals ->> 'cash_refunds_amount')::NUMERIC,
      cash_in_amount = (v_totals ->> 'cash_in_amount')::NUMERIC,
      cash_out_amount = (v_totals ->> 'cash_out_amount')::NUMERIC,
      expected_amount = v_expected,
      counted_amount = p_counted_amount,
      difference_amount = v_difference,
      other_payments = v_totals -> 'other_payments',
      closing_notes = v_notes
  WHERE id = p_session_id;

  RETURN v_totals || pg_catalog.jsonb_build_object(
    'counted_amount', p_counted_amount,
    'difference_amount', v_difference
  );
END;
$$;

REVOKE ALL ON FUNCTION public.close_cash_session(UUID, UUID, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_cash_session(UUID, UUID, NUMERIC, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 10. REALTIME
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  target_table TEXT;
BEGIN
  FOREACH target_table IN ARRAY ARRAY['cash_sessions', 'cash_movements'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = target_table
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', target_table);
    END IF;
  END LOOP;
END
$$;
