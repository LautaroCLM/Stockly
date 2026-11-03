-- ============================================================================
-- MIGRACIÓN INCREMENTAL: PRODUCTOS CON MOVIMIENTOS (Hallazgo H-02)
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
-- Problema: la carga inicial leía todos los stock_movements de la empresa para saber
--           qué productos ya tenían historia. PostgREST corta en 1000 filas, así que con
--           más movimientos la pantalla marcaba como elegibles productos que no lo eran.
-- Solución: consulta puntual por producto usando idx_stock_movements_company_prod.
--           SECURITY INVOKER: las políticas RLS de stock_movements siguen aplicando.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.products_with_movements(
  p_company_id UUID,
  p_product_ids UUID[]
)
RETURNS TABLE (product_id UUID)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT candidate.id
  FROM pg_catalog.unnest(p_product_ids) AS candidate(id)
  WHERE EXISTS (
    SELECT 1
    FROM public.stock_movements m
    WHERE m.company_id = p_company_id
      AND m.product_id = candidate.id
  );
$$;

COMMENT ON FUNCTION public.products_with_movements(UUID, UUID[]) IS
  'Devuelve, de los productos indicados, los que tienen al menos un movimiento de stock en la empresa. Respeta RLS (SECURITY INVOKER).';

REVOKE ALL ON FUNCTION public.products_with_movements(UUID, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.products_with_movements(UUID, UUID[]) TO authenticated;
