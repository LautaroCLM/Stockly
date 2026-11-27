-- ============================================================================
-- MIGRACIÓN: CLIENTES MUNICIPIO
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
--
-- Marca de cliente "Es municipio / organismo público". El módulo Municipio muestra la cuenta
-- corriente de esos clientes (una vista de Cobros y Pagos; no hay datos duplicados).
-- Acceso: marcar o desmarcar con el módulo 'clientes' (operar), igual que editar un cliente.
-- ============================================================================

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS is_municipality BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.set_customer_municipality(p_company_id UUID, p_customer_id UUID, p_is_municipality BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.assert_module_access(p_company_id, ARRAY['clientes'], 'operate');
  IF p_is_municipality IS NULL THEN
    RAISE EXCEPTION 'Indicá si el cliente es un municipio.';
  END IF;
  UPDATE public.customers SET is_municipality = p_is_municipality, updated_at = pg_catalog.now()
  WHERE company_id = p_company_id AND id = p_customer_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente no encontrado en esta empresa.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_customer_municipality(UUID, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_customer_municipality(UUID, UUID, BOOLEAN) TO authenticated;
