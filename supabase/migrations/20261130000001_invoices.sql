-- ============================================================================
-- MIGRACIÓN: FACTURA ELECTRÓNICA ARCA — TANDA 3: FACTURAS A, B Y C
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
--
-- Una factura se cuelga de una venta ya cobrada. prepare_invoice arma todos los datos
-- (letra, receptor, IVA por alícuota) en la base, como única fuente de verdad, y deja la
-- factura "pendiente". La Edge Function `arca` pide el número y el CAE a ARCA y guarda el
-- resultado. Una factura autorizada no se anula: se corrige con nota de crédito (tanda 4).
-- Acceso: módulo 'facturacion' (empleado: sin acceso por defecto; el admin siempre opera).
-- ============================================================================

ALTER TABLE public.company_module_permissions DROP CONSTRAINT IF EXISTS company_module_permissions_module_check;
ALTER TABLE public.company_module_permissions ADD CONSTRAINT company_module_permissions_module_check CHECK (module IN (
  'compras', 'finanzas', 'gastos', 'cobros_pagos', 'informes', 'maquinas', 'personal', 'fichaje',
  'productos', 'caja', 'clientes', 'proveedores', 'anular_ventas', 'documentos', 'precios', 'facturacion'
));

-- ----------------------------------------------------------------------------
-- 1. TABLAS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  sale_id UUID NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('homologacion', 'produccion')),
  letter TEXT NOT NULL CHECK (letter IN ('A', 'B', 'C')),
  invoice_type INTEGER NOT NULL CHECK (invoice_type IN (1, 6, 11)),
  point_of_sale INTEGER NOT NULL CHECK (point_of_sale BETWEEN 1 AND 99998),
  number INTEGER CHECK (number IS NULL OR number > 0),
  issue_date DATE NOT NULL,
  receiver_doc_type INTEGER NOT NULL CHECK (receiver_doc_type IN (80, 86, 96, 99)),
  receiver_doc_number TEXT NOT NULL CHECK (receiver_doc_number ~ '^[0-9]{1,11}$'),
  receiver_name TEXT NOT NULL CHECK (pg_catalog.length(receiver_name) BETWEEN 1 AND 200),
  receiver_vat_condition TEXT NOT NULL,
  receiver_vat_condition_id INTEGER NOT NULL CHECK (receiver_vat_condition_id IN (1, 4, 5, 6, 15)),
  receiver_address TEXT,
  subtotal NUMERIC(14, 2) NOT NULL CHECK (subtotal >= 0),
  discount NUMERIC(14, 2) NOT NULL CHECK (discount >= 0),
  net_amount NUMERIC(14, 2) NOT NULL CHECK (net_amount >= 0),
  vat_amount NUMERIC(14, 2) NOT NULL CHECK (vat_amount >= 0),
  total_amount NUMERIC(14, 2) NOT NULL CHECK (total_amount > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'authorized', 'rejected')),
  attempt_number INTEGER,
  cae TEXT CHECK (cae IS NULL OR cae ~ '^[0-9]{14}$'),
  cae_expires_at DATE,
  authorized_at TIMESTAMPTZ,
  arca_message TEXT CHECK (arca_message IS NULL OR pg_catalog.length(arca_message) <= 2000),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_invoices_company_id UNIQUE (company_id, id),
  CONSTRAINT fk_invoices_sale FOREIGN KEY (company_id, sale_id) REFERENCES public.sales(company_id, id) ON DELETE RESTRICT,
  CONSTRAINT chk_invoices_total CHECK (total_amount = net_amount + vat_amount AND total_amount = subtotal - discount),
  CONSTRAINT chk_invoices_authorized CHECK (
    (status = 'authorized') = (cae IS NOT NULL AND number IS NOT NULL AND cae_expires_at IS NOT NULL AND authorized_at IS NOT NULL)
  ),
  CONSTRAINT chk_invoices_letter_type CHECK (
    (letter = 'A' AND invoice_type = 1) OR (letter = 'B' AND invoice_type = 6) OR (letter = 'C' AND invoice_type = 11)
  )
);

