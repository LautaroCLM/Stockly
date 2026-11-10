-- ============================================================================
-- MIGRACIÓN: DOCUMENTOS (tickets, presupuestos, remitos X y garantías)
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
--
-- Comprobantes internos NO fiscales que se guardan con número correlativo:
--   * ticket       comprobante de 80 mm con ítems y total (no cuenta como venta)
--   * presupuesto  con validez y condiciones
--   * remito       remito X (no válido como factura), con o sin precios
--   * garantia     producto, número de serie y plazo
-- Nunca tocan stock, caja ni ventas. Los ítems salen del inventario o son texto libre.
-- Un documento no se edita ni se borra: se anula con un motivo (queda en el historial).
-- Acceso: módulo 'documentos' (empleado: sin acceso por defecto; el admin siempre opera).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. NUEVO MÓDULO DE PERMISOS Y TIPO DE OPERACIÓN IDEMPOTENTE
-- ----------------------------------------------------------------------------
ALTER TABLE public.company_module_permissions DROP CONSTRAINT IF EXISTS company_module_permissions_module_check;
ALTER TABLE public.company_module_permissions ADD CONSTRAINT company_module_permissions_module_check CHECK (module IN (
  'compras', 'finanzas', 'gastos', 'cobros_pagos', 'informes', 'maquinas', 'personal', 'fichaje',
  'productos', 'caja', 'clientes', 'proveedores', 'anular_ventas', 'documentos'
));

ALTER TABLE public.operation_idempotency DROP CONSTRAINT IF EXISTS chk_idempotency_op_type;
ALTER TABLE public.operation_idempotency ADD CONSTRAINT chk_idempotency_op_type CHECK (
  operation_type IN ('stock_adjustment', 'initial_load', 'sale', 'purchase', 'inventory_import', 'document')
);

-- ----------------------------------------------------------------------------
-- 2. DATOS DEL EMISOR (uno por empresa)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.document_settings (
  company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE RESTRICT,
  address TEXT CHECK (address IS NULL OR pg_catalog.length(address) <= 200),
  phone TEXT CHECK (phone IS NULL OR pg_catalog.length(phone) <= 50),
  email TEXT CHECK (email IS NULL OR pg_catalog.length(email) <= 120),
  tax_condition TEXT NOT NULL DEFAULT 'responsable_inscripto'
    CHECK (tax_condition IN ('responsable_inscripto', 'monotributo', 'exento', 'no_responsable')),
  point_of_sale INTEGER NOT NULL DEFAULT 1 CHECK (point_of_sale BETWEEN 1 AND 9999),
  footer_note TEXT CHECK (footer_note IS NULL OR pg_catalog.length(footer_note) <= 300),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

DROP TRIGGER IF EXISTS tr_audit_document_settings ON public.document_settings;
CREATE TRIGGER tr_audit_document_settings
  AFTER INSERT OR UPDATE OR DELETE ON public.document_settings
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger('company_id');

-- ----------------------------------------------------------------------------
-- 3. DOCUMENTOS, ÍTEMS Y CONTADORES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.document_counters (
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('ticket', 'presupuesto', 'remito', 'garantia')),
  point_of_sale INTEGER NOT NULL CHECK (point_of_sale BETWEEN 1 AND 9999),
  last_number INTEGER NOT NULL DEFAULT 0 CHECK (last_number >= 0),
  PRIMARY KEY (company_id, doc_type, point_of_sale)
);

CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('ticket', 'presupuesto', 'remito', 'garantia')),
  point_of_sale INTEGER NOT NULL CHECK (point_of_sale BETWEEN 1 AND 9999),
  doc_number INTEGER NOT NULL CHECK (doc_number > 0),
  issue_date DATE NOT NULL,
  valid_until DATE,
  customer_id UUID,
  customer_name TEXT NOT NULL CHECK (pg_catalog.btrim(customer_name) <> '' AND pg_catalog.length(customer_name) <= 150),
  customer_tax_id TEXT CHECK (customer_tax_id IS NULL OR pg_catalog.length(customer_tax_id) <= 30),
  customer_address TEXT CHECK (customer_address IS NULL OR pg_catalog.length(customer_address) <= 200),
  customer_phone TEXT CHECK (customer_phone IS NULL OR pg_catalog.length(customer_phone) <= 50),
  show_prices BOOLEAN NOT NULL DEFAULT true,
  warranty_months INTEGER CHECK (warranty_months IS NULL OR warranty_months BETWEEN 1 AND 120),
  notes TEXT CHECK (notes IS NULL OR pg_catalog.length(notes) <= 1000),
  subtotal NUMERIC(14, 2) NOT NULL CHECK (subtotal >= 0),
  discount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  total NUMERIC(14, 2) NOT NULL CHECK (total >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'voided')),
  void_reason TEXT CHECK (void_reason IS NULL OR pg_catalog.length(void_reason) <= 300),
  voided_at TIMESTAMPTZ,
  voided_by UUID REFERENCES auth.users(id),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_documents_company_id UNIQUE (company_id, id),
  CONSTRAINT uq_documents_number UNIQUE (company_id, doc_type, point_of_sale, doc_number),
  CONSTRAINT fk_documents_customer FOREIGN KEY (company_id, customer_id)
    REFERENCES public.customers(company_id, id) ON DELETE RESTRICT,
  CONSTRAINT chk_documents_total CHECK (total = subtotal - discount AND discount <= subtotal),
  CONSTRAINT chk_documents_valid_until CHECK (valid_until IS NULL OR valid_until >= issue_date),
  CONSTRAINT chk_documents_void CHECK (
    (status = 'active' AND void_reason IS NULL AND voided_at IS NULL AND voided_by IS NULL) OR
    (status = 'voided' AND void_reason IS NOT NULL AND voided_at IS NOT NULL AND voided_by IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS documents_company_date_idx ON public.documents (company_id, issue_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS documents_company_type_idx ON public.documents (company_id, doc_type, doc_number DESC);

CREATE TABLE IF NOT EXISTS public.document_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  document_id UUID NOT NULL,
  position INTEGER NOT NULL CHECK (position > 0),
  product_id UUID,
  description TEXT NOT NULL CHECK (pg_catalog.btrim(description) <> '' AND pg_catalog.length(description) <= 200),
  serial_number TEXT CHECK (serial_number IS NULL OR pg_catalog.length(serial_number) <= 80),
  quantity NUMERIC(14, 3) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(14, 2) NOT NULL CHECK (unit_price >= 0),
  line_total NUMERIC(14, 2) NOT NULL CHECK (line_total >= 0),
  CONSTRAINT fk_document_items_document FOREIGN KEY (company_id, document_id)
    REFERENCES public.documents(company_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_document_items_product FOREIGN KEY (company_id, product_id)
    REFERENCES public.products(company_id, id) ON DELETE RESTRICT,
  CONSTRAINT uq_document_items_position UNIQUE (document_id, position)
);

CREATE INDEX IF NOT EXISTS document_items_document_idx ON public.document_items (company_id, document_id, position);

DROP TRIGGER IF EXISTS tr_audit_documents ON public.documents;
CREATE TRIGGER tr_audit_documents
  AFTER INSERT OR UPDATE OR DELETE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger('id');

-- Un documento solo puede pasar de activo a anulado; los ítems no cambian nunca
CREATE OR REPLACE FUNCTION public.guard_document_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Los documentos no se pueden borrar: anulalos con un motivo.';
  END IF;
  IF TG_TABLE_NAME = 'document_items' THEN
    RAISE EXCEPTION 'Los ítems de un documento no se pueden modificar.';
  END IF;
  IF OLD.status = 'voided' THEN
    RAISE EXCEPTION 'Un documento anulado no se puede modificar.';
  END IF;
  IF NEW.status <> 'voided'
     OR (to_jsonb(NEW) - 'status' - 'void_reason' - 'voided_at' - 'voided_by')
        IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'void_reason' - 'voided_at' - 'voided_by') THEN
    RAISE EXCEPTION 'Los datos de un documento no se pueden editar: anulalo y emití uno nuevo.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_document_mutation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tr_documents_guard ON public.documents;
CREATE TRIGGER tr_documents_guard
  BEFORE UPDATE OR DELETE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.guard_document_mutation();

DROP TRIGGER IF EXISTS tr_document_items_guard ON public.document_items;
CREATE TRIGGER tr_document_items_guard
  BEFORE UPDATE OR DELETE ON public.document_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_document_mutation();

-- ----------------------------------------------------------------------------
-- 4. RLS: lectura según el módulo; toda escritura pasa por las funciones
-- ----------------------------------------------------------------------------
ALTER TABLE public.document_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.document_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_counters FORCE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents FORCE ROW LEVEL SECURITY;
ALTER TABLE public.document_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_items FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "document_settings_select" ON public.document_settings;
CREATE POLICY "document_settings_select"
  ON public.document_settings FOR SELECT TO authenticated
  USING (company_id IN (SELECT private.my_active_company_ids()) AND private.has_module_level(company_id, ARRAY['documentos'], 'view'));

DROP POLICY IF EXISTS "documents_select" ON public.documents;
CREATE POLICY "documents_select"
  ON public.documents FOR SELECT TO authenticated
  USING (company_id IN (SELECT private.my_active_company_ids()) AND private.has_module_level(company_id, ARRAY['documentos'], 'view'));

DROP POLICY IF EXISTS "document_items_select" ON public.document_items;
CREATE POLICY "document_items_select"
  ON public.document_items FOR SELECT TO authenticated
  USING (company_id IN (SELECT private.my_active_company_ids()) AND private.has_module_level(company_id, ARRAY['documentos'], 'view'));

-- Los contadores no se leen desde el cliente (sin política)
REVOKE ALL ON public.document_settings, public.document_counters, public.documents, public.document_items FROM PUBLIC, anon;
REVOKE ALL ON public.document_counters FROM authenticated;
GRANT SELECT ON public.document_settings, public.documents, public.document_items TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.document_settings, public.documents, public.document_items FROM authenticated;

DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['documents', 'document_settings'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = v_table
    ) THEN
      EXECUTE pg_catalog.format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
    END IF;
  END LOOP;
END
$$;

-- ----------------------------------------------------------------------------
-- 5. DATOS DEL EMISOR: ALTA Y EDICIÓN
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_document_settings(
  p_company_id UUID,
  p_address TEXT,
  p_phone TEXT,
  p_email TEXT,
  p_tax_condition TEXT,
  p_point_of_sale INTEGER,
  p_footer_note TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  PERFORM private.assert_company_role(p_company_id, 'master_admin');

  IF p_tax_condition NOT IN ('responsable_inscripto', 'monotributo', 'exento', 'no_responsable') THEN
    RAISE EXCEPTION 'Condición frente al IVA inválida.';
  END IF;
  IF p_point_of_sale IS NULL OR p_point_of_sale NOT BETWEEN 1 AND 9999 THEN
    RAISE EXCEPTION 'El punto de venta debe estar entre 1 y 9999.';
  END IF;

  INSERT INTO public.document_settings (
    company_id, address, phone, email, tax_condition, point_of_sale, footer_note, updated_by
  ) VALUES (
    p_company_id,
    NULLIF(pg_catalog.btrim(COALESCE(p_address, '')), ''),
    NULLIF(pg_catalog.btrim(COALESCE(p_phone, '')), ''),
    NULLIF(pg_catalog.btrim(COALESCE(p_email, '')), ''),
    p_tax_condition, p_point_of_sale,
    NULLIF(pg_catalog.btrim(COALESCE(p_footer_note, '')), ''), auth.uid()
  )
  ON CONFLICT (company_id) DO UPDATE SET
    address = EXCLUDED.address, phone = EXCLUDED.phone, email = EXCLUDED.email,
    tax_condition = EXCLUDED.tax_condition, point_of_sale = EXCLUDED.point_of_sale,
    footer_note = EXCLUDED.footer_note, updated_at = now(), updated_by = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.save_document_settings(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_document_settings(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 6. EMITIR UN DOCUMENTO (atómico e idempotente)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_document(
  p_company_id UUID,
  p_idempotency_key UUID,
  p_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_company_active BOOLEAN;
  v_timezone TEXT;
  v_today DATE;
  v_request_hash TEXT;
  v_attempts INT := 0;
  v_rec RECORD;
  v_type TEXT;
  v_items JSONB;
  v_item JSONB;
  v_n INT := 0;
  v_rows JSONB := '[]'::JSONB;
  v_product_name TEXT;
  v_customer_id UUID;
  v_customer public.customers%ROWTYPE;
  v_name TEXT;
  v_tax_id TEXT;
  v_address TEXT;
  v_phone TEXT;
  v_issue_date DATE;
  v_valid_until DATE;
  v_show_prices BOOLEAN;
  v_warranty_months INTEGER;
  v_notes TEXT;
  v_discount NUMERIC;
  v_product_id UUID;
  v_description TEXT;
  v_serial TEXT;
  v_qty NUMERIC;
  v_price NUMERIC;
  v_line NUMERIC;
  v_subtotal NUMERIC := 0;
  v_pos_number INTEGER;
  v_number INTEGER;
  v_document_id UUID;
  v_response JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  IF p_company_id IS NULL OR p_idempotency_key IS NULL OR p_data IS NULL THEN
    RAISE EXCEPTION 'Parámetros obligatorios incompletos para emitir el documento.';
  END IF;
  IF pg_catalog.jsonb_typeof(p_data) <> 'object' THEN
    RAISE EXCEPTION 'Los datos del documento deben ser un objeto.';
  END IF;

  PERFORM private.assert_module_access(p_company_id, ARRAY['documentos'], 'operate');

  -- Bloqueo de la empresa y revalidación (anti-TOCTOU)
  SELECT is_active, timezone INTO v_company_active, v_timezone
  FROM public.companies WHERE id = p_company_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Empresa con ID % no encontrada.', p_company_id;
  END IF;
  IF NOT v_company_active THEN
    RAISE EXCEPTION 'La empresa se encuentra inactiva. No se admiten operaciones.';
  END IF;
  PERFORM private.assert_module_access(p_company_id, ARRAY['documentos'], 'operate');
  v_today := (pg_catalog.timezone(v_timezone, now()))::DATE;

  -- Idempotencia: reenviar lo mismo devuelve el documento ya emitido
  v_request_hash := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(
      pg_catalog.jsonb_build_object('company_id', p_company_id, 'data', p_data)::TEXT, 'UTF8'), 'sha256'),
    'hex');

  LOOP
    v_attempts := v_attempts + 1;
    IF v_attempts > 3 THEN
      RAISE EXCEPTION 'No se pudo adquirir el candado de idempotencia tras 3 reintentos por contención concurrente.';
    END IF;

    INSERT INTO public.operation_idempotency (
      company_id, operation_type, idempotency_key, request_hash, response_payload, created_by, created_at, updated_at, expires_at
    ) VALUES (
      p_company_id, 'document', p_idempotency_key, v_request_hash, NULL, v_user_id,
      pg_catalog.now(), pg_catalog.now(), pg_catalog.now() + interval '24 hours'
    )
    ON CONFLICT (company_id, created_by, operation_type, idempotency_key) DO NOTHING;
    IF FOUND THEN
      EXIT;
    END IF;

    SELECT id, request_hash, response_payload, expires_at INTO v_rec
    FROM public.operation_idempotency
    WHERE company_id = p_company_id AND created_by = v_user_id
      AND operation_type = 'document' AND idempotency_key = p_idempotency_key
    FOR UPDATE;
    IF FOUND THEN
      IF v_rec.expires_at <= pg_catalog.now() THEN
        DELETE FROM public.operation_idempotency WHERE id = v_rec.id;
        CONTINUE;
      END IF;
      IF v_rec.request_hash <> v_request_hash THEN
        RAISE EXCEPTION 'Idempotency key mismatch: clave de documento reutilizada con distintos datos.';
      END IF;
      IF v_rec.response_payload IS NULL THEN
        RAISE EXCEPTION 'Estado inconsistente de idempotencia: documento previo sin resultado.';
      END IF;
      RETURN v_rec.response_payload;
    END IF;
  END LOOP;

  -- Datos generales
  v_type := p_data ->> 'doc_type';
  IF v_type IS NULL OR v_type NOT IN ('ticket', 'presupuesto', 'remito', 'garantia') THEN
    RAISE EXCEPTION 'Tipo de documento inválido.';
  END IF;

  BEGIN
    v_issue_date := COALESCE(NULLIF(p_data ->> 'issue_date', '')::DATE, v_today);
    v_valid_until := NULLIF(p_data ->> 'valid_until', '')::DATE;
    v_warranty_months := NULLIF(p_data ->> 'warranty_months', '')::INTEGER;
    v_discount := COALESCE(NULLIF(p_data ->> 'discount', '')::NUMERIC, 0);
    v_show_prices := COALESCE((p_data ->> 'show_prices')::BOOLEAN, true);
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Alguno de los datos del documento (fecha, plazo, descuento) no es válido.';
  END;

  IF v_issue_date < DATE '2000-01-01' OR v_issue_date > v_today + 30 THEN
    RAISE EXCEPTION 'La fecha del documento no es válida.';
  END IF;
  IF v_valid_until IS NOT NULL AND v_valid_until < v_issue_date THEN
    RAISE EXCEPTION 'La validez no puede ser anterior a la fecha del documento.';
  END IF;
  IF v_type <> 'presupuesto' THEN
    v_valid_until := NULL;
  END IF;
  IF v_type = 'garantia' THEN
    IF v_warranty_months IS NULL OR v_warranty_months NOT BETWEEN 1 AND 120 THEN
      RAISE EXCEPTION 'Indicá el plazo de la garantía en meses (entre 1 y 120).';
    END IF;
  ELSE
    v_warranty_months := NULL;
  END IF;
  -- Remito y garantía pueden ir sin precios; ticket y presupuesto siempre los muestran
  IF v_type IN ('ticket', 'presupuesto') THEN
    v_show_prices := true;
  ELSIF v_type = 'garantia' THEN
    v_show_prices := false;
  END IF;
  PERFORM private.assert_money(v_discount, 'el descuento', true);

  v_notes := NULLIF(pg_catalog.btrim(COALESCE(p_data ->> 'notes', '')), '');
  IF v_notes IS NOT NULL AND pg_catalog.length(v_notes) > 1000 THEN
    RAISE EXCEPTION 'Las observaciones no pueden superar los 1000 caracteres.';
  END IF;

  -- Cliente (opcional salvo en remito, presupuesto y garantía)
  v_name := NULLIF(pg_catalog.btrim(COALESCE(p_data ->> 'customer_name', '')), '');
  v_tax_id := NULLIF(pg_catalog.btrim(COALESCE(p_data ->> 'customer_tax_id', '')), '');
  v_address := NULLIF(pg_catalog.btrim(COALESCE(p_data ->> 'customer_address', '')), '');
  v_phone := NULLIF(pg_catalog.btrim(COALESCE(p_data ->> 'customer_phone', '')), '');
  BEGIN
    v_customer_id := NULLIF(p_data ->> 'customer_id', '')::UUID;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'El cliente indicado no es válido.';
  END;
  IF v_customer_id IS NOT NULL THEN
    SELECT * INTO v_customer FROM public.customers c WHERE c.id = v_customer_id AND c.company_id = p_company_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'El cliente no pertenece a esta empresa.';
    END IF;
    v_name := COALESCE(v_name, v_customer.name);
    v_tax_id := COALESCE(v_tax_id, v_customer.tax_id);
    v_address := COALESCE(v_address, v_customer.address);
    v_phone := COALESCE(v_phone, v_customer.phone);
  END IF;
  IF v_name IS NULL THEN
    IF v_type = 'ticket' THEN
      v_name := 'Consumidor final';
    ELSE
      RAISE EXCEPTION 'Indicá el nombre del cliente.';
    END IF;
  END IF;
  IF pg_catalog.length(v_name) > 150 OR pg_catalog.length(COALESCE(v_tax_id, '')) > 30
     OR pg_catalog.length(COALESCE(v_address, '')) > 200 OR pg_catalog.length(COALESCE(v_phone, '')) > 50 THEN
    RAISE EXCEPTION 'Alguno de los datos del cliente es demasiado largo.';
  END IF;

  -- Ítems
  v_items := p_data -> 'items';
  IF v_items IS NULL OR pg_catalog.jsonb_typeof(v_items) <> 'array' OR pg_catalog.jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'Agregá al menos un ítem al documento.';
  END IF;
  IF pg_catalog.jsonb_array_length(v_items) > 200 THEN
    RAISE EXCEPTION 'Un documento admite hasta 200 ítems.';
  END IF;

  FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(v_items) LOOP
    v_n := v_n + 1;
    IF pg_catalog.jsonb_typeof(v_item) <> 'object' THEN
      RAISE EXCEPTION 'Ítem %: formato inválido.', v_n;
    END IF;

    BEGIN
      v_qty := (v_item ->> 'quantity')::NUMERIC;
      v_price := COALESCE(NULLIF(v_item ->> 'unit_price', '')::NUMERIC, 0);
      v_product_id := NULLIF(v_item ->> 'product_id', '')::UUID;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Ítem %: la cantidad, el precio o el producto no son válidos.', v_n;
    END;
    IF v_qty IS NULL OR v_qty <= 0 OR v_qty > 999999 OR v_qty <> pg_catalog.round(v_qty, 3) THEN
      RAISE EXCEPTION 'Ítem %: la cantidad debe ser mayor a cero (hasta 3 decimales).', v_n;
    END IF;
    IF v_price < 0 OR v_price > 9999999999 OR v_price <> pg_catalog.round(v_price, 2) THEN
      RAISE EXCEPTION 'Ítem %: el precio no es válido (hasta 2 decimales).', v_n;
    END IF;
    IF v_type IN ('ticket', 'presupuesto') AND v_price = 0 THEN
      RAISE EXCEPTION 'Ítem %: indicá el precio.', v_n;
    END IF;
    IF NOT v_show_prices THEN
      v_price := 0;
    END IF;

    v_description := NULLIF(pg_catalog.btrim(COALESCE(v_item ->> 'description', '')), '');
    IF v_product_id IS NOT NULL THEN
      SELECT p.name INTO v_product_name FROM public.products p
      WHERE p.id = v_product_id AND p.company_id = p_company_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Ítem %: el producto no pertenece a esta empresa.', v_n;
      END IF;
      v_description := COALESCE(v_description, v_product_name);
    END IF;
    IF v_description IS NULL THEN
      RAISE EXCEPTION 'Ítem %: escribí una descripción.', v_n;
    END IF;
    IF pg_catalog.length(v_description) > 200 THEN
      RAISE EXCEPTION 'Ítem %: la descripción no puede superar los 200 caracteres.', v_n;
    END IF;
    v_serial := NULLIF(pg_catalog.btrim(COALESCE(v_item ->> 'serial_number', '')), '');
    IF v_serial IS NOT NULL AND pg_catalog.length(v_serial) > 80 THEN
      RAISE EXCEPTION 'Ítem %: el número de serie no puede superar los 80 caracteres.', v_n;
    END IF;

    v_line := pg_catalog.round(v_qty * v_price, 2);
    v_subtotal := v_subtotal + v_line;
    v_rows := v_rows || pg_catalog.jsonb_build_object(
      'product_id', v_product_id, 'description', v_description, 'serial_number', v_serial,
      'quantity', v_qty, 'unit_price', v_price, 'line_total', v_line
    );
  END LOOP;

  IF NOT v_show_prices THEN
    v_discount := 0;
  END IF;
  IF v_discount > v_subtotal THEN
    RAISE EXCEPTION 'El descuento no puede superar el subtotal.';
  END IF;
  IF v_subtotal > 9999999999999 THEN
    RAISE EXCEPTION 'El total del documento es demasiado grande.';
  END IF;

  -- Numeración correlativa por tipo y punto de venta (el UPSERT bloquea la fila: sin saltos ni repetidos)
  SELECT COALESCE((SELECT ds.point_of_sale FROM public.document_settings ds WHERE ds.company_id = p_company_id), 1)
  INTO v_pos_number;

  INSERT INTO public.document_counters (company_id, doc_type, point_of_sale, last_number)
  VALUES (p_company_id, v_type, v_pos_number, 1)
  ON CONFLICT (company_id, doc_type, point_of_sale)
  DO UPDATE SET last_number = public.document_counters.last_number + 1
  RETURNING last_number INTO v_number;

  v_document_id := gen_random_uuid();
  INSERT INTO public.documents (
    id, company_id, doc_type, point_of_sale, doc_number, issue_date, valid_until,
    customer_id, customer_name, customer_tax_id, customer_address, customer_phone,
    show_prices, warranty_months, notes, subtotal, discount, total, created_by
  ) VALUES (
    v_document_id, p_company_id, v_type, v_pos_number, v_number, v_issue_date, v_valid_until,
    v_customer_id, v_name, v_tax_id, v_address, v_phone,
    v_show_prices, v_warranty_months, v_notes, v_subtotal, v_discount, v_subtotal - v_discount, v_user_id
  );

  v_n := 0;
  FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(v_rows) LOOP
    v_n := v_n + 1;
    INSERT INTO public.document_items (
      company_id, document_id, position, product_id, description, serial_number, quantity, unit_price, line_total
    ) VALUES (
      p_company_id, v_document_id, v_n, NULLIF(v_item ->> 'product_id', '')::UUID, v_item ->> 'description',
      v_item ->> 'serial_number', (v_item ->> 'quantity')::NUMERIC, (v_item ->> 'unit_price')::NUMERIC,
      (v_item ->> 'line_total')::NUMERIC
    );
  END LOOP;

  v_response := pg_catalog.jsonb_build_object(
    'document_id', v_document_id,
    'doc_type', v_type,
    'point_of_sale', v_pos_number,
    'doc_number', v_number,
    'total', v_subtotal - v_discount
  );

  UPDATE public.operation_idempotency
  SET response_payload = v_response, updated_at = pg_catalog.now()
  WHERE company_id = p_company_id AND created_by = v_user_id
    AND operation_type = 'document' AND idempotency_key = p_idempotency_key;

  RETURN v_response;
END;
$$;

REVOKE ALL ON FUNCTION public.create_document(UUID, UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_document(UUID, UUID, JSONB) TO authenticated;

COMMENT ON FUNCTION public.create_document(UUID, UUID, JSONB) IS
  'Emite un ticket, presupuesto, remito X o garantía con número correlativo. No toca stock ni caja. Requiere operar el módulo documentos.';

-- ----------------------------------------------------------------------------
-- 7. ANULAR UN DOCUMENTO
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.void_document(
  p_company_id UUID,
  p_document_id UUID,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reason TEXT := pg_catalog.btrim(COALESCE(p_reason, ''));
  v_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  PERFORM private.assert_module_access(p_company_id, ARRAY['documentos'], 'operate');

  IF pg_catalog.length(v_reason) < 3 THEN
    RAISE EXCEPTION 'Indicá el motivo de la anulación (al menos 3 caracteres).';
  END IF;
  IF pg_catalog.length(v_reason) > 300 THEN
    RAISE EXCEPTION 'El motivo no puede superar los 300 caracteres.';
  END IF;

  SELECT d.status INTO v_status FROM public.documents d
  WHERE d.id = p_document_id AND d.company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Documento no encontrado en esta empresa.';
  END IF;
  IF v_status = 'voided' THEN
    RAISE EXCEPTION 'El documento ya está anulado.';
  END IF;

  UPDATE public.documents
  SET status = 'voided', void_reason = v_reason, voided_at = now(), voided_by = auth.uid()
  WHERE id = p_document_id AND company_id = p_company_id;
END;
$$;

REVOKE ALL ON FUNCTION public.void_document(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_document(UUID, UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 8. get/set_module_permissions reconocen el módulo nuevo (solo cambia la lista de módulos)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_module_permissions(p_company_id uuid, p_levels jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_item RECORD;
  v_level TEXT;
  v_count INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  PERFORM private.assert_company_role(p_company_id, 'master_admin');

  IF p_levels IS NULL OR pg_catalog.jsonb_typeof(p_levels) <> 'object' THEN
    RAISE EXCEPTION 'Los permisos deben indicarse como un objeto {módulo: nivel}.';
  END IF;

  FOR v_item IN SELECT e.key AS module, e.value AS level FROM pg_catalog.jsonb_each(p_levels) AS e LOOP
    IF v_item.module NOT IN (
      'compras', 'finanzas', 'gastos', 'cobros_pagos', 'informes', 'maquinas', 'personal', 'fichaje',
      'productos', 'caja', 'clientes', 'proveedores', 'anular_ventas', 'documentos'
    ) THEN
      RAISE EXCEPTION 'Módulo inválido: %.', v_item.module;
    END IF;
    IF pg_catalog.jsonb_typeof(v_item.level) <> 'string' OR (v_item.level #>> '{}') NOT IN ('none', 'view', 'operate') THEN
      RAISE EXCEPTION 'Nivel inválido para el módulo %.', v_item.module;
    END IF;
    v_level := v_item.level #>> '{}';
    IF v_item.module = 'clientes' AND v_level = 'none' THEN
      RAISE EXCEPTION 'Clientes no se puede ocultar: hace falta para vender a un cliente.';
    END IF;

    INSERT INTO public.company_module_permissions (company_id, module, employee_level, updated_by)
    VALUES (p_company_id, v_item.module, v_level, auth.uid())
    ON CONFLICT (company_id, module) DO UPDATE
      SET employee_level = EXCLUDED.employee_level, updated_by = EXCLUDED.updated_by, updated_at = now()
      WHERE public.company_module_permissions.employee_level IS DISTINCT FROM EXCLUDED.employee_level;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_module_permissions(p_company_id uuid)
 RETURNS TABLE(module text, employee_level text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  PERFORM private.assert_company_role(p_company_id, NULL);

  RETURN QUERY
  SELECT m.module, COALESCE(p.employee_level, private.default_module_level(m.module))
  FROM pg_catalog.unnest(ARRAY[
    'compras', 'cobros_pagos', 'gastos', 'finanzas', 'informes', 'maquinas', 'personal', 'fichaje',
    'productos', 'caja', 'clientes', 'proveedores', 'anular_ventas', 'documentos'
  ]) WITH ORDINALITY AS m(module, ord)
  LEFT JOIN public.company_module_permissions p ON p.company_id = p_company_id AND p.module = m.module
  ORDER BY m.ord;
END;
$function$;
