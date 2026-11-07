-- ============================================================================
-- RESUMEN FINANCIERO (solo lectura)
--
-- Una sola consulta con los números del período, en la zona horaria de la empresa:
--   * Ventas completadas (vendido) y ventas anuladas.
--   * Costo de la mercadería vendida (costo congelado en movement_costs).
--   * Compras completadas.
--   * Cobrado por medio de pago (de los pagos de las ventas completadas).
--   * Valor actual del inventario al costo.
--
-- Qué NO incluye todavía (se suma cuando existan esos módulos): gastos, cuentas a
-- cobrar y a pagar, y seguimiento de acreditación de cheques.
--
-- Solo master_admin: muestra costos. SECURITY DEFINER con validación explícita del
-- rol y de la empresa, y todas las lecturas filtradas por company_id.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.financial_summary(
  p_company_id UUID,
  p_from DATE,
  p_to DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;

  PERFORM private.assert_company_role(p_company_id, 'master_admin');

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

  SELECT COALESCE(SUM(p.total_amount), 0)::NUMERIC(14, 2), COUNT(*)::INTEGER
  INTO v_purchases_total, v_purchases_count
  FROM public.purchases p
  WHERE p.company_id = p_company_id
    AND p.status = 'completed'
    AND p.purchase_date BETWEEN p_from AND p_to;

  SELECT COALESCE(pg_catalog.jsonb_object_agg(t.method, t.total), '{}'::JSONB)
  INTO v_payments
  FROM (
    SELECT pay.value ->> 'method' AS method,
           SUM((pay.value ->> 'amount')::NUMERIC)::NUMERIC(14, 2) AS total
    FROM public.sales s
    CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(s.payments) AS pay(value)
    WHERE s.company_id = p_company_id
      AND s.status = 'completed'
      AND s.created_at >= v_start AND s.created_at < v_end
    GROUP BY pay.value ->> 'method'
  ) t;

  SELECT COALESCE(SUM(pr.current_stock * pc.cost_price), 0)::NUMERIC(14, 2)
  INTO v_inventory
  FROM public.products pr
  JOIN public.product_costs pc
    ON pc.product_id = pr.id AND pc.company_id = pr.company_id
  WHERE pr.company_id = p_company_id AND pr.current_stock > 0;

  RETURN pg_catalog.jsonb_build_object(
    'sales_total', v_sales_total,
    'sales_count', v_sales_count,
    'cancelled_total', v_cancelled_total,
    'cancelled_count', v_cancelled_count,
    'cogs_total', v_cogs,
    'purchases_total', v_purchases_total,
    'purchases_count', v_purchases_count,
    'payments_by_method', v_payments,
    'inventory_value', v_inventory
  );
END;
$$;

COMMENT ON FUNCTION public.financial_summary(UUID, DATE, DATE) IS
  'Resumen financiero del período (ventas, costo, compras, cobros por medio de pago y valor del inventario). Solo master_admin.';

REVOKE ALL ON FUNCTION public.financial_summary(UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.financial_summary(UUID, DATE, DATE) TO authenticated;
