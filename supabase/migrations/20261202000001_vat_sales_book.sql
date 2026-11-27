-- ============================================================================
-- MIGRACIÓN: FACTURA ELECTRÓNICA ARCA — TANDA 5: LIBRO IVA VENTAS
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
--
-- Comprobantes autorizados por ARCA en un período, uno por fila, con el neto y el IVA
-- por alícuota, para el contador. Las notas de crédito van en negativo.
-- Solo el ambiente activo de la empresa: las facturas de prueba (homologación) no se
-- mezclan con las reales. Acceso: módulo 'informes' (ver).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.vat_sales_book(p_company_id UUID, p_from DATE, p_to DATE)
RETURNS TABLE (
  invoice_id UUID,
  issue_date DATE,
  environment TEXT,
  kind TEXT,
  letter TEXT,
  invoice_type INTEGER,
  point_of_sale INTEGER,
  number INTEGER,
  cae TEXT,
  receiver_doc_type INTEGER,
  receiver_doc_number TEXT,
  receiver_name TEXT,
  receiver_vat_condition TEXT,
  net_amount NUMERIC,
  vat_21 NUMERIC,
  vat_10_5 NUMERIC,
  vat_27 NUMERIC,
  vat_other NUMERIC,
  total_amount NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.assert_module_access(p_company_id, ARRAY['informes'], 'view');
  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
    RAISE EXCEPTION 'El período indicado no es válido.';
  END IF;
  IF p_to - p_from > 731 THEN
    RAISE EXCEPTION 'El período no puede superar los 2 años.';
  END IF;

  RETURN QUERY
  SELECT
    i.id, i.issue_date, i.environment, i.kind, i.letter, i.invoice_type, i.point_of_sale, i.number, i.cae,
    i.receiver_doc_type, i.receiver_doc_number, i.receiver_name, i.receiver_vat_condition,
    s.sign * i.net_amount,
    s.sign * COALESCE(SUM(v.vat_amount) FILTER (WHERE v.vat_rate = 21), 0),
    s.sign * COALESCE(SUM(v.vat_amount) FILTER (WHERE v.vat_rate = 10.5), 0),
    s.sign * COALESCE(SUM(v.vat_amount) FILTER (WHERE v.vat_rate = 27), 0),
    s.sign * COALESCE(SUM(v.vat_amount) FILTER (WHERE v.vat_rate NOT IN (21, 10.5, 27)), 0),
    s.sign * i.total_amount
  FROM public.invoices i
  CROSS JOIN LATERAL (SELECT CASE WHEN i.kind = 'credit_note' THEN -1 ELSE 1 END AS sign) s
  LEFT JOIN public.invoice_vat_lines v ON v.invoice_id = i.id
  WHERE i.company_id = p_company_id
    AND i.status = 'authorized'
    AND i.issue_date BETWEEN p_from AND p_to
    AND i.environment = COALESCE((SELECT a.environment FROM public.arca_settings a WHERE a.company_id = p_company_id), 'homologacion')
  GROUP BY i.id, s.sign
  ORDER BY i.issue_date, i.invoice_type, i.point_of_sale, i.number;
END;
$$;

REVOKE ALL ON FUNCTION public.vat_sales_book(UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vat_sales_book(UUID, DATE, DATE) TO authenticated;