-- Una sola factura viva (pendiente o autorizada) por venta; las rechazadas quedan de historial
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_live_per_sale
  ON public.invoices (company_id, sale_id) WHERE status IN ('pending', 'authorized');
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_number
  ON public.invoices (company_id, environment, point_of_sale, invoice_type, number) WHERE number IS NOT NULL;
CREATE INDEX IF NOT EXISTS invoices_company_created_idx ON public.invoices (company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  invoice_id UUID NOT NULL,
  position INTEGER NOT NULL CHECK (position > 0),
  description TEXT NOT NULL CHECK (pg_catalog.length(description) BETWEEN 1 AND 200),
  quantity NUMERIC(12, 2) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(14, 2) NOT NULL CHECK (unit_price >= 0),
  vat_rate NUMERIC(5, 2) NOT NULL CHECK (vat_rate IN (0.00, 2.50, 5.00, 10.50, 21.00, 27.00)),
  line_total NUMERIC(14, 2) NOT NULL CHECK (line_total >= 0),
  CONSTRAINT fk_invoice_items_invoice FOREIGN KEY (company_id, invoice_id) REFERENCES public.invoices(company_id, id) ON DELETE RESTRICT,
  CONSTRAINT uq_invoice_items_position UNIQUE (invoice_id, position)
);

CREATE TABLE IF NOT EXISTS public.invoice_vat_lines (
  company_id UUID NOT NULL,
  invoice_id UUID NOT NULL,
  vat_rate NUMERIC(5, 2) NOT NULL,
  arca_vat_id INTEGER NOT NULL CHECK (arca_vat_id IN (3, 4, 5, 6, 8, 9)),
  base_amount NUMERIC(14, 2) NOT NULL CHECK (base_amount >= 0),
  vat_amount NUMERIC(14, 2) NOT NULL CHECK (vat_amount >= 0),
  PRIMARY KEY (invoice_id, vat_rate),
  CONSTRAINT fk_invoice_vat_invoice FOREIGN KEY (company_id, invoice_id) REFERENCES public.invoices(company_id, id) ON DELETE RESTRICT
);

-- Turno para pedir número: dos facturas del mismo punto de venta y tipo no van a ARCA a la vez
CREATE TABLE IF NOT EXISTS public.arca_numbering_locks (
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  environment TEXT NOT NULL,
  point_of_sale INTEGER NOT NULL,
  invoice_type INTEGER NOT NULL,
  invoice_id UUID NOT NULL,
  locked_until TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (company_id, environment, point_of_sale, invoice_type)
);

DROP TRIGGER IF EXISTS tr_audit_invoices ON public.invoices;
CREATE TRIGGER tr_audit_invoices
  AFTER INSERT OR UPDATE OR DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger('id');

-- Ítems y alícuotas no cambian nunca; la factura no se borra
CREATE OR REPLACE FUNCTION public.guard_invoice_mutation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Las facturas no se pueden borrar.';
  END IF;
  IF TG_TABLE_NAME <> 'invoices' THEN
    RAISE EXCEPTION 'El detalle de una factura no se puede modificar.';
  END IF;
  IF OLD.status = 'authorized' THEN
    RAISE EXCEPTION 'Una factura autorizada no se modifica: se corrige con una nota de crédito.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_invoice_mutation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tr_invoices_guard ON public.invoices;
CREATE TRIGGER tr_invoices_guard BEFORE UPDATE OR DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_mutation();
DROP TRIGGER IF EXISTS tr_invoice_items_guard ON public.invoice_items;
CREATE TRIGGER tr_invoice_items_guard BEFORE UPDATE OR DELETE ON public.invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_mutation();
DROP TRIGGER IF EXISTS tr_invoice_vat_guard ON public.invoice_vat_lines;
CREATE TRIGGER tr_invoice_vat_guard BEFORE UPDATE OR DELETE ON public.invoice_vat_lines
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_mutation();

