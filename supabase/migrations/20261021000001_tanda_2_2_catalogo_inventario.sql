-- ============================================================================
-- MIGRACIÓN OFICIAL: TANDA 2.2A - CATÁLOGO E INVENTARIO FÍSICO MULTIEMPRESA
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
-- Base de datos: PostgreSQL 17 / Supabase
-- Tablas: categories, suppliers, products, product_costs, stock_movements,
--         movement_costs, operation_idempotency.
-- Control de Existencias: companies.allow_negative_stock
-- Seguridad: RLS forzado, Privilegios mínimos (REVOKE directos a clientes),
--            RPCs SECURITY DEFINER con search_path = '' y validación en private.*
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EXTENSIÓN DE COMPANIES: POLÍTICA DE STOCK NEGATIVO
-- ----------------------------------------------------------------------------
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS allow_negative_stock BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.companies.allow_negative_stock IS 
  'Define si la empresa admite saldos de existencias negativas ante salidas de stock. Por omisión es false (estricto).';

-- ----------------------------------------------------------------------------
-- 2. TABLAS DEL CATÁLOGO DE INVENTARIO
-- ----------------------------------------------------------------------------

-- 2.1. categories: Clasificación de productos por tenant
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_categories_company_id UNIQUE (company_id, id),
  CONSTRAINT chk_categories_name_clean CHECK (name = btrim(name) AND name <> '' AND length(name) <= 100),
  CONSTRAINT chk_categories_desc_len CHECK (description IS NULL OR length(description) <= 500)
);

COMMENT ON TABLE public.categories IS 'Categorías de productos aisladas por tenant con baja lógica.';

CREATE UNIQUE INDEX uq_categories_company_clean_name 
  ON public.categories(company_id, lower(btrim(name)));

CREATE TRIGGER tr_categories_updated_at 
  BEFORE UPDATE ON public.categories 
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2.2. suppliers: Proveedores de mercadería por tenant
CREATE TABLE public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  tax_id TEXT, -- CUIT
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_suppliers_company_id UNIQUE (company_id, id),
  CONSTRAINT chk_suppliers_name_clean CHECK (name = btrim(name) AND name <> '' AND length(name) <= 150),
  CONSTRAINT chk_suppliers_email CHECK (email IS NULL OR email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  CONSTRAINT chk_suppliers_tax_id_cuit CHECK (tax_id IS NULL OR public.validate_cuit(tax_id))
);

COMMENT ON TABLE public.suppliers IS 'Proveedores comerciales aislados por tenant con validación CUIT.';

CREATE UNIQUE INDEX uq_suppliers_company_clean_name 
  ON public.suppliers(company_id, lower(btrim(name)));

CREATE TRIGGER tr_suppliers_updated_at 
  BEFORE UPDATE ON public.suppliers 
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2.3. products: Catálogo de artículos con balance de stock
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  sku TEXT NOT NULL,
  barcode TEXT,
  name TEXT NOT NULL,
  description TEXT,
  category_id UUID NULL,
  supplier_id UUID NULL,
  unit TEXT NOT NULL DEFAULT 'unidad',
  selling_price NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  min_stock NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  current_stock NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_products_company_id UNIQUE (company_id, id),
  -- Foreign Keys Compuestas anti-cruce de tenants
  CONSTRAINT fk_products_category FOREIGN KEY (company_id, category_id)
    REFERENCES public.categories(company_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_products_supplier FOREIGN KEY (company_id, supplier_id)
    REFERENCES public.suppliers(company_id, id) ON DELETE RESTRICT,
  -- Restricciones de formato y texto
  CONSTRAINT chk_products_sku_clean CHECK (sku = upper(btrim(sku)) AND sku <> '' AND length(sku) <= 50),
  CONSTRAINT chk_products_barcode_clean CHECK (barcode IS NULL OR (barcode = btrim(barcode) AND barcode <> '' AND length(barcode) <= 50)),
  CONSTRAINT chk_products_name_clean CHECK (name = btrim(name) AND name <> '' AND length(name) <= 200),
  CONSTRAINT chk_products_unit_valid CHECK (unit IN ('unidad', 'kg', 'litro', 'metro', 'bulto', 'par')),
  -- Restricciones numéricas y precisión exacta
  CONSTRAINT chk_products_selling_price CHECK (selling_price >= 0.00 AND scale(selling_price) <= 2 AND selling_price <= 999999999999.99),
  CONSTRAINT chk_products_min_stock CHECK (min_stock >= 0.00 AND scale(min_stock) <= 2 AND min_stock <= 999999999.99),
  CONSTRAINT chk_products_current_stock CHECK (scale(current_stock) <= 2 AND current_stock >= -999999999.99 AND current_stock <= 999999999.99),
  CONSTRAINT chk_products_integer_stock CHECK (
    unit NOT IN ('unidad', 'bulto', 'par') OR (current_stock = round(current_stock, 0) AND min_stock = round(min_stock, 0))
  )
);

