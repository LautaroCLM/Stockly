-- ============================================================================
-- MIGRACIÓN: FACTURA ELECTRÓNICA ARCA — TANDA 4: NOTAS DE CRÉDITO
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
--
-- Una factura autorizada no se anula: se corrige con una nota de crédito (A 3, B 8, C 13)
-- asociada a la factura. Dos casos:
--   * venta anulada  → nota de crédito por el total de la factura
--   * devolución     → nota de crédito por lo devuelto, con la alícuota de cada ítem en la factura
-- Las notas de crédito viven en `invoices` (kind = 'credit_note') y usan el mismo camino
-- que las facturas para pedir el CAE (turno de numeración, consulta antes de reintentar).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ESQUEMA
-- ----------------------------------------------------------------------------
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'invoice';
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS associated_invoice_id UUID;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS sale_return_id UUID;
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS sale_item_id UUID;

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_invoice_type_check;
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS chk_invoices_letter_type;
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS chk_invoices_kind;
ALTER TABLE public.invoices ADD CONSTRAINT chk_invoices_kind CHECK (
  (kind = 'invoice' AND associated_invoice_id IS NULL AND sale_return_id IS NULL
    AND ((letter = 'A' AND invoice_type = 1) OR (letter = 'B' AND invoice_type = 6) OR (letter = 'C' AND invoice_type = 11)))
  OR
  (kind = 'credit_note' AND associated_invoice_id IS NOT NULL
    AND ((letter = 'A' AND invoice_type = 3) OR (letter = 'B' AND invoice_type = 8) OR (letter = 'C' AND invoice_type = 13)))
);

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS fk_invoices_associated;
ALTER TABLE public.invoices ADD CONSTRAINT fk_invoices_associated FOREIGN KEY (company_id, associated_invoice_id)
  REFERENCES public.invoices(company_id, id) ON DELETE RESTRICT;
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS fk_invoices_sale_return;
ALTER TABLE public.invoices ADD CONSTRAINT fk_invoices_sale_return FOREIGN KEY (company_id, sale_return_id)
  REFERENCES public.sale_returns(company_id, id) ON DELETE RESTRICT;
ALTER TABLE public.invoice_items DROP CONSTRAINT IF EXISTS fk_invoice_items_sale_item;
ALTER TABLE public.invoice_items ADD CONSTRAINT fk_invoice_items_sale_item FOREIGN KEY (company_id, sale_item_id)
  REFERENCES public.sale_items(company_id, id) ON DELETE RESTRICT;

-- Una factura viva por venta; una nota de crédito viva por devolución, y una por anulación
DROP INDEX IF EXISTS public.uq_invoices_live_per_sale;
CREATE UNIQUE INDEX uq_invoices_live_per_sale
  ON public.invoices (company_id, sale_id) WHERE status IN ('pending', 'authorized') AND kind = 'invoice';
CREATE UNIQUE INDEX IF NOT EXISTS uq_credit_notes_live_per_return
  ON public.invoices (company_id, sale_return_id)
  WHERE status IN ('pending', 'authorized') AND kind = 'credit_note' AND sale_return_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_credit_notes_live_cancellation
  ON public.invoices (company_id, associated_invoice_id)
  WHERE status IN ('pending', 'authorized') AND kind = 'credit_note' AND sale_return_id IS NULL;