-- ----------------------------------------------------------------------------
-- 2. RLS: el equipo ve las facturas (salen en el historial de ventas); nadie escribe directo
-- ----------------------------------------------------------------------------
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_vat_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_vat_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE public.arca_numbering_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arca_numbering_locks FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoices_select" ON public.invoices;
CREATE POLICY "invoices_select" ON public.invoices FOR SELECT TO authenticated
  USING (company_id IN (SELECT private.my_accessible_company_ids()));
DROP POLICY IF EXISTS "invoice_items_select" ON public.invoice_items;
CREATE POLICY "invoice_items_select" ON public.invoice_items FOR SELECT TO authenticated
  USING (company_id IN (SELECT private.my_accessible_company_ids()));
DROP POLICY IF EXISTS "invoice_vat_lines_select" ON public.invoice_vat_lines;
CREATE POLICY "invoice_vat_lines_select" ON public.invoice_vat_lines FOR SELECT TO authenticated
  USING (company_id IN (SELECT private.my_accessible_company_ids()));

REVOKE ALL ON public.invoices, public.invoice_items, public.invoice_vat_lines, public.arca_numbering_locks FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.invoices, public.invoice_items, public.invoice_vat_lines TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. CÓDIGOS DE ARCA
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.arca_vat_id(p_rate NUMERIC)
RETURNS INTEGER LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE p_rate WHEN 0 THEN 3 WHEN 2.5 THEN 9 WHEN 5 THEN 8 WHEN 10.5 THEN 4 WHEN 21 THEN 5 WHEN 27 THEN 6 END;
$$;

-- Condición del receptor (RG 5616): consumidor final 5, RI 1, monotributo 6, exento 4, no alcanzado 15
CREATE OR REPLACE FUNCTION private.arca_receiver_condition_id(p_condition TEXT)
RETURNS INTEGER LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE p_condition
    WHEN 'responsable_inscripto' THEN 1 WHEN 'monotributo' THEN 6 WHEN 'exento' THEN 4
    WHEN 'no_alcanzado' THEN 15 ELSE 5 END;
$$;