COMMENT ON TABLE public.products IS 'Catálogo de artículos por empresa. La columna current_stock es administrada por triggers.';

CREATE UNIQUE INDEX uq_products_company_clean_sku 
  ON public.products(company_id, upper(btrim(sku)));

CREATE UNIQUE INDEX uq_products_company_clean_barcode 
  ON public.products(company_id, btrim(barcode)) 
  WHERE barcode IS NOT NULL AND btrim(barcode) <> '';

CREATE INDEX idx_products_company_category ON public.products(company_id, category_id);
CREATE INDEX idx_products_company_supplier ON public.products(company_id, supplier_id);
CREATE INDEX idx_products_company_active ON public.products(company_id, is_active) WHERE is_active = true;
CREATE INDEX idx_products_company_stock ON public.products(company_id, current_stock);

CREATE TRIGGER tr_products_updated_at 
  BEFORE UPDATE ON public.products 
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2.4. product_costs: Costos de reposición confidenciales (Aislados de employee)
CREATE TABLE public.product_costs (
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL,
  cost_price NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  PRIMARY KEY (company_id, product_id),
  CONSTRAINT fk_product_costs_product FOREIGN KEY (company_id, product_id)
    REFERENCES public.products(company_id, id) ON DELETE RESTRICT,
  CONSTRAINT chk_product_costs_cost CHECK (cost_price >= 0.00 AND scale(cost_price) <= 2 AND cost_price <= 999999999999.99)
);

COMMENT ON TABLE public.product_costs IS 'Costos confidenciales por producto. Acceso exclusivo a master_admin.';

CREATE TRIGGER tr_product_costs_updated_at 
  BEFORE UPDATE ON public.product_costs 
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3. HISTORIAL INMUTABLE DE MOVIMIENTOS Y COSTOS
-- ----------------------------------------------------------------------------

-- 3.1. stock_movements: Libro mayor físico de existencias
CREATE TABLE public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL,
  direction TEXT NOT NULL,
  reason TEXT NOT NULL,
  quantity NUMERIC(12, 2) NOT NULL,
  previous_stock NUMERIC(12, 2) NOT NULL,
  new_stock NUMERIC(12, 2) NOT NULL,
  reference_sale_id UUID NULL,     -- Desacoplado: FK diferida para Tanda 2.3
  reference_purchase_id UUID NULL, -- Desacoplado: FK diferida para Tanda 2.3
  reference_doc TEXT,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_stock_movements_company_id UNIQUE (company_id, id),
  CONSTRAINT fk_stock_movements_product FOREIGN KEY (company_id, product_id)
    REFERENCES public.products(company_id, id) ON DELETE RESTRICT,
  CONSTRAINT chk_stock_movements_direction CHECK (direction IN ('increase', 'decrease')),
  CONSTRAINT chk_stock_movements_reason CHECK (
    reason IN ('initial_load', 'purchase', 'physical_count', 'loss_damage', 'internal_use', 'sale', 'cancellation', 'purchase_cancellation')
  ),
  CONSTRAINT chk_stock_movements_dir_reason CHECK (
    (direction = 'increase' AND reason IN ('initial_load', 'purchase', 'physical_count', 'cancellation')) OR
    (direction = 'decrease' AND reason IN ('sale', 'loss_damage', 'internal_use', 'physical_count', 'purchase_cancellation'))
  ),
  CONSTRAINT chk_stock_movements_quantity CHECK (quantity > 0.00 AND scale(quantity) <= 2 AND quantity <= 999999999.99),
  CONSTRAINT chk_stock_movements_stocks CHECK (scale(previous_stock) <= 2 AND scale(new_stock) <= 2),
  CONSTRAINT chk_stock_movements_notes_len CHECK (notes IS NULL OR length(notes) <= 1000),
  CONSTRAINT chk_stock_movements_ref_doc_len CHECK (reference_doc IS NULL OR length(reference_doc) <= 100)
);

COMMENT ON TABLE public.stock_movements IS 'Registro inmutable de movimientos físicos de inventario.';

