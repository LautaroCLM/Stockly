-- ============================================================================
-- INFORMES (solo lectura)
--
-- Consultas agregadas para el módulo Informes. Todas son solo para master_admin
-- (muestran costos y márgenes), validan la empresa y filtran por company_id.
-- Los períodos se interpretan en la zona horaria de la empresa: [desde, hasta + 1 día).
--   * report_sales_by_day:       ventas completadas por día.
--   * report_top_products:       productos vendidos, con costo y margen.
--   * report_inventory_valuation: stock actual valuado al costo.
--   * report_expenses:           gastos activos por categoría.
-- ============================================================================

CREATE OR REPLACE FUNCTION private.assert_report_period(p_company_id UUID, p_from DATE, p_to DATE)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tz TEXT;
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
  RETURN v_tz;
END;
$$;

REVOKE ALL ON FUNCTION private.assert_report_period(UUID, DATE, DATE) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Ventas por día
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_sales_by_day(p_company_id UUID, p_from DATE, p_to DATE)
RETURNS TABLE (sale_date DATE, sales_count BIGINT, discount_total NUMERIC, total NUMERIC, credit_total NUMERIC)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tz TEXT := private.assert_report_period(p_company_id, p_from, p_to);
BEGIN
  RETURN QUERY
    SELECT (s.created_at AT TIME ZONE v_tz)::DATE AS sale_date,
           COUNT(*)::BIGINT,
           COALESCE(SUM(s.discount), 0)::NUMERIC(14, 2),
           COALESCE(SUM(s.total_amount), 0)::NUMERIC(14, 2),
           COALESCE(SUM(private.sale_credit_amount(s.payments)), 0)::NUMERIC(14, 2)
    FROM public.sales s
    WHERE s.company_id = p_company_id
      AND s.status = 'completed'
      AND s.created_at >= p_from::TIMESTAMP AT TIME ZONE v_tz
      AND s.created_at < (p_to + 1)::TIMESTAMP AT TIME ZONE v_tz
    GROUP BY 1
    ORDER BY 1;
END;
$$;

REVOKE ALL ON FUNCTION public.report_sales_by_day(UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_sales_by_day(UUID, DATE, DATE) TO authenticated;

-- ----------------------------------------------------------------------------
-- Productos vendidos: cantidad, facturado (antes de descuentos), costo y margen
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_top_products(p_company_id UUID, p_from DATE, p_to DATE, p_limit INTEGER)
RETURNS TABLE (product_id UUID, sku TEXT, product_name TEXT, quantity NUMERIC, revenue NUMERIC, cost NUMERIC)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tz TEXT := private.assert_report_period(p_company_id, p_from, p_to);
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 500);
BEGIN
  RETURN QUERY
    WITH sold AS (
      SELECT si.product_id, SUM(si.quantity) AS qty, SUM(si.subtotal) AS revenue
      FROM public.sales s
      JOIN public.sale_items si ON si.sale_id = s.id AND si.company_id = s.company_id
      WHERE s.company_id = p_company_id
        AND s.status = 'completed'
        AND s.created_at >= p_from::TIMESTAMP AT TIME ZONE v_tz
        AND s.created_at < (p_to + 1)::TIMESTAMP AT TIME ZONE v_tz
      GROUP BY si.product_id
    ),
    costs AS (
      SELECT sm.product_id, SUM(mc.total_cost) AS cost
      FROM public.sales s
      JOIN public.stock_movements sm
        ON sm.company_id = s.company_id AND sm.reference_sale_id = s.id AND sm.reason = 'sale'
      JOIN public.movement_costs mc ON mc.company_id = sm.company_id AND mc.movement_id = sm.id
      WHERE s.company_id = p_company_id
        AND s.status = 'completed'
        AND s.created_at >= p_from::TIMESTAMP AT TIME ZONE v_tz
        AND s.created_at < (p_to + 1)::TIMESTAMP AT TIME ZONE v_tz
      GROUP BY sm.product_id
    )
    SELECT p.id, p.sku, p.name, sold.qty::NUMERIC, sold.revenue::NUMERIC(14, 2), COALESCE(costs.cost, 0)::NUMERIC(14, 2)
    FROM sold
    JOIN public.products p ON p.id = sold.product_id AND p.company_id = p_company_id
    LEFT JOIN costs ON costs.product_id = sold.product_id
    ORDER BY sold.revenue DESC, p.name
    LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.report_top_products(UUID, DATE, DATE, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_top_products(UUID, DATE, DATE, INTEGER) TO authenticated;

-- ----------------------------------------------------------------------------
-- Inventario valuado al costo (productos activos con stock o con costo cargado)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_inventory_valuation(p_company_id UUID)
RETURNS TABLE (product_id UUID, sku TEXT, product_name TEXT, current_stock NUMERIC, cost_price NUMERIC, selling_price NUMERIC, stock_value NUMERIC)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  PERFORM private.assert_company_role(p_company_id, 'master_admin');
  RETURN QUERY
    SELECT p.id, p.sku, p.name, p.current_stock::NUMERIC,
           COALESCE(pc.cost_price, 0)::NUMERIC(14, 2),
           p.selling_price::NUMERIC(14, 2),
           (GREATEST(p.current_stock, 0) * COALESCE(pc.cost_price, 0))::NUMERIC(14, 2)
    FROM public.products p
    LEFT JOIN public.product_costs pc ON pc.product_id = p.id AND pc.company_id = p.company_id
    WHERE p.company_id = p_company_id AND p.is_active
    ORDER BY (GREATEST(p.current_stock, 0) * COALESCE(pc.cost_price, 0)) DESC, p.name;
END;
$$;

REVOKE ALL ON FUNCTION public.report_inventory_valuation(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_inventory_valuation(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- Gastos por categoría
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_expenses(p_company_id UUID, p_from DATE, p_to DATE)
RETURNS TABLE (category TEXT, expenses_count BIGINT, total NUMERIC)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tz TEXT := private.assert_report_period(p_company_id, p_from, p_to);
BEGIN
  RETURN QUERY
    SELECT e.category, COUNT(*)::BIGINT, SUM(e.amount)::NUMERIC(14, 2)
    FROM public.expenses e
    WHERE e.company_id = p_company_id AND e.status = 'active'
      AND e.expense_date BETWEEN p_from AND p_to
    GROUP BY e.category
    ORDER BY SUM(e.amount) DESC, e.category;
END;
$$;

REVOKE ALL ON FUNCTION public.report_expenses(UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_expenses(UUID, DATE, DATE) TO authenticated;
