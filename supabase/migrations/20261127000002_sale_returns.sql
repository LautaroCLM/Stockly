-- ============================================================================
-- Stockly: devoluciones parciales de ventas
-- ============================================================================
-- Un cliente devuelve parte de lo que compró:
--   * Se elige qué líneas y cuántas unidades (nunca más de lo vendido menos lo
--     ya devuelto). Las de producto vuelven al stock al costo de la venta.
--   * El dinero se devuelve en efectivo desde la caja abierta (importe
--     proporcional al descuento de la venta).
--   * Numeración propia por empresa: DEV-00000001.
--   * Una venta con devoluciones ya no se puede anular entera.
--   * Caja, finanzas, informes y dashboard descuentan lo devuelto.
-- Permiso: el mismo que anular ventas (módulo anular_ventas, operar).
-- ============================================================================

-- 1. Tablas -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sale_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  sale_id UUID NOT NULL,
  return_number TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (pg_catalog.length(reason) BETWEEN 1 AND 500),
  refund_amount NUMERIC(14, 2) NOT NULL CHECK (refund_amount >= 0.00),
  cash_session_id UUID NOT NULL,
  idempotency_key UUID NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT uq_sale_returns_company_id UNIQUE (company_id, id),
  CONSTRAINT uq_sale_returns_number UNIQUE (company_id, return_number),
  CONSTRAINT uq_sale_returns_idempotency UNIQUE (company_id, idempotency_key),
  CONSTRAINT fk_sale_returns_sale FOREIGN KEY (company_id, sale_id)
    REFERENCES public.sales(company_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.sale_return_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  return_id UUID NOT NULL,
  sale_item_id UUID NOT NULL,
  product_id UUID,
  quantity NUMERIC(12, 2) NOT NULL CHECK (quantity > 0.00 AND pg_catalog.scale(quantity) <= 2),
  amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0.00),
  CONSTRAINT fk_sale_return_items_return FOREIGN KEY (company_id, return_id)
    REFERENCES public.sale_returns(company_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_sale_return_items_sale_item FOREIGN KEY (company_id, sale_item_id)
    REFERENCES public.sale_items(company_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_sale_returns_company_sale ON public.sale_returns(company_id, sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_returns_company_created ON public.sale_returns(company_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sale_return_items_sale_item ON public.sale_return_items(company_id, sale_item_id);

COMMENT ON TABLE public.sale_returns IS 'Devoluciones parciales de ventas: reintegro en efectivo desde la caja abierta.';
COMMENT ON TABLE public.sale_return_items IS 'Líneas devueltas de cada devolución (cantidad e importe reintegrado).';

-- Solo lectura para los miembros; se escribe únicamente con process_sale_return
ALTER TABLE public.sale_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_returns FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sale_return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_return_items FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sale_returns_select_member ON public.sale_returns;
CREATE POLICY sale_returns_select_member ON public.sale_returns
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT private.my_accessible_company_ids()));

DROP POLICY IF EXISTS sale_return_items_select_member ON public.sale_return_items;
CREATE POLICY sale_return_items_select_member ON public.sale_return_items
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT private.my_accessible_company_ids()));

REVOKE ALL ON public.sale_returns, public.sale_return_items FROM anon;
GRANT SELECT ON public.sale_returns, public.sale_return_items TO authenticated;

-- 2. Movimientos de stock y contador ------------------------------------------
ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS chk_stock_movements_reason;
ALTER TABLE public.stock_movements ADD CONSTRAINT chk_stock_movements_reason CHECK (reason = ANY (ARRAY[
  'initial_load', 'purchase', 'physical_count', 'loss_damage', 'internal_use', 'sale', 'cancellation',
  'purchase_cancellation', 'import', 'sale_return'
]));
ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS chk_stock_movements_dir_reason;
ALTER TABLE public.stock_movements ADD CONSTRAINT chk_stock_movements_dir_reason CHECK (
  (direction = 'increase' AND reason = ANY (ARRAY['initial_load', 'purchase', 'physical_count', 'cancellation', 'import', 'sale_return']))
  OR (direction = 'decrease' AND reason = ANY (ARRAY['sale', 'loss_damage', 'internal_use', 'physical_count', 'purchase_cancellation']))
);

