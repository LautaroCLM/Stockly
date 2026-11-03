-- ============================================================================
-- MIGRACIÓN INCREMENTAL: RESUMEN DIARIO DE VENTAS PARA EL DASHBOARD (Hallazgo H-10)
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
-- Problema: el dashboard solo mostraba datos simulados; las empresas reales veían un
--           panel vacío. Calcular métricas en el navegador obligaría a descargar todas
--           las ventas.
-- Solución: agregación por día en el servidor, en la zona horaria de la empresa,
--           incluyendo los días sin ventas. Solo cuenta ventas completadas.
--           SECURITY INVOKER: rigen las políticas RLS; el costo (movement_costs) solo
--           lo ve un master_admin, para el resto llega en 0.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.dashboard_daily_sales(
  p_company_id UUID,
  p_days INT
)
RETURNS TABLE (
  day DATE,
  sales_total NUMERIC,
  sales_count INT,
  cost_total NUMERIC
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
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
         COALESCE(sbd.sales_total, 0),
         COALESCE(sbd.sales_count, 0),
         COALESCE(cbd.cost_total, 0)
  FROM days d
  LEFT JOIN sales_by_day sbd ON sbd.day = d.day
  LEFT JOIN cost_by_day cbd ON cbd.day = d.day
  ORDER BY d.day;
$$;

COMMENT ON FUNCTION public.dashboard_daily_sales(UUID, INT) IS
  'Totales diarios de ventas completadas (y su costo, visible solo para master_admin) de los últimos p_days días en la zona horaria de la empresa. Respeta RLS.';

REVOKE ALL ON FUNCTION public.dashboard_daily_sales(UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_daily_sales(UUID, INT) TO authenticated;