CREATE INDEX idx_stock_movements_company_prod ON public.stock_movements(company_id, product_id, created_at DESC);
CREATE INDEX idx_stock_movements_company_reason ON public.stock_movements(company_id, reason, created_at DESC);
CREATE INDEX idx_stock_movements_company_created ON public.stock_movements(company_id, created_at DESC);

-- Trigger de Inmutabilidad Absoluta sobre stock_movements
CREATE TRIGGER tr_protect_stock_movements_immutable
  BEFORE UPDATE OR DELETE ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_modification();

-- 3.2. movement_costs: Valuación histórica congelada por movimiento
CREATE TABLE public.movement_costs (
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  movement_id UUID NOT NULL,
  unit_cost NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  total_cost NUMERIC(24, 2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (company_id, movement_id),
  CONSTRAINT fk_movement_costs_movement FOREIGN KEY (company_id, movement_id)
    REFERENCES public.stock_movements(company_id, id) ON DELETE RESTRICT,
  CONSTRAINT chk_movement_costs_unit CHECK (unit_cost >= 0.00 AND scale(unit_cost) <= 2 AND unit_cost <= 999999999999.99),
  CONSTRAINT chk_movement_costs_total CHECK (total_cost >= 0.00 AND scale(total_cost) <= 2 AND total_cost <= 9999999999999999999999.99)
);

COMMENT ON TABLE public.movement_costs IS 'Costo histórico congelado de cada movimiento. Solo accesible a master_admin.';

-- Trigger de Inmutabilidad Absoluta sobre movement_costs
CREATE TRIGGER tr_protect_movement_costs_immutable
  BEFORE UPDATE OR DELETE ON public.movement_costs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_modification();

-- ----------------------------------------------------------------------------
-- 4. TABLA DE IDEMPOTENCIA TRANSACCIONAL
-- ----------------------------------------------------------------------------
CREATE TABLE public.operation_idempotency (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  operation_type TEXT NOT NULL,
  idempotency_key UUID NOT NULL,
  request_hash TEXT NOT NULL,
  response_payload JSONB NULL,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_operation_idempotency UNIQUE (company_id, operation_type, idempotency_key),
  CONSTRAINT chk_idempotency_op_type CHECK (operation_type IN ('stock_adjustment', 'initial_load', 'sale', 'purchase'))
);

COMMENT ON TABLE public.operation_idempotency IS 'Registro transaccional de idempotencia para operaciones críticas de stock y ventas.';

CREATE INDEX idx_operation_idempotency_lookup 
  ON public.operation_idempotency(company_id, operation_type, idempotency_key);

CREATE TRIGGER tr_operation_idempotency_updated_at 
  BEFORE UPDATE ON public.operation_idempotency 
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 5. TRIGGER DE SINCRONIZACIÓN ATÓMICA DE STOCK
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_product_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current_stock NUMERIC;
  v_unit TEXT;
  v_allow_negative BOOLEAN;
BEGIN
  -- 1. Bloqueo pesimista del producto bajo clave compuesta (company_id + product_id)
  SELECT current_stock, unit INTO v_current_stock, v_unit
  FROM public.products
  WHERE company_id = NEW.company_id AND id = NEW.product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto % no encontrado en la empresa % para sincronización de stock.', NEW.product_id, NEW.company_id;
  END IF;

  -- 2. Validación defensiva de unidades indivisibles
  IF v_unit IN ('unidad', 'bulto', 'par') AND NEW.quantity != pg_catalog.round(NEW.quantity, 0) THEN
    RAISE EXCEPTION 'La unidad % es indivisible y no admite cantidades fraccionarias: %', v_unit, NEW.quantity;
  END IF;

  -- 3. Asignar saldo previo canónico
  NEW.previous_stock := v_current_stock;

  -- 4. Calcular nuevo saldo
  IF NEW.direction = 'increase' THEN
    NEW.new_stock := v_current_stock + NEW.quantity;
  ELSIF NEW.direction = 'decrease' THEN
    NEW.new_stock := v_current_stock - NEW.quantity;
  ELSE
    RAISE EXCEPTION 'Dirección de movimiento inválida: %', NEW.direction;
  END IF;

  -- 5. Validación consistente de política de stock negativo
  SELECT allow_negative_stock INTO v_allow_negative
  FROM public.companies
  WHERE id = NEW.company_id;

  IF NEW.direction = 'decrease' AND NEW.new_stock < 0 AND NOT COALESCE(v_allow_negative, false) THEN
    RAISE EXCEPTION 'Stock insuficiente para el producto %. Existencia actual: %, solicitada: %', 
      NEW.product_id, v_current_stock, NEW.quantity;
  END IF;

  -- 6. Actualización única y atómica de la columna en products
  UPDATE public.products
  SET current_stock = NEW.new_stock,
      updated_at = pg_catalog.now()
  WHERE company_id = NEW.company_id AND id = NEW.product_id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_product_stock() IS 
  'Trigger BEFORE INSERT sobre stock_movements. Único responsable de calcular saldos y actualizar products.current_stock.';

CREATE TRIGGER tr_sync_stock_movements
  BEFORE INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.sync_product_stock();

-- ----------------------------------------------------------------------------
-- 6. PROCEDIMIENTOS ALMACENADOS (RPC) DE INVENTARIO
-- ----------------------------------------------------------------------------

-- 6.1. register_stock_adjustment: Ajustes manuales auditados e idempotentes
CREATE OR REPLACE FUNCTION public.register_stock_adjustment(
  p_company_id UUID,
  p_idempotency_key UUID,
  p_product_id UUID,
  p_direction TEXT,
  p_reason TEXT,
  p_quantity NUMERIC,
  p_notes TEXT DEFAULT NULL,
  p_reference_doc TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_canonical_json JSONB;
  v_request_hash TEXT;
  v_attempts INT := 0;
  v_rec RECORD;
  v_unit_cost NUMERIC;
  v_total_cost NUMERIC;
  v_new_movement_id UUID;
  v_movement RECORD;
  v_response_payload JSONB;
BEGIN
  -- 1. Validación de Autenticación y Autorización de Tenant
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;

  IF p_company_id IS NULL OR p_idempotency_key IS NULL OR p_product_id IS NULL OR 
     p_direction IS NULL OR p_reason IS NULL OR p_quantity IS NULL THEN
    RAISE EXCEPTION 'Parámetros obligatorios incompletos para el ajuste de stock.';
  END IF;

  PERFORM private.assert_company_role(p_company_id, 'master_admin');

  -- 2. Validación de Parámetros de Negocio
  IF p_direction NOT IN ('increase', 'decrease') THEN
    RAISE EXCEPTION 'Dirección inválida: %. Debe ser increase o decrease.', p_direction;
  END IF;

  -- Exclusión terminante de motivos comerciales (reservados para ventas y compras)
  IF p_reason NOT IN ('physical_count', 'loss_damage', 'internal_use') THEN
    RAISE EXCEPTION 'Motivo no autorizado para ajuste manual: %. Motivos permitidos: physical_count, loss_damage, internal_use.', p_reason;
  END IF;

  IF (p_direction = 'increase' AND p_reason NOT IN ('physical_count')) OR
     (p_direction = 'decrease' AND p_reason NOT IN ('physical_count', 'loss_damage', 'internal_use')) THEN
    RAISE EXCEPTION 'Incoherencia entre dirección % y motivo %.', p_direction, p_reason;
  END IF;

  -- Validación de escala y rango numérico sin redondeo silencioso
  IF pg_catalog.scale(p_quantity) > 2 THEN
    RAISE EXCEPTION 'La cantidad excede los 2 decimales permitidos: %', p_quantity;
  END IF;

  IF p_quantity <= 0 OR p_quantity > 999999999.99 THEN
    RAISE EXCEPTION 'Cantidad fuera de rango permitido (0 < cantidad <= 999.999.999,99): %', p_quantity;
  END IF;

  -- 3. Construcción del Hash Canónico Estructurado
  v_canonical_json := jsonb_build_object(
    'company_id', p_company_id,
    'operation_type', 'stock_adjustment',
    'product_id', p_product_id,
    'direction', p_direction,
    'reason', p_reason,
    'quantity', to_char(p_quantity, 'FM999999999990.00'),
    'notes', NULLIF(btrim(p_notes), ''),
    'reference_doc', NULLIF(btrim(p_reference_doc), '')
  );

  v_request_hash := pg_catalog.encode(
    extensions.digest(v_canonical_json::text, 'sha256'),
    'hex'
  );

  -- 4. Bucle Acotado de Adquisición de Candado de Idempotencia
  LOOP
    v_attempts := v_attempts + 1;
    IF v_attempts > 3 THEN
      RAISE EXCEPTION 'No se pudo adquirir el candado de idempotencia tras 3 reintentos por contención concurrente.';
    END IF;

    -- Intento de inserción de reserva (payload NULL inicial)
    INSERT INTO public.operation_idempotency (
      company_id, operation_type, idempotency_key, request_hash, response_payload, created_by
    ) VALUES (
      p_company_id, 'stock_adjustment', p_idempotency_key, v_request_hash, NULL, v_user_id
    )
    ON CONFLICT (company_id, operation_type, idempotency_key) DO NOTHING;

    IF FOUND THEN
      EXIT; -- Candado adquirido por esta transacción
    END IF;

    -- Espera pesimista de resolución de la otra transacción
    SELECT request_hash, response_payload INTO v_rec
    FROM public.operation_idempotency
    WHERE company_id = p_company_id 
      AND operation_type = 'stock_adjustment' 
      AND idempotency_key = p_idempotency_key
    FOR UPDATE;

    IF FOUND THEN
      IF v_rec.request_hash != v_request_hash THEN
        RAISE EXCEPTION 'Idempotency key mismatch: clave reutilizada con distintos parámetros.';
      END IF;

      IF v_rec.response_payload IS NULL THEN
        RAISE EXCEPTION 'Estado inconsistente de idempotencia: operación previa confirmada sin payload.';
      END IF;

      RETURN v_rec.response_payload; -- Replay exitoso sin repetir efectos
    END IF;

    -- Si NOT FOUND: la otra transacción hizo ROLLBACK; el bucle itera y toma el candado limpio
  END LOOP;

  -- 5. Obtener Costo Vigente de Reposición
  SELECT cost_price INTO v_unit_cost
  FROM public.product_costs
  WHERE company_id = p_company_id AND product_id = p_product_id;

  v_unit_cost := COALESCE(v_unit_cost, 0.00);
  v_total_cost := pg_catalog.round(p_quantity * v_unit_cost, 2);

  IF v_total_cost > 9999999999999999999999.99 THEN
    RAISE EXCEPTION 'El costo total resultante excede el rango representable: %', v_total_cost;
  END IF;

  -- 6. Insertar Movimiento Físico (El trigger tr_sync_stock_movements actualiza el stock)
  INSERT INTO public.stock_movements (
    company_id, product_id, direction, reason, quantity, notes, reference_doc, created_by
  ) VALUES (
    p_company_id, p_product_id, p_direction, p_reason, p_quantity, 
    NULLIF(btrim(p_notes), ''), NULLIF(btrim(p_reference_doc), ''), v_user_id
  ) RETURNING id INTO v_new_movement_id;

  -- 7. Congelar Costo Histórico
  INSERT INTO public.movement_costs (
    company_id, movement_id, unit_cost, total_cost
  ) VALUES (
    p_company_id, v_new_movement_id, v_unit_cost, v_total_cost
  );

  -- 8. Obtener saldos definitivos calculados por el trigger
  SELECT previous_stock, new_stock INTO v_movement
  FROM public.stock_movements
  WHERE id = v_new_movement_id;

  -- 9. Confirmar Payload Final de Idempotencia y Retornar
  v_response_payload := jsonb_build_object(
    'movement_id', v_new_movement_id,
    'product_id', p_product_id,
    'direction', p_direction,
    'reason', p_reason,
    'quantity', p_quantity,
    'previous_stock', v_movement.previous_stock,
    'new_stock', v_movement.new_stock,
    'unit_cost', v_unit_cost,
    'total_cost', v_total_cost,
    'created_at', pg_catalog.now()
  );

  UPDATE public.operation_idempotency
  SET response_payload = v_response_payload,
      updated_at = pg_catalog.now()
  WHERE company_id = p_company_id 
    AND operation_type = 'stock_adjustment' 
    AND idempotency_key = p_idempotency_key;

  RETURN v_response_payload;
END;
$$;

COMMENT ON FUNCTION public.register_stock_adjustment(UUID, UUID, UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT) IS 
  'Ajuste manual atómico e idempotente de inventario. Exclusivo master_admin.';

-- 6.2. import_initial_stock: Carga inicial de existencias en lote
CREATE OR REPLACE FUNCTION public.import_initial_stock(
  p_company_id UUID,
  p_idempotency_key UUID,
  p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_request_hash TEXT;
  v_attempts INT := 0;
  v_rec RECORD;
  v_item RECORD;
  v_product_id UUID;
  v_qty NUMERIC;
  v_cost NUMERIC;
  v_total_cost NUMERIC;
  v_item_count INT;
  v_unique_count INT;
  v_product_ids UUID[];
  v_prod RECORD;
  v_new_movement_id UUID;
  v_response_payload JSONB;
  v_result_movements JSONB := '[]'::jsonb;
BEGIN
  -- 1. Validación de Autenticación y Autorización
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;

  IF p_company_id IS NULL OR p_idempotency_key IS NULL OR p_items IS NULL THEN
    RAISE EXCEPTION 'Parámetros obligatorios incompletos para la carga inicial.';
  END IF;

  PERFORM private.assert_company_role(p_company_id, 'master_admin');

  -- 2. Validación de Estructura de Array del Lote
  IF jsonb_typeof(p_items) != 'array' THEN
    RAISE EXCEPTION 'El parámetro p_items debe ser un array JSONB.';
  END IF;

  v_item_count := jsonb_array_length(p_items);
  IF v_item_count = 0 THEN
    RAISE EXCEPTION 'El lote de carga inicial no puede estar vacío.';
  END IF;

  -- 3. Parseo, Validación Tipada Estricta y Detección de Duplicados
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    -- Validar formato de UUID
    IF (v_item.value->>'product_id') IS NULL OR 
       (v_item.value->>'product_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'Identificador de producto inválido o nulo en el lote: %', (v_item.value->>'product_id');
    END IF;

    -- Validar cantidad numérica
    IF (v_item.value->>'quantity') IS NULL THEN
      RAISE EXCEPTION 'Cantidad nula para el producto % en el lote.', (v_item.value->>'product_id');
    END IF;

    BEGIN
      v_qty := (v_item.value->>'quantity')::NUMERIC;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Cantidad no numérica para el producto %.', (v_item.value->>'product_id');
    END;

    IF pg_catalog.scale(v_qty) > 2 THEN
      RAISE EXCEPTION 'La cantidad excede 2 decimales para el producto %: %', (v_item.value->>'product_id'), v_qty;
    END IF;

    IF v_qty <= 0 OR v_qty > 999999999.99 THEN
      RAISE EXCEPTION 'Cantidad fuera de rango (0 < cantidad <= 999.999.999,99) para el producto %: %', (v_item.value->>'product_id'), v_qty;
    END IF;

    -- Validar costo unitario numérico
    IF (v_item.value->>'unit_cost') IS NULL THEN
      RAISE EXCEPTION 'Costo unitario nulo para el producto % en el lote.', (v_item.value->>'product_id');
    END IF;

    BEGIN
      v_cost := (v_item.value->>'unit_cost')::NUMERIC;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Costo unitario no numérico para el producto %.', (v_item.value->>'product_id');
    END;

    IF pg_catalog.scale(v_cost) > 2 THEN
      RAISE EXCEPTION 'El costo unitario excede 2 decimales para el producto %: %', (v_item.value->>'product_id'), v_cost;
    END IF;

    IF v_cost < 0 OR v_cost > 999999999999.99 THEN
      RAISE EXCEPTION 'Costo fuera de rango (0 <= costo <= 999.999.999.999,99) para el producto %: %', (v_item.value->>'product_id'), v_cost;
    END IF;

    v_product_ids := array_append(v_product_ids, (v_item.value->>'product_id')::UUID);
  END LOOP;

  -- Detección de duplicados en tipo nativo UUID
  SELECT count(DISTINCT pid) INTO v_unique_count FROM unnest(v_product_ids) AS pid;
  IF v_unique_count != v_item_count THEN
    RAISE EXCEPTION 'El lote contiene productos duplicados (mismo product_id repetido).';
  END IF;

  -- 4. Construcción del Hash Canónico del Lote (Ordenado Determinísticamente por UUID)
  SELECT pg_catalog.encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'company_id', p_company_id,
          'operation_type', 'initial_load',
          'items', (
            SELECT jsonb_agg(
              jsonb_build_object(
                'product_id', (item->>'product_id')::UUID,
                'quantity', to_char((item->>'quantity')::NUMERIC, 'FM999999999990.00'),
                'unit_cost', to_char((item->>'unit_cost')::NUMERIC, 'FM999999999990.00')
              )
              ORDER BY (item->>'product_id')::UUID ASC
            )
            FROM jsonb_array_elements(p_items) AS item
          )
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ) INTO v_request_hash;

  -- 5. Bucle de Idempotencia Acotado
  LOOP
    v_attempts := v_attempts + 1;
    IF v_attempts > 3 THEN
      RAISE EXCEPTION 'No se pudo adquirir el candado de idempotencia tras 3 reintentos por contención concurrente.';
    END IF;

    INSERT INTO public.operation_idempotency (
      company_id, operation_type, idempotency_key, request_hash, response_payload, created_by
    ) VALUES (
      p_company_id, 'initial_load', p_idempotency_key, v_request_hash, NULL, v_user_id
    )
    ON CONFLICT (company_id, operation_type, idempotency_key) DO NOTHING;

    IF FOUND THEN
      EXIT;
    END IF;

    SELECT request_hash, response_payload INTO v_rec
    FROM public.operation_idempotency
    WHERE company_id = p_company_id 
      AND operation_type = 'initial_load' 
      AND idempotency_key = p_idempotency_key
    FOR UPDATE;

    IF FOUND THEN
      IF v_rec.request_hash != v_request_hash THEN
        RAISE EXCEPTION 'Idempotency key mismatch: clave de carga inicial reutilizada con distintos parámetros.';
      END IF;

      IF v_rec.response_payload IS NULL THEN
        RAISE EXCEPTION 'Estado inconsistente de idempotencia: carga inicial previa confirmada sin payload.';
      END IF;

      RETURN v_rec.response_payload;
    END IF;
  END LOOP;

  -- 6. Bloqueo Pesimista en Orden Canónico Ascendente de Todos los Productos del Lote
  PERFORM id FROM public.products
  WHERE company_id = p_company_id AND id = ANY(v_product_ids)
  ORDER BY id ASC
  FOR UPDATE;

  -- 7. Validación de Pertenencia y Regla de Stock Inicial Cero sin Movimientos Previos
  FOR v_product_id IN SELECT unnest(v_product_ids) LOOP
    SELECT id, current_stock INTO v_prod
    FROM public.products
    WHERE company_id = p_company_id AND id = v_product_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Producto % no encontrado o no pertenece a la empresa %.', v_product_id, p_company_id;
    END IF;

    -- Regla Documentada de Carga Inicial: Solo productos con saldo 0 sin movimientos previos
    IF v_prod.current_stock != 0 THEN
      RAISE EXCEPTION 'El producto % ya posee existencias registradas (%). La carga inicial solo admite productos con stock cero.', 
        v_product_id, v_prod.current_stock;
    END IF;

    IF EXISTS (SELECT 1 FROM public.stock_movements WHERE company_id = p_company_id AND product_id = v_product_id) THEN
      RAISE EXCEPTION 'El producto % ya posee movimientos históricos registrados. Utilice ajustes manuales para modificar existencias.', v_product_id;
    END IF;
  END LOOP;

  -- 8. Aplicación Atómica de la Carga Inicial para Cada Ítem
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := (v_item.value->>'product_id')::UUID;
    v_qty := (v_item.value->>'quantity')::NUMERIC;
    v_cost := (v_item.value->>'unit_cost')::NUMERIC;
    v_total_cost := pg_catalog.round(v_qty * v_cost, 2);

    -- Actualizar o crear costo de reposición
    INSERT INTO public.product_costs (
      company_id, product_id, cost_price, updated_by
    ) VALUES (
      p_company_id, v_product_id, v_cost, v_user_id
    )
    ON CONFLICT (company_id, product_id) DO UPDATE
      SET cost_price = EXCLUDED.cost_price,
          updated_by = EXCLUDED.updated_by,
          updated_at = pg_catalog.now();

    -- Insertar movimiento físico (El trigger tr_sync_stock_movements actualiza el stock a v_qty)
    INSERT INTO public.stock_movements (
      company_id, product_id, direction, reason, quantity, notes, reference_doc, created_by
    ) VALUES (
      p_company_id, v_product_id, 'increase', 'initial_load', v_qty, 
      'Carga inicial de inventario', 'INICIAL', v_user_id
    ) RETURNING id INTO v_new_movement_id;

    -- Congelar costo histórico
    INSERT INTO public.movement_costs (
      company_id, movement_id, unit_cost, total_cost
    ) VALUES (
      p_company_id, v_new_movement_id, v_cost, v_total_cost
    );

    v_result_movements := v_result_movements || jsonb_build_object(
      'product_id', v_product_id,
      'movement_id', v_new_movement_id,
      'quantity', v_qty,
      'unit_cost', v_cost,
      'total_cost', v_total_cost
    );
  END LOOP;

  -- 9. Confirmar Payload Final de Idempotencia y Retornar
  v_response_payload := jsonb_build_object(
    'company_id', p_company_id,
    'operation_type', 'initial_load',
    'items_count', v_item_count,
    'movements', v_result_movements,
    'created_at', pg_catalog.now()
  );

  UPDATE public.operation_idempotency
  SET response_payload = v_response_payload,
      updated_at = pg_catalog.now()
  WHERE company_id = p_company_id 
    AND operation_type = 'initial_load' 
    AND idempotency_key = p_idempotency_key;

  RETURN v_response_payload;
END;
$$;

COMMENT ON FUNCTION public.import_initial_stock(UUID, UUID, JSONB) IS 
  'Carga inicial masiva atómica e idempotente para productos nuevos sin movimientos previos. Exclusivo master_admin.';

-- ----------------------------------------------------------------------------
-- 7. POLÍTICAS DE SEGURIDAD A NIVEL DE FILA (RLS)
-- ----------------------------------------------------------------------------
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories FORCE ROW LEVEL SECURITY;

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers FORCE ROW LEVEL SECURITY;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products FORCE ROW LEVEL SECURITY;

ALTER TABLE public.product_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_costs FORCE ROW LEVEL SECURITY;

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements FORCE ROW LEVEL SECURITY;

ALTER TABLE public.movement_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movement_costs FORCE ROW LEVEL SECURITY;

ALTER TABLE public.operation_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operation_idempotency FORCE ROW LEVEL SECURITY;

-- 7.1. categories: Lectura para miembros de empresas accesibles
CREATE POLICY "categories_select_member" ON public.categories
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT private.my_accessible_company_ids()));

-- 7.2. suppliers: Lectura para miembros de empresas accesibles
CREATE POLICY "suppliers_select_member" ON public.suppliers
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT private.my_accessible_company_ids()));