ALTER TABLE public.company_counters DROP CONSTRAINT IF EXISTS company_counters_kind_check;
DO $$
DECLARE
  v_name TEXT;
BEGIN
  FOR v_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.company_counters'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%kind%'
  LOOP
    EXECUTE pg_catalog.format('ALTER TABLE public.company_counters DROP CONSTRAINT %I', v_name);
  END LOOP;
END;
$$;
ALTER TABLE public.company_counters ADD CONSTRAINT company_counters_kind_check
  CHECK (kind = ANY (ARRAY['sale', 'purchase', 'sale_return']));

-- 3. Registrar una devolución -------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_sale_return(
  p_company_id UUID,
  p_sale_id UUID,
  p_items JSONB,
  p_reason TEXT,
  p_idempotency_key UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_reason TEXT;
  v_sale RECORD;
  v_existing RECORD;
  v_session_id UUID;
  v_item RECORD;
  v_line RECORD;
  v_returned NUMERIC(12, 2);
  v_amount NUMERIC(14, 2);
  v_total NUMERIC(14, 2) := 0.00;
  v_counter BIGINT;
  v_number TEXT;
  v_return_id UUID;
  v_movement_id UUID;
  v_lines INT;
BEGIN
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Falta la clave de la operación.';
  END IF;

  -- Permiso, empresa activa (con bloqueo) y motivo obligatorio
  v_reason := private.prepare_document_cancellation(p_company_id, p_sale_id, p_reason, 'anular_ventas');

  -- Reintento de una devolución ya registrada: devuelve el mismo resultado
  SELECT id, return_number, refund_amount INTO v_existing
  FROM public.sale_returns
  WHERE company_id = p_company_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN pg_catalog.jsonb_build_object('return_id', v_existing.id, 'return_number', v_existing.return_number,
      'refund_amount', v_existing.refund_amount, 'already_registered', true);
  END IF;

  SELECT id, sale_number, status, subtotal, total_amount, payments INTO v_sale
  FROM public.sales
  WHERE id = p_sale_id AND company_id = p_company_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venta no encontrada en esta empresa.';
  END IF;
  IF v_sale.status <> 'completed' THEN
    RAISE EXCEPTION 'La venta % está anulada: no admite devoluciones.', v_sale.sale_number;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(v_sale.payments) AS p(value)
    WHERE p.value ->> 'method' = 'cuenta_corriente'
  ) THEN
    RAISE EXCEPTION 'La venta % se cargó a cuenta corriente: anulala o ajustá la cuenta del cliente.', v_sale.sale_number;
  END IF;

  SELECT cs.id INTO v_session_id
  FROM public.cash_sessions cs
  WHERE cs.company_id = p_company_id AND cs.status = 'open';
  IF v_session_id IS NULL THEN
    RAISE EXCEPTION 'Abrí la caja para devolver el efectivo al cliente.';
  END IF;

  IF p_items IS NULL OR pg_catalog.jsonb_typeof(p_items) <> 'array' OR pg_catalog.jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Elegí al menos un producto para devolver.';
  END IF;
  SELECT COUNT(*), COUNT(DISTINCT x.value ->> 'sale_item_id') INTO v_lines, v_counter
  FROM pg_catalog.jsonb_array_elements(p_items) AS x;
  IF v_lines <> v_counter THEN
    RAISE EXCEPTION 'Hay líneas repetidas en la devolución.';
  END IF;

  -- Productos bloqueados en orden canónico antes de mover stock
  PERFORM 1 FROM public.products pr
  WHERE pr.company_id = p_company_id
    AND pr.id IN (
      SELECT si.product_id FROM public.sale_items si
      WHERE si.company_id = p_company_id AND si.sale_id = p_sale_id AND si.product_id IS NOT NULL
    )
  ORDER BY pr.id
  FOR UPDATE;

  -- Número correlativo DEV-xxxxxxxx
  INSERT INTO public.company_counters (company_id, kind, last_value)
  VALUES (p_company_id, 'sale_return', 1)
  ON CONFLICT (company_id, kind) DO UPDATE SET last_value = public.company_counters.last_value + 1, updated_at = pg_catalog.now()
  RETURNING last_value INTO v_counter;
  v_number := 'DEV-' || pg_catalog.lpad(v_counter::TEXT, 8, '0');

  INSERT INTO public.sale_returns (company_id, sale_id, return_number, reason, refund_amount, cash_session_id, idempotency_key, created_by)
  VALUES (p_company_id, p_sale_id, v_number, v_reason, 0.00, v_session_id, p_idempotency_key, v_user_id)
  RETURNING id INTO v_return_id;

  FOR v_item IN
    SELECT (x.value ->> 'sale_item_id')::UUID AS sale_item_id, (x.value ->> 'quantity')::NUMERIC AS quantity
    FROM pg_catalog.jsonb_array_elements(p_items) AS x
  LOOP
    SELECT si.id, si.product_id, si.description, si.quantity, si.subtotal INTO v_line
    FROM public.sale_items si
    WHERE si.id = v_item.sale_item_id AND si.sale_id = p_sale_id AND si.company_id = p_company_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Una de las líneas no pertenece a la venta %.', v_sale.sale_number;
    END IF;
    IF v_item.quantity IS NULL OR v_item.quantity <= 0.00 OR pg_catalog.scale(v_item.quantity) > 2 THEN
      RAISE EXCEPTION 'La cantidad a devolver debe ser mayor a 0.';
    END IF;

    SELECT COALESCE(SUM(ri.quantity), 0.00) INTO v_returned
    FROM public.sale_return_items ri
    WHERE ri.company_id = p_company_id AND ri.sale_item_id = v_line.id;
    IF v_item.quantity > v_line.quantity - v_returned THEN
      RAISE EXCEPTION 'No se pueden devolver % unidades: quedan % sin devolver de esa línea.', v_item.quantity, v_line.quantity - v_returned;
    END IF;

    -- Importe de la línea, proporcional al descuento de la venta
    v_amount := pg_catalog.round(v_line.subtotal * v_item.quantity / v_line.quantity, 2);
    IF v_sale.subtotal > 0.00 THEN
      v_amount := pg_catalog.round(v_amount * v_sale.total_amount / v_sale.subtotal, 2);
    END IF;
    v_total := v_total + v_amount;

    INSERT INTO public.sale_return_items (company_id, return_id, sale_item_id, product_id, quantity, amount)
    VALUES (p_company_id, v_return_id, v_line.id, v_line.product_id, v_item.quantity, v_amount);

    IF v_line.product_id IS NOT NULL THEN
      INSERT INTO public.stock_movements (
        company_id, product_id, direction, reason, quantity, reference_sale_id, reference_doc, notes, created_by
      ) VALUES (
        p_company_id, v_line.product_id, 'increase', 'sale_return', v_item.quantity, p_sale_id,
        v_number, 'Devolución ' || v_number || ' de ' || v_sale.sale_number, v_user_id
      ) RETURNING id INTO v_movement_id;

      INSERT INTO public.movement_costs (company_id, movement_id, unit_cost, total_cost)
      SELECT p_company_id, v_movement_id, COALESCE(mc.unit_cost, 0.00),
             pg_catalog.round(COALESCE(mc.unit_cost, 0.00) * v_item.quantity, 2)
      FROM (SELECT 1) one
      LEFT JOIN public.stock_movements sm
        ON sm.company_id = p_company_id AND sm.reference_sale_id = p_sale_id
       AND sm.product_id = v_line.product_id AND sm.reason = 'sale'
      LEFT JOIN public.movement_costs mc ON mc.company_id = sm.company_id AND mc.movement_id = sm.id
      LIMIT 1;
    END IF;
  END LOOP;

  -- No se puede devolver más efectivo del que debería haber en el cajón
  IF v_total > ((private.cash_session_totals(p_company_id, v_session_id, pg_catalog.now()) ->> 'expected_amount')::NUMERIC) THEN
    RAISE EXCEPTION 'En la caja no hay efectivo suficiente para devolver % ARS. Registrá un ingreso de efectivo o devolvé menos.', v_total;
  END IF;

  UPDATE public.sale_returns SET refund_amount = v_total WHERE id = v_return_id AND company_id = p_company_id;

  INSERT INTO public.audit_log (company_id, table_name, record_id, action, old_data, new_data, performed_by, actor_role)
  VALUES (p_company_id, 'sale_returns', v_return_id::TEXT, 'INSERT', NULL,
    pg_catalog.jsonb_build_object('sale_number', v_sale.sale_number, 'return_number', v_number,
      'refund_amount', v_total, 'reason', v_reason, 'items', p_items),
    v_user_id, 'master_admin');

  RETURN pg_catalog.jsonb_build_object('return_id', v_return_id, 'return_number', v_number,
    'refund_amount', v_total, 'already_registered', false);