-- Letra: un Responsable Inscripto hace A a inscriptos y monotributistas (RG 5003) y B al resto;
-- monotributo y exento hacen siempre C.
CREATE OR REPLACE FUNCTION private.invoice_letter(p_issuer TEXT, p_receiver TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN p_issuer = 'responsable_inscripto' AND p_receiver IN ('responsable_inscripto', 'monotributo') THEN 'A'
    WHEN p_issuer = 'responsable_inscripto' THEN 'B'
    WHEN p_issuer IN ('monotributo', 'exento') THEN 'C'
  END;
$$;

-- ----------------------------------------------------------------------------
-- 4. PREPARAR LA FACTURA DE UNA VENTA (queda pendiente hasta que ARCA la autorice)
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
    RAISE EXCEPTION 'Esta venta tiene devoluciones: todavía no se puede facturar (llega con las notas de crédito).';
  END IF;

  -- Reintento: la factura pendiente se sigue usando (puede tener un número ya pedido a ARCA)
  SELECT id INTO v_invoice FROM public.invoices
  WHERE company_id = p_company_id AND sale_id = p_sale_id AND status = 'pending';
  IF FOUND THEN RETURN v_invoice; END IF;
  IF EXISTS (SELECT 1 FROM public.invoices WHERE company_id = p_company_id AND sale_id = p_sale_id AND status = 'authorized') THEN
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

  INSERT INTO public.invoice_items (company_id, invoice_id, position, description, quantity, unit_price, vat_rate, line_total)
  SELECT p_company_id, v_invoice,
    pg_catalog.row_number() OVER (ORDER BY si.created_at, si.id),
    pg_catalog.left(COALESCE(p.name, si.description, 'Artículo'), 200), si.quantity, si.unit_price,
    CASE WHEN v_letter = 'C' THEN 0 ELSE COALESCE(p.vat_rate, 21.00) END, si.subtotal
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

-- La Edge Function confirma con el token del usuario que puede facturar
CREATE OR REPLACE FUNCTION public.arca_invoice_context(p_company_id UUID, p_invoice_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_env TEXT;
BEGIN
  PERFORM private.assert_module_access(p_company_id, ARRAY['facturacion'], 'operate');
  SELECT environment INTO v_env FROM public.invoices WHERE id = p_invoice_id AND company_id = p_company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factura no encontrada.'; END IF;
  RETURN jsonb_build_object(
    'userId', auth.uid(),
    'environment', v_env,
    'cuit', (SELECT pg_catalog.regexp_replace(COALESCE(tax_id, ''), '\D', '', 'g') FROM public.companies WHERE id = p_company_id)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.arca_invoice_context(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.arca_invoice_context(UUID, UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. OPERACIONES DE LA EDGE FUNCTION (solo service_role)
-- ----------------------------------------------------------------------------
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
    ), '[]'::jsonb)
  )
  FROM public.invoices i WHERE i.id = p_invoice_id;
$$;

-- Turno de numeración: true si lo tomó (libre, vencido o ya era de esta factura)
CREATE OR REPLACE FUNCTION public.arca_lock_numbering(p_invoice_id UUID, p_seconds INTEGER)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  i RECORD;
  v_taken INTEGER;
BEGIN
  SELECT company_id, environment, point_of_sale, invoice_type INTO i FROM public.invoices WHERE id = p_invoice_id;
  INSERT INTO public.arca_numbering_locks (company_id, environment, point_of_sale, invoice_type, invoice_id, locked_until)
  VALUES (i.company_id, i.environment, i.point_of_sale, i.invoice_type, p_invoice_id, now() + pg_catalog.make_interval(secs => p_seconds))
  ON CONFLICT (company_id, environment, point_of_sale, invoice_type) DO UPDATE
    SET invoice_id = EXCLUDED.invoice_id, locked_until = EXCLUDED.locked_until
    WHERE public.arca_numbering_locks.locked_until < now() OR public.arca_numbering_locks.invoice_id = p_invoice_id;
  GET DIAGNOSTICS v_taken = ROW_COUNT;
  RETURN v_taken = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.arca_unlock_numbering(p_invoice_id UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  DELETE FROM public.arca_numbering_locks WHERE invoice_id = p_invoice_id;
$$;

CREATE OR REPLACE FUNCTION public.arca_set_invoice_attempt(p_invoice_id UUID, p_number INTEGER)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.invoices SET attempt_number = p_number, updated_at = now()
  WHERE id = p_invoice_id AND status = 'pending';
$$;

CREATE OR REPLACE FUNCTION public.arca_store_invoice_result(
  p_invoice_id UUID, p_status TEXT, p_number INTEGER, p_cae TEXT, p_cae_expires_at DATE, p_message TEXT
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_status NOT IN ('pending', 'authorized', 'rejected') THEN
    RAISE EXCEPTION 'Estado de factura inválido.';
  END IF;
  UPDATE public.invoices SET
    status = p_status,
    number = CASE WHEN p_status = 'authorized' THEN p_number END,
    cae = CASE WHEN p_status = 'authorized' THEN p_cae END,
    cae_expires_at = CASE WHEN p_status = 'authorized' THEN p_cae_expires_at END,
    authorized_at = CASE WHEN p_status = 'authorized' THEN now() END,
    attempt_number = CASE WHEN p_status = 'pending' THEN attempt_number END,
    arca_message = pg_catalog.left(p_message, 2000),
    updated_at = now()
  WHERE id = p_invoice_id AND status = 'pending';
END;
$$;

DO $$
DECLARE
  v_fn TEXT;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.arca_get_invoice(UUID)',
    'public.arca_lock_numbering(UUID, INTEGER)',
    'public.arca_unlock_numbering(UUID)',
    'public.arca_set_invoice_attempt(UUID, INTEGER)',
    'public.arca_store_invoice_result(UUID, TEXT, INTEGER, TEXT, DATE, TEXT)'
  ] LOOP
    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_fn);
    EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_fn);
  END LOOP;
END;
$$;