-- 7.3. products: Lectura para miembros de empresas accesibles
CREATE POLICY "products_select_member" ON public.products
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT private.my_accessible_company_ids()));

-- 7.4. product_costs: Ocultamiento absoluto para employee. Solo master_admin activo
CREATE POLICY "product_costs_select_admin" ON public.product_costs
  FOR SELECT TO authenticated
  USING (
    company_id IN (SELECT private.my_active_company_ids()) AND 
    private.has_company_role(company_id, 'master_admin')
  );

-- 7.5. stock_movements: Lectura para miembros de empresas accesibles
CREATE POLICY "stock_movements_select_member" ON public.stock_movements
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT private.my_accessible_company_ids()));

-- 7.6. movement_costs: Ocultamiento absoluto para employee. Solo master_admin activo
CREATE POLICY "movement_costs_select_admin" ON public.movement_costs
  FOR SELECT TO authenticated
  USING (
    company_id IN (SELECT private.my_active_company_ids()) AND 
    private.has_company_role(company_id, 'master_admin')
  );

-- 7.7. operation_idempotency: Solo lectura para master_admin activo
CREATE POLICY "operation_idempotency_select_admin" ON public.operation_idempotency
  FOR SELECT TO authenticated
  USING (
    company_id IN (SELECT private.my_active_company_ids()) AND 
    private.has_company_role(company_id, 'master_admin')
  );