END;
$$;

REVOKE ALL ON FUNCTION public.process_sale_return(UUID, UUID, JSONB, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_sale_return(UUID, UUID, JSONB, TEXT, UUID) TO authenticated;

-- 4. Una venta con devoluciones no se anula entera ---------------------------
CREATE OR REPLACE FUNCTION public.cancel_sale(p_company_id uuid, p_sale_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_reason TEXT;
  v_sale RECORD;
  v_item RECORD;
  v_movement_id UUID;
  v_now TIMESTAMPTZ := pg_catalog.now();
BEGIN
  v_reason := private.prepare_document_cancellation(p_company_id, p_sale_id, p_reason, 'anular_ventas');

  SELECT id, sale_number, status, cancelled_at, total_amount INTO v_sale
  FROM public.sales
  WHERE id = p_sale_id AND company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venta no encontrada en esta empresa.';
  END IF;

  -- Reintento de una anulación ya confirmada: sin efectos
  IF v_sale.status = 'cancelled' THEN
    RETURN pg_catalog.jsonb_build_object(
      'sale_id', v_sale.id, 'sale_number', v_sale.sale_number, 'status', 'cancelled',
      'cancelled_at', v_sale.cancelled_at, 'already_cancelled', true
    );
  END IF;

  IF EXISTS (SELECT 1 FROM public.sale_returns sr WHERE sr.company_id = p_company_id AND sr.sale_id = p_sale_id) THEN
    RAISE EXCEPTION 'La venta % ya tiene devoluciones: para devolver el resto, registrá otra devolución.', v_sale.sale_number;
  END IF;

  -- Bloqueo canónico de productos antes de insertar movimientos
  PERFORM 1
  FROM public.products p
  WHERE p.company_id = p_company_id
    AND p.id IN (SELECT si.product_id FROM public.sale_items si WHERE si.sale_id = p_sale_id AND si.company_id = p_company_id)
  ORDER BY p.id
  FOR UPDATE;

  -- Reposición de stock al costo congelado de la venta original
  FOR v_item IN
    SELECT si.product_id, si.quantity, COALESCE(mc.unit_cost, 0.00) AS unit_cost
    FROM public.sale_items si
    LEFT JOIN public.stock_movements sm
      ON sm.company_id = si.company_id AND sm.reference_sale_id = si.sale_id
     AND sm.product_id = si.product_id AND sm.reason = 'sale'
    LEFT JOIN public.movement_costs mc
      ON mc.company_id = sm.company_id AND mc.movement_id = sm.id
    WHERE si.sale_id = p_sale_id AND si.company_id = p_company_id
      AND si.product_id IS NOT NULL -- los artículos varios no tienen stock
    ORDER BY si.product_id
  LOOP
    INSERT INTO public.stock_movements (
      company_id, product_id, direction, reason, quantity, reference_sale_id, reference_doc, notes, created_by
    ) VALUES (
      p_company_id, v_item.product_id, 'increase', 'cancellation', v_item.quantity, p_sale_id,
      v_sale.sale_number, 'Anulación ' || v_sale.sale_number, v_user_id
    ) RETURNING id INTO v_movement_id;

    INSERT INTO public.movement_costs (company_id, movement_id, unit_cost, total_cost)
    VALUES (p_company_id, v_movement_id, v_item.unit_cost, pg_catalog.round(v_item.unit_cost * v_item.quantity, 2));
  END LOOP;

  UPDATE public.sales
  SET status = 'cancelled', cancelled_at = v_now, cancelled_by = v_user_id, cancel_reason = v_reason
  WHERE id = p_sale_id AND company_id = p_company_id;

  INSERT INTO public.audit_log (
    company_id, table_name, record_id, action, old_data, new_data, performed_by, actor_role
  ) VALUES (
    p_company_id, 'sales', p_sale_id::TEXT, 'UPDATE',
    pg_catalog.jsonb_build_object('status', 'completed'),
    pg_catalog.jsonb_build_object('status', 'cancelled', 'reason', v_reason, 'total_amount', v_sale.total_amount),
    v_user_id, 'master_admin'
  );

  RETURN pg_catalog.jsonb_build_object(
    'sale_id', p_sale_id, 'sale_number', v_sale.sale_number, 'status', 'cancelled',
    'cancelled_at', v_now, 'already_cancelled', false
  );
END;
$function$;

-- 5. Caja: el efectivo devuelto sale del cajón del turno -----------------------
CREATE OR REPLACE FUNCTION private.cash_session_totals(p_company_id uuid, p_session_id uuid, p_until timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  -- Devoluciones parciales del turno (siempre en efectivo)
  v_cash_refunds := v_cash_refunds + (
    SELECT COALESCE(SUM(sr.refund_amount), 0)::NUMERIC(14, 2)
    FROM public.sale_returns sr
    WHERE sr.company_id = p_company_id
      AND sr.created_at >= v_session.opened_at
      AND sr.created_at < p_until
  );

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
$function$;

-- 6. Dashboard: ventas y costo del día descuentan lo devuelto -------------------
CREATE OR REPLACE FUNCTION public.dashboard_daily_sales(p_company_id uuid, p_days integer)
 RETURNS TABLE(day date, sales_total numeric, sales_count integer, cost_total numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  WITH company AS (
    SELECT c.id, c.timezone,
           (pg_catalog.now() AT TIME ZONE c.timezone)::DATE AS today
    FROM public.companies c
    WHERE c.id = p_company_id
  ),
  days AS (
    SELECT (company.today - offs)::DATE AS day
    FROM company, pg_catalog.generate_series(0, LEAST(GREATEST(p_days, 1), 366) - 1) AS offs
  ),
  sales_by_day AS (
    SELECT (s.created_at AT TIME ZONE company.timezone)::DATE AS day,
           SUM(s.total_amount) AS sales_total,
           COUNT(*)::INT AS sales_count
    FROM public.sales s, company
    WHERE s.company_id = company.id
      AND s.status = 'completed'
      AND s.created_at >= ((SELECT MIN(day) FROM days)::TIMESTAMP AT TIME ZONE company.timezone)
    GROUP BY 1
  ),
  returns_by_day AS (
    SELECT (sr.created_at AT TIME ZONE company.timezone)::DATE AS day,
           SUM(sr.refund_amount) AS returns_total
    FROM public.sale_returns sr, company
    WHERE sr.company_id = company.id
      AND sr.created_at >= ((SELECT MIN(day) FROM days)::TIMESTAMP AT TIME ZONE company.timezone)
    GROUP BY 1
  ),
  returned_cost_by_day AS (
    SELECT (sm.created_at AT TIME ZONE company.timezone)::DATE AS day,
           SUM(mc.total_cost) AS cost_total
    FROM public.stock_movements sm
    JOIN company ON sm.company_id = company.id
    JOIN public.movement_costs mc ON mc.company_id = sm.company_id AND mc.movement_id = sm.id
    WHERE sm.reason = 'sale_return'
      AND sm.created_at >= ((SELECT MIN(day) FROM days)::TIMESTAMP AT TIME ZONE company.timezone)
    GROUP BY 1
  ),
  cost_by_day AS (
    SELECT (s.created_at AT TIME ZONE company.timezone)::DATE AS day,
           SUM(mc.total_cost) AS cost_total
    FROM public.sales s
    JOIN company ON s.company_id = company.id
    JOIN public.stock_movements sm
      ON sm.company_id = s.company_id AND sm.reference_sale_id = s.id AND sm.reason = 'sale'
    JOIN public.movement_costs mc
      ON mc.company_id = sm.company_id AND mc.movement_id = sm.id
    WHERE s.status = 'completed'
      AND s.created_at >= ((SELECT MIN(day) FROM days)::TIMESTAMP AT TIME ZONE company.timezone)
    GROUP BY 1
  )
  SELECT d.day,
         COALESCE(sbd.sales_total, 0) - COALESCE(rbd.returns_total, 0),
         COALESCE(sbd.sales_count, 0),
         COALESCE(cbd.cost_total, 0) - COALESCE(rcd.cost_total, 0)
  FROM days d
  LEFT JOIN sales_by_day sbd ON sbd.day = d.day
  LEFT JOIN cost_by_day cbd ON cbd.day = d.day
  LEFT JOIN returns_by_day rbd ON rbd.day = d.day
  LEFT JOIN returned_cost_by_day rcd ON rcd.day = d.day
  ORDER BY d.day;
$function$;

-- 7. Informe de ventas por día: el total descuenta las devoluciones del día -----
CREATE OR REPLACE FUNCTION public.report_sales_by_day(p_company_id uuid, p_from date, p_to date)
 RETURNS TABLE(sale_date date, sales_count bigint, discount_total numeric, total numeric, credit_total numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tz TEXT := private.assert_report_period(p_company_id, p_from, p_to);
BEGIN
  RETURN QUERY
    WITH day_rows AS (
      SELECT (s.created_at AT TIME ZONE v_tz)::DATE AS d, 1 AS n, s.discount AS disc, s.total_amount AS amt,
             private.sale_credit_amount(s.payments) AS credit
      FROM public.sales s
      WHERE s.company_id = p_company_id
        AND s.status = 'completed'
        AND s.created_at >= p_from::TIMESTAMP AT TIME ZONE v_tz
        AND s.created_at < (p_to + 1)::TIMESTAMP AT TIME ZONE v_tz
      UNION ALL
      SELECT (sr.created_at AT TIME ZONE v_tz)::DATE, 0, 0.00, -sr.refund_amount, 0.00
      FROM public.sale_returns sr
      WHERE sr.company_id = p_company_id
        AND sr.created_at >= p_from::TIMESTAMP AT TIME ZONE v_tz
        AND sr.created_at < (p_to + 1)::TIMESTAMP AT TIME ZONE v_tz
    )
    SELECT dr.d AS sale_date,
           SUM(dr.n)::BIGINT,
           COALESCE(SUM(dr.disc), 0)::NUMERIC(14, 2),
           COALESCE(SUM(dr.amt), 0)::NUMERIC(14, 2),
           COALESCE(SUM(dr.credit), 0)::NUMERIC(14, 2)
    FROM day_rows dr
    GROUP BY 1
    ORDER BY 1;
END;
$function$;

-- 8. Finanzas: ventas, costo y efectivo cobrado descuentan las devoluciones -----
CREATE OR REPLACE FUNCTION public.financial_summary(p_company_id uuid, p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tz TEXT;
  v_start TIMESTAMPTZ;
  v_end TIMESTAMPTZ;
  v_sales_total NUMERIC(14, 2);
  v_sales_count INTEGER;
  v_cancelled_total NUMERIC(14, 2);
  v_cancelled_count INTEGER;
  v_cogs NUMERIC(14, 2);
  v_purchases_total NUMERIC(14, 2);
  v_purchases_count INTEGER;
  v_payments JSONB;
  v_inventory NUMERIC(14, 2);
  v_expenses_total NUMERIC(14, 2);
  v_expenses_count INTEGER;
  v_expenses_by_cat JSONB;
  v_credit_sales NUMERIC(14, 2);
  v_collections NUMERIC(14, 2);
  v_receivable NUMERIC(14, 2);
  v_credit_purchases NUMERIC(14, 2);
  v_supplier_payments NUMERIC(14, 2);
  v_payables NUMERIC(14, 2);
  v_returns_total NUMERIC(14, 2);
  v_returns_count INTEGER;
  v_returns_cost NUMERIC(14, 2);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;

  PERFORM private.assert_module_access(p_company_id, ARRAY['finanzas'], 'view');

  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
    RAISE EXCEPTION 'El período indicado no es válido.';
  END IF;
  IF p_to - p_from > 731 THEN
    RAISE EXCEPTION 'El período no puede superar los 2 años.';
  END IF;

  SELECT c.timezone INTO v_tz FROM public.companies c WHERE c.id = p_company_id;
  v_start := p_from::TIMESTAMP AT TIME ZONE v_tz;
  v_end := (p_to + 1)::TIMESTAMP AT TIME ZONE v_tz;

  SELECT
    COALESCE(SUM(s.total_amount) FILTER (WHERE s.status = 'completed'), 0)::NUMERIC(14, 2),
    (COUNT(*) FILTER (WHERE s.status = 'completed'))::INTEGER,
    COALESCE(SUM(s.total_amount) FILTER (WHERE s.status = 'cancelled'), 0)::NUMERIC(14, 2),
    (COUNT(*) FILTER (WHERE s.status = 'cancelled'))::INTEGER
  INTO v_sales_total, v_sales_count, v_cancelled_total, v_cancelled_count
  FROM public.sales s
  WHERE s.company_id = p_company_id
    AND s.created_at >= v_start AND s.created_at < v_end;

  SELECT COALESCE(SUM(mc.total_cost), 0)::NUMERIC(14, 2)
  INTO v_cogs
  FROM public.sales s
  JOIN public.stock_movements sm
    ON sm.company_id = s.company_id AND sm.reference_sale_id = s.id AND sm.reason = 'sale'
  JOIN public.movement_costs mc
    ON mc.company_id = sm.company_id AND mc.movement_id = sm.id
  WHERE s.company_id = p_company_id
    AND s.status = 'completed'
    AND s.created_at >= v_start AND s.created_at < v_end;

  -- Devoluciones parciales del período: restan a las ventas y al costo de lo vendido
  SELECT COALESCE(SUM(sr.refund_amount), 0)::NUMERIC(14, 2), COUNT(*)::INTEGER
  INTO v_returns_total, v_returns_count
  FROM public.sale_returns sr
  WHERE sr.company_id = p_company_id
    AND sr.created_at >= v_start AND sr.created_at < v_end;

  SELECT COALESCE(SUM(mc.total_cost), 0)::NUMERIC(14, 2)
  INTO v_returns_cost
  FROM public.stock_movements sm
  JOIN public.movement_costs mc ON mc.company_id = sm.company_id AND mc.movement_id = sm.id
  WHERE sm.company_id = p_company_id AND sm.reason = 'sale_return'
    AND sm.created_at >= v_start AND sm.created_at < v_end;

  v_sales_total := v_sales_total - v_returns_total;
  v_cogs := v_cogs - v_returns_cost;

  SELECT COALESCE(SUM(p.total_amount), 0)::NUMERIC(14, 2), COUNT(*)::INTEGER
  INTO v_purchases_total, v_purchases_count
  FROM public.purchases p
  WHERE p.company_id = p_company_id
    AND p.status = 'completed'
    AND p.purchase_date BETWEEN p_from AND p_to;

  -- Cobrado por medio: pagos de ventas (sin cuenta corriente, que todavía no se cobró)
  -- más los cobros de cuenta corriente hechos en el período.
  SELECT COALESCE(pg_catalog.jsonb_object_agg(t.method, t.total), '{}'::JSONB)
  INTO v_payments
  FROM (
    SELECT u.method, SUM(u.amount)::NUMERIC(14, 2) AS total
    FROM (
      SELECT pay.value ->> 'method' AS method, (pay.value ->> 'amount')::NUMERIC AS amount
      FROM public.sales s
      CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(s.payments) AS pay(value)
      WHERE s.company_id = p_company_id
        AND s.status = 'completed'
        AND s.created_at >= v_start AND s.created_at < v_end
        AND pay.value ->> 'method' <> 'cuenta_corriente'
      UNION ALL
      SELECT pay.value ->> 'method', (pay.value ->> 'amount')::NUMERIC
      FROM public.customer_payments cp
      CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(cp.payments) AS pay(value)
      WHERE cp.company_id = p_company_id
        AND cp.status = 'active'
        AND cp.created_at >= v_start AND cp.created_at < v_end
    ) u
    GROUP BY u.method
  ) t;

  SELECT COALESCE(SUM((pay.value ->> 'amount')::NUMERIC), 0)::NUMERIC(14, 2)
  INTO v_credit_sales
  FROM public.sales s
  CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(s.payments) AS pay(value)
  WHERE s.company_id = p_company_id
    AND s.status = 'completed'
    AND s.created_at >= v_start AND s.created_at < v_end
    AND pay.value ->> 'method' = 'cuenta_corriente';

  SELECT COALESCE(SUM(cp.amount), 0)::NUMERIC(14, 2)
  INTO v_collections
  FROM public.customer_payments cp
  WHERE cp.company_id = p_company_id AND cp.status = 'active'
    AND cp.created_at >= v_start AND cp.created_at < v_end;

  SELECT COALESCE(SUM(b.balance) FILTER (WHERE b.balance > 0), 0)::NUMERIC(14, 2)
  INTO v_receivable
  FROM private.customer_balance_rows(p_company_id) b;

  SELECT COALESCE(SUM(p.total_amount), 0)::NUMERIC(14, 2)
  INTO v_credit_purchases
  FROM public.credit_purchases cp
  JOIN public.purchases p ON p.company_id = cp.company_id AND p.id = cp.purchase_id
  WHERE cp.company_id = p_company_id
    AND p.status = 'completed'
    AND p.purchase_date BETWEEN p_from AND p_to;

  SELECT COALESCE(SUM(sp.amount), 0)::NUMERIC(14, 2)
  INTO v_supplier_payments
  FROM public.supplier_payments sp
  WHERE sp.company_id = p_company_id AND sp.status = 'active'
    AND sp.created_at >= v_start AND sp.created_at < v_end;

  SELECT COALESCE(SUM(b.balance) FILTER (WHERE b.balance > 0), 0)::NUMERIC(14, 2)
  INTO v_payables
  FROM private.supplier_balance_rows(p_company_id) b;

  SELECT COALESCE(SUM(pr.current_stock * pc.cost_price), 0)::NUMERIC(14, 2)
  INTO v_inventory
  FROM public.products pr
  JOIN public.product_costs pc
    ON pc.product_id = pr.id AND pc.company_id = pr.company_id
  WHERE pr.company_id = p_company_id AND pr.current_stock > 0;

  SELECT COALESCE(SUM(e.amount), 0)::NUMERIC(14, 2), COUNT(*)::INTEGER
  INTO v_expenses_total, v_expenses_count
  FROM public.expenses e
  WHERE e.company_id = p_company_id AND e.status = 'active'
    AND e.expense_date BETWEEN p_from AND p_to;

  SELECT COALESCE(pg_catalog.jsonb_object_agg(t.category, t.total), '{}'::JSONB)
  INTO v_expenses_by_cat
  FROM (
    SELECT e.category, SUM(e.amount)::NUMERIC(14, 2) AS total
    FROM public.expenses e
    WHERE e.company_id = p_company_id AND e.status = 'active'
      AND e.expense_date BETWEEN p_from AND p_to
    GROUP BY e.category
  ) t;

  -- El efectivo devuelto sale del total cobrado en efectivo
  IF v_returns_total > 0 THEN
    v_payments := v_payments || pg_catalog.jsonb_build_object('efectivo',
      (COALESCE((v_payments ->> 'efectivo')::NUMERIC, 0) - v_returns_total)::NUMERIC(14, 2));
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'returns_total', v_returns_total,
    'returns_count', v_returns_count,
    'sales_total', v_sales_total,
    'sales_count', v_sales_count,
    'cancelled_total', v_cancelled_total,
    'cancelled_count', v_cancelled_count,
    'cogs_total', v_cogs,
    'purchases_total', v_purchases_total,
    'purchases_count', v_purchases_count,
    'payments_by_method', v_payments,
    'inventory_value', v_inventory,
    'expenses_total', v_expenses_total,
    'expenses_count', v_expenses_count,
    'expenses_by_category', v_expenses_by_cat,
    'credit_sales_total', v_credit_sales,
    'collections_total', v_collections,
    'receivable_total', v_receivable,
    'credit_purchases_total', v_credit_purchases,
    'supplier_payments_total', v_supplier_payments,
    'payables_total', v_payables
  );
END;
$function$;
