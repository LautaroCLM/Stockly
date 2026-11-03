-- ============================================================================
-- MIGRACIÓN INCREMENTAL: RESUMEN DE COMPRAS (Hallazgos H-02 / H-06 en Compras)
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
-- Problema: la pantalla de Compras sumaba en el navegador la cantidad y el total
--           invertido. Con la lista paginada en el servidor, esa suma sería parcial.
-- Solución: agregación en el servidor de las compras completadas (sin anuladas).
--           SECURITY INVOKER: rige RLS, así que solo un master_admin obtiene valores.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.purchases_summary(p_company_id UUID)
RETURNS TABLE (completed_count INT, completed_total NUMERIC)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT COUNT(*)::INT, COALESCE(SUM(p.total_amount), 0)
  FROM public.purchases p
  WHERE p.company_id = p_company_id
    AND p.status = 'completed';
$$;

COMMENT ON FUNCTION public.purchases_summary(UUID) IS
  'Cantidad y total de compras completadas (sin anuladas) de la empresa. Respeta RLS: solo master_admin obtiene valores.';

REVOKE ALL ON FUNCTION public.purchases_summary(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchases_summary(UUID) TO authenticated;