-- ----------------------------------------------------------------------------
-- 8. CONCESIÓN Y REVOCACIÓN DE PRIVILEGIOS SQL (DEFENSA EN PROFUNDIDAD)
-- ----------------------------------------------------------------------------

-- 8.1. Revocación Total de Mutación Directa en Tablas Base a Clientes
REVOKE ALL ON public.categories FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.suppliers FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.products FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.product_costs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.stock_movements FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.movement_costs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.operation_idempotency FROM PUBLIC, anon, authenticated;

-- 8.2. Concesión Exclusiva de SELECT (Sujeta a RLS)
GRANT SELECT ON public.categories TO authenticated;
GRANT SELECT ON public.suppliers TO authenticated;
GRANT SELECT ON public.products TO authenticated;
GRANT SELECT ON public.product_costs TO authenticated;
GRANT SELECT ON public.stock_movements TO authenticated;
GRANT SELECT ON public.movement_costs TO authenticated;
-- operation_idempotency permanece sin permisos a authenticated (solo accesible por RPC)

-- 8.3. Concesión de Ejecución de Procedimientos Almacenados (RPC)
GRANT EXECUTE ON FUNCTION public.register_stock_adjustment TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_initial_stock TO authenticated;

REVOKE ALL ON FUNCTION public.register_stock_adjustment FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.import_initial_stock FROM PUBLIC, anon;

-- 8.4. Revocación de Ejecución Directa de Triggers a Clientes
REVOKE ALL ON FUNCTION public.sync_product_stock FROM PUBLIC, anon, authenticated;