-- ----------------------------------------------------------------------------
-- 2. FACTURA: guarda la línea de venta de cada ítem (para saber su alícuota al devolver)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prepare_invoice(p_company_id UUID, p_sale_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sale RECORD;
  v_customer RECORD;
  v_issuer TEXT;
  v_pos INTEGER;
  v_env TEXT;
  v_cuit TEXT;
  v_letter TEXT;
  v_condition TEXT := 'consumidor_final';
  v_doc_type INTEGER := 99;
  v_doc_number TEXT := '0';
  v_name TEXT := 'Consumidor final';
  v_address TEXT;
  v_digits TEXT;
  v_invoice UUID;
  v_group RECORD;
  v_groups INTEGER;
  v_index INTEGER := 0;
  v_remaining NUMERIC(14, 2);
  v_alloc NUMERIC(14, 2);
  v_gross NUMERIC(14, 2);
  v_base NUMERIC(14, 2);
  v_rates NUMERIC[] := ARRAY[]::NUMERIC[];
  v_bases NUMERIC[] := ARRAY[]::NUMERIC[];
  v_vats NUMERIC[] := ARRAY[]::NUMERIC[];
  v_net NUMERIC(14, 2) := 0;
  v_vat NUMERIC(14, 2) := 0;
BEGIN
  PERFORM private.assert_module_access(p_company_id, ARRAY['facturacion'], 'operate');

  SELECT * INTO v_sale FROM public.sales WHERE id = p_sale_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venta no encontrada.'; END IF;
  IF v_sale.status <> 'completed' THEN RAISE EXCEPTION 'No se puede facturar una venta anulada.'; END IF;
  IF v_sale.total_amount <= 0 THEN RAISE EXCEPTION 'No se puede facturar una venta de $ 0.'; END IF;
  IF EXISTS (SELECT 1 FROM public.sale_returns WHERE company_id = p_company_id AND sale_id = p_sale_id) THEN
    RAISE EXCEPTION 'Esta venta ya tiene devoluciones: una venta se factura antes de devolver productos.';
  END IF;

  -- Reintento: la factura pendiente se sigue usando (puede tener un número ya pedido a ARCA)
  SELECT id INTO v_invoice FROM public.invoices
  WHERE company_id = p_company_id AND sale_id = p_sale_id AND status = 'pending' AND kind = 'invoice';
  IF FOUND THEN RETURN v_invoice; END IF;
  IF EXISTS (SELECT 1 FROM public.invoices WHERE company_id = p_company_id AND sale_id = p_sale_id AND status = 'authorized' AND kind = 'invoice') THEN
    RAISE EXCEPTION 'Esta venta ya está facturada.';
  END IF;

  SELECT tax_condition INTO v_issuer FROM public.document_settings WHERE company_id = p_company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cargá la condición frente al IVA de la empresa en "Datos para comprobantes".'; END IF;
  SELECT point_of_sale, environment INTO v_pos, v_env FROM public.arca_settings WHERE company_id = p_company_id;
  IF v_pos IS NULL THEN RAISE EXCEPTION 'Falta cargar el punto de venta electrónico en "Factura electrónica (ARCA)".'; END IF;
  SELECT pg_catalog.regexp_replace(COALESCE(tax_id, ''), '\D', '', 'g') INTO v_cuit FROM public.companies WHERE id = p_company_id;
  IF pg_catalog.length(v_cuit) <> 11 THEN RAISE EXCEPTION 'La empresa no tiene un CUIT válido cargado.'; END IF;

  IF v_sale.customer_id IS NOT NULL THEN
    SELECT name, identification_type, tax_id, vat_condition, address INTO v_customer
    FROM public.customers WHERE id = v_sale.customer_id AND company_id = p_company_id;
    v_condition := v_customer.vat_condition;
    v_name := pg_catalog.left(v_customer.name, 200);
    v_address := v_customer.address;
    v_digits := pg_catalog.regexp_replace(COALESCE(v_customer.tax_id, ''), '\D', '', 'g');
    IF v_digits <> '' AND v_customer.identification_type IN ('CUIT', 'CUIL', 'DNI') AND pg_catalog.length(v_digits) <= 11 THEN
      v_doc_type := CASE v_customer.identification_type WHEN 'CUIT' THEN 80 WHEN 'CUIL' THEN 86 ELSE 96 END;
      v_doc_number := v_digits;
    END IF;
  END IF;

  v_letter := private.invoice_letter(v_issuer, v_condition);
  IF v_letter IS NULL THEN
    RAISE EXCEPTION 'Con la condición frente al IVA de la empresa no se emite factura electrónica.';
  END IF;
  IF v_letter = 'A' AND v_doc_type <> 80 THEN
    RAISE EXCEPTION 'Para hacerle Factura A, el cliente necesita su CUIT cargado.';
  END IF;

  -- IVA por alícuota: el descuento de la venta se reparte en proporción; el grupo más grande
  -- (el último) se lleva la diferencia de redondeo. El precio de venta ya incluye el IVA.
  IF (SELECT COALESCE(SUM(subtotal), 0) FROM public.sale_items WHERE company_id = p_company_id AND sale_id = p_sale_id)
     <> v_sale.subtotal THEN
    RAISE EXCEPTION 'Los ítems de la venta no coinciden con su subtotal.';
  END IF;
  IF v_letter <> 'C' THEN
    SELECT COUNT(DISTINCT COALESCE(p.vat_rate, 21.00)) INTO v_groups
    FROM public.sale_items si LEFT JOIN public.products p ON p.id = si.product_id AND p.company_id = si.company_id
    WHERE si.company_id = p_company_id AND si.sale_id = p_sale_id;
    v_remaining := v_sale.discount;
    FOR v_group IN
      SELECT COALESCE(p.vat_rate, 21.00) AS rate, SUM(si.subtotal) AS gross
      FROM public.sale_items si LEFT JOIN public.products p ON p.id = si.product_id AND p.company_id = si.company_id
      WHERE si.company_id = p_company_id AND si.sale_id = p_sale_id
      GROUP BY 1 ORDER BY 2, 1
    LOOP
      v_index := v_index + 1;
      v_alloc := CASE WHEN v_index = v_groups THEN v_remaining
                      ELSE pg_catalog.round(v_sale.discount * v_group.gross / v_sale.subtotal, 2) END;
      v_remaining := v_remaining - v_alloc;
      v_gross := v_group.gross - v_alloc;
      v_base := pg_catalog.round(v_gross / (1 + v_group.rate / 100), 2);
      v_rates := v_rates || v_group.rate;
      v_bases := v_bases || v_base;
      v_vats := v_vats || (v_gross - v_base);
      v_net := v_net + v_base;
      v_vat := v_vat + (v_gross - v_base);
    END LOOP;
  ELSE
    v_net := v_sale.total_amount;
  END IF;

  INSERT INTO public.invoices (
    company_id, sale_id, environment, letter, invoice_type, point_of_sale, issue_date,
    receiver_doc_type, receiver_doc_number, receiver_name, receiver_vat_condition, receiver_vat_condition_id, receiver_address,
    subtotal, discount, net_amount, vat_amount, total_amount, created_by
  ) VALUES (
    p_company_id, p_sale_id, COALESCE(v_env, 'homologacion'), v_letter,
    CASE v_letter WHEN 'A' THEN 1 WHEN 'B' THEN 6 ELSE 11 END, v_pos,
    (pg_catalog.now() AT TIME ZONE COALESCE((SELECT timezone FROM public.companies WHERE id = p_company_id), 'America/Argentina/Buenos_Aires'))::DATE,
    v_doc_type, v_doc_number, v_name, v_condition, private.arca_receiver_condition_id(v_condition), v_address,
    v_sale.subtotal, v_sale.discount, v_net, v_vat, v_sale.total_amount, auth.uid()
  ) RETURNING id INTO v_invoice;

  INSERT INTO public.invoice_items (company_id, invoice_id, position, description, quantity, unit_price, vat_rate, line_total, sale_item_id)
  SELECT p_company_id, v_invoice,
    pg_catalog.row_number() OVER (ORDER BY si.created_at, si.id),
    pg_catalog.left(COALESCE(p.name, si.description, 'Artículo'), 200), si.quantity, si.unit_price,
    CASE WHEN v_letter = 'C' THEN 0 ELSE COALESCE(p.vat_rate, 21.00) END, si.subtotal, si.id
  FROM public.sale_items si LEFT JOIN public.products p ON p.id = si.product_id AND p.company_id = si.company_id
  WHERE si.company_id = p_company_id AND si.sale_id = p_sale_id;

  FOR v_index IN 1 .. COALESCE(pg_catalog.array_length(v_rates, 1), 0) LOOP
    INSERT INTO public.invoice_vat_lines (company_id, invoice_id, vat_rate, arca_vat_id, base_amount, vat_amount)
    VALUES (p_company_id, v_invoice, v_rates[v_index], private.arca_vat_id(v_rates[v_index]), v_bases[v_index], v_vats[v_index]);
  END LOOP;

  RETURN v_invoice;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_invoice(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prepare_invoice(UUID, UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. QUÉ NOTAS DE CRÉDITO FALTAN (ventas facturadas con anulación o devoluciones sin nota)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pending_credit_notes(p_company_id UUID, p_sale_ids UUID[])
RETURNS TABLE (sale_id UUID, sale_return_id UUID, return_number TEXT, amount NUMERIC)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH inv AS (
    SELECT i.id, i.sale_id, i.total_amount FROM public.invoices i
    WHERE i.company_id = p_company_id AND i.sale_id = ANY (p_sale_ids) AND i.kind = 'invoice' AND i.status = 'authorized'
      AND p_company_id IN (SELECT private.my_accessible_company_ids())
  )
  -- Anulación: nota por lo que todavía no se acreditó
  SELECT inv.sale_id, NULL::UUID, NULL::TEXT,
    inv.total_amount - COALESCE((SELECT SUM(n.total_amount) FROM public.invoices n
      WHERE n.associated_invoice_id = inv.id AND n.status IN ('pending', 'authorized')), 0)
  FROM inv JOIN public.sales s ON s.id = inv.sale_id
  WHERE s.status = 'cancelled'
    AND NOT EXISTS (SELECT 1 FROM public.invoices n WHERE n.associated_invoice_id = inv.id
      AND n.sale_return_id IS NULL AND n.status IN ('pending', 'authorized'))
  UNION ALL
  -- Devoluciones posteriores a la factura sin su nota
  SELECT inv.sale_id, r.id, r.return_number, r.refund_amount
  FROM inv JOIN public.sale_returns r ON r.company_id = p_company_id AND r.sale_id = inv.sale_id
  WHERE r.refund_amount > 0
    AND NOT EXISTS (SELECT 1 FROM public.invoices n WHERE n.sale_return_id = r.id AND n.status IN ('pending', 'authorized'));
$$;

REVOKE ALL ON FUNCTION public.pending_credit_notes(UUID, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pending_credit_notes(UUID, UUID[]) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. PREPARAR UNA NOTA DE CRÉDITO (queda pendiente hasta que ARCA la autorice)
--    p_sale_return_id NULL = por la anulación de la venta (total de la factura)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prepare_credit_note(p_company_id UUID, p_sale_id UUID, p_sale_return_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  inv RECORD;
  v_note UUID;
  v_letter TEXT;
  v_total NUMERIC(14, 2);
  v_credited NUMERIC(14, 2);
  v_group RECORD;
  v_base NUMERIC(14, 2);
  v_net NUMERIC(14, 2) := 0;
  v_vat NUMERIC(14, 2) := 0;
BEGIN
  PERFORM private.assert_module_access(p_company_id, ARRAY['facturacion'], 'operate');

  SELECT * INTO inv FROM public.invoices
  WHERE company_id = p_company_id AND sale_id = p_sale_id AND kind = 'invoice' AND status = 'authorized'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La venta no tiene una factura autorizada.'; END IF;
  v_letter := inv.letter;

  -- Reintento: la nota pendiente se sigue usando
  SELECT id INTO v_note FROM public.invoices
  WHERE company_id = p_company_id AND associated_invoice_id = inv.id AND status = 'pending'
    AND sale_return_id IS NOT DISTINCT FROM p_sale_return_id;
  IF FOUND THEN RETURN v_note; END IF;
  IF EXISTS (SELECT 1 FROM public.invoices WHERE company_id = p_company_id AND associated_invoice_id = inv.id
             AND status = 'authorized' AND sale_return_id IS NOT DISTINCT FROM p_sale_return_id) THEN
    RAISE EXCEPTION 'Esa nota de crédito ya fue emitida.';
  END IF;

  IF p_sale_return_id IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.sales WHERE id = p_sale_id AND company_id = p_company_id AND status = 'cancelled') THEN
      RAISE EXCEPTION 'La nota de crédito total es para ventas anuladas.';
    END IF;
    v_total := inv.total_amount;
  ELSE
    SELECT refund_amount INTO v_total FROM public.sale_returns
    WHERE id = p_sale_return_id AND company_id = p_company_id AND sale_id = p_sale_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Devolución no encontrada en esta venta.'; END IF;
  END IF;
  IF v_total <= 0 THEN RAISE EXCEPTION 'No hay importe para acreditar.'; END IF;

  SELECT COALESCE(SUM(total_amount), 0) INTO v_credited FROM public.invoices
  WHERE company_id = p_company_id AND associated_invoice_id = inv.id AND status IN ('pending', 'authorized');
  -- Una venta con devoluciones no se puede anular, así que la nota total siempre parte de cero
  IF p_sale_return_id IS NULL AND v_credited > 0 THEN
    RAISE EXCEPTION 'La factura ya tiene notas de crédito: no se puede acreditar el total.';
  ELSIF v_credited + v_total > inv.total_amount THEN
    RAISE EXCEPTION 'Las notas de crédito superarían el total de la factura.';
  END IF;

  INSERT INTO public.invoices (
    company_id, sale_id, environment, kind, associated_invoice_id, sale_return_id, letter, invoice_type, point_of_sale,
    issue_date, receiver_doc_type, receiver_doc_number, receiver_name, receiver_vat_condition, receiver_vat_condition_id,
    receiver_address, subtotal, discount, net_amount, vat_amount, total_amount, created_by
  ) VALUES (
    p_company_id, p_sale_id, inv.environment, 'credit_note', inv.id, p_sale_return_id, v_letter,
    CASE v_letter WHEN 'A' THEN 3 WHEN 'B' THEN 8 ELSE 13 END, inv.point_of_sale,
    (pg_catalog.now() AT TIME ZONE COALESCE((SELECT timezone FROM public.companies WHERE id = p_company_id), 'America/Argentina/Buenos_Aires'))::DATE,
    inv.receiver_doc_type, inv.receiver_doc_number, inv.receiver_name, inv.receiver_vat_condition,
    inv.receiver_vat_condition_id, inv.receiver_address, v_total, 0, v_total, 0, v_total, auth.uid()
  ) RETURNING id INTO v_note;

  -- Ítems: por la anulación, los de la factura; por una devolución, lo devuelto con la
  -- alícuota que tenía cada ítem en la factura
  IF p_sale_return_id IS NULL THEN
    INSERT INTO public.invoice_items (company_id, invoice_id, position, description, quantity, unit_price, vat_rate, line_total, sale_item_id)
    SELECT company_id, v_note, position, description, quantity, unit_price, vat_rate, line_total, sale_item_id
    FROM public.invoice_items WHERE invoice_id = inv.id;
    UPDATE public.invoices SET subtotal = inv.subtotal, discount = inv.discount WHERE id = v_note;
  ELSE
    INSERT INTO public.invoice_items (company_id, invoice_id, position, description, quantity, unit_price, vat_rate, line_total, sale_item_id)
    SELECT p_company_id, v_note, pg_catalog.row_number() OVER (ORDER BY ri.id),
      COALESCE(ii.description, 'Devolución'), ri.quantity, pg_catalog.round(ri.amount / ri.quantity, 2),
      CASE WHEN v_letter = 'C' THEN 0 ELSE COALESCE(ii.vat_rate, 21.00) END, ri.amount, ri.sale_item_id
    FROM public.sale_return_items ri
    LEFT JOIN public.invoice_items ii ON ii.invoice_id = inv.id AND ii.sale_item_id = ri.sale_item_id
    WHERE ri.company_id = p_company_id AND ri.return_id = p_sale_return_id;
  END IF;

  -- IVA por alícuota a partir de los ítems de la nota (el precio incluye IVA)
  IF v_letter <> 'C' THEN
    IF p_sale_return_id IS NULL THEN
      INSERT INTO public.invoice_vat_lines (company_id, invoice_id, vat_rate, arca_vat_id, base_amount, vat_amount)
      SELECT company_id, v_note, vat_rate, arca_vat_id, base_amount, vat_amount FROM public.invoice_vat_lines WHERE invoice_id = inv.id;
      SELECT inv.net_amount, inv.vat_amount INTO v_net, v_vat;
    ELSE
      FOR v_group IN
        SELECT vat_rate AS rate, SUM(line_total) AS gross FROM public.invoice_items WHERE invoice_id = v_note GROUP BY 1
      LOOP
        v_base := pg_catalog.round(v_group.gross / (1 + v_group.rate / 100), 2);
        INSERT INTO public.invoice_vat_lines (company_id, invoice_id, vat_rate, arca_vat_id, base_amount, vat_amount)
        VALUES (p_company_id, v_note, v_group.rate, private.arca_vat_id(v_group.rate), v_base, v_group.gross - v_base);
        v_net := v_net + v_base;
        v_vat := v_vat + (v_group.gross - v_base);
      END LOOP;
    END IF;
    UPDATE public.invoices SET net_amount = v_net, vat_amount = v_vat WHERE id = v_note;
  END IF;

  RETURN v_note;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_credit_note(UUID, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prepare_credit_note(UUID, UUID, UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. EDGE FUNCTION: la nota de crédito informa la factura asociada (CbtesAsoc);
--    una factura pendiente de una venta ya anulada no se emite.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.arca_invoice_context(p_company_id UUID, p_invoice_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  i RECORD;
BEGIN
  PERFORM private.assert_module_access(p_company_id, ARRAY['facturacion'], 'operate');
  SELECT environment, kind, sale_id, attempt_number INTO i FROM public.invoices WHERE id = p_invoice_id AND company_id = p_company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factura no encontrada.'; END IF;
  -- Sin intento previo no hay riesgo de que ARCA ya la tenga: no se emite
  IF i.kind = 'invoice' AND i.attempt_number IS NULL
     AND EXISTS (SELECT 1 FROM public.sales WHERE id = i.sale_id AND status = 'cancelled') THEN
    RAISE EXCEPTION 'La venta fue anulada: esta factura ya no se emite.';
  END IF;
  RETURN jsonb_build_object(
    'userId', auth.uid(),
    'environment', i.environment,
    'cuit', (SELECT pg_catalog.regexp_replace(COALESCE(tax_id, ''), '\D', '', 'g') FROM public.companies WHERE id = p_company_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.arca_get_invoice(p_invoice_id UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', i.id, 'companyId', i.company_id, 'environment', i.environment, 'letter', i.letter,
    'invoiceType', i.invoice_type, 'pointOfSale', i.point_of_sale, 'number', i.number,
    'issueDate', i.issue_date, 'receiverDocType', i.receiver_doc_type, 'receiverDocNumber', i.receiver_doc_number,
    'receiverVatConditionId', i.receiver_vat_condition_id, 'netAmount', i.net_amount, 'vatAmount', i.vat_amount,
    'totalAmount', i.total_amount, 'status', i.status, 'attemptNumber', i.attempt_number,
    'vatLines', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('arcaVatId', v.arca_vat_id, 'base', v.base_amount, 'amount', v.vat_amount) ORDER BY v.vat_rate)
      FROM public.invoice_vat_lines v WHERE v.invoice_id = i.id
    ), '[]'::jsonb),
    'associated', (
      SELECT jsonb_build_object('invoiceType', a.invoice_type, 'pointOfSale', a.point_of_sale, 'number', a.number, 'issueDate', a.issue_date)
      FROM public.invoices a WHERE a.id = i.associated_invoice_id
    )
  )
  FROM public.invoices i WHERE i.id = p_invoice_id;
$$;
REVOKE ALL ON FUNCTION public.arca_get_invoice(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.arca_get_invoice(UUID) TO service_role;
