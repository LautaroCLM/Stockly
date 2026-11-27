-- ============================================================================
-- MIGRACIÓN: VENCIMIENTOS POR LOTE
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
--
-- Solo para productos con products.tracks_expiry. El stock sigue saliendo de
-- stock_movements; los lotes lo detallan. Un trigger AFTER INSERT reparte cada movimiento:
--   - compra con fecha: crea un lote nuevo;
--   - otras entradas: lote "sin fecha" del producto (uno solo por producto);
--   - anulación o devolución de venta: vuelve a los lotes de los que salió esa venta;
--   - salidas: el lote que vence primero; "sin fecha" al final. La anulación de una compra
--     descuenta primero del lote que creó esa compra; dar de baja un lote descuenta de ese lote.
-- Invariante: suma de lo que queda en los lotes = max(stock, 0).
-- Acceso: ver, todo el equipo; editar, separar y dar de baja con 'productos' operate.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. COLUMNAS NUEVAS
-- ----------------------------------------------------------------------------
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS tracks_expiry BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS expiry_warning_days INTEGER NOT NULL DEFAULT 30;
ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS chk_companies_expiry_warning_days;
ALTER TABLE public.companies ADD CONSTRAINT chk_companies_expiry_warning_days CHECK (expiry_warning_days BETWEEN 1 AND 365);

ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS lot_code TEXT;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS expires_on DATE;
ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS chk_stock_movements_lot_code_len;
ALTER TABLE public.stock_movements ADD CONSTRAINT chk_stock_movements_lot_code_len CHECK (lot_code IS NULL OR pg_catalog.length(lot_code) <= 50);

ALTER TABLE public.purchase_items ADD COLUMN IF NOT EXISTS lot_code TEXT;
ALTER TABLE public.purchase_items ADD COLUMN IF NOT EXISTS expires_on DATE;
ALTER TABLE public.purchase_items DROP CONSTRAINT IF EXISTS chk_purchase_items_lot_code_len;
ALTER TABLE public.purchase_items ADD CONSTRAINT chk_purchase_items_lot_code_len CHECK (lot_code IS NULL OR pg_catalog.length(lot_code) <= 50);

-- ----------------------------------------------------------------------------
-- 2. TABLAS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL,
  lot_code TEXT CHECK (lot_code IS NULL OR (lot_code = pg_catalog.btrim(lot_code) AND pg_catalog.length(lot_code) BETWEEN 1 AND 50)),
  expires_on DATE,
  initial_quantity NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (initial_quantity >= 0),
  remaining_quantity NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (remaining_quantity >= 0),
  purchase_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_stock_lots_company_id UNIQUE (company_id, id),
  CONSTRAINT fk_stock_lots_product FOREIGN KEY (company_id, product_id) REFERENCES public.products(company_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_stock_lots_purchase FOREIGN KEY (company_id, purchase_id) REFERENCES public.purchases(company_id, id) ON DELETE RESTRICT
);
-- Un solo lote "sin fecha" por producto
CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_lots_undated ON public.stock_lots (company_id, product_id) WHERE expires_on IS NULL;
CREATE INDEX IF NOT EXISTS idx_stock_lots_product ON public.stock_lots (company_id, product_id, expires_on);
CREATE INDEX IF NOT EXISTS idx_stock_lots_open ON public.stock_lots (company_id, expires_on) WHERE remaining_quantity > 0;

CREATE TABLE IF NOT EXISTS public.stock_lot_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  movement_id UUID NOT NULL,
  lot_id UUID NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  quantity NUMERIC(12, 2) NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_lot_alloc_movement FOREIGN KEY (company_id, movement_id) REFERENCES public.stock_movements(company_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_lot_alloc_lot FOREIGN KEY (company_id, lot_id) REFERENCES public.stock_lots(company_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_lot_alloc_movement ON public.stock_lot_allocations (company_id, movement_id);
CREATE INDEX IF NOT EXISTS idx_lot_alloc_lot ON public.stock_lot_allocations (company_id, lot_id);

ALTER TABLE public.stock_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_lots FORCE ROW LEVEL SECURITY;
ALTER TABLE public.stock_lot_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_lot_allocations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stock_lots_select" ON public.stock_lots;
CREATE POLICY "stock_lots_select" ON public.stock_lots FOR SELECT TO authenticated
  USING (company_id IN (SELECT private.my_accessible_company_ids()));
DROP POLICY IF EXISTS "stock_lot_allocations_select" ON public.stock_lot_allocations;
CREATE POLICY "stock_lot_allocations_select" ON public.stock_lot_allocations FOR SELECT TO authenticated
  USING (company_id IN (SELECT private.my_accessible_company_ids()));
REVOKE ALL ON public.stock_lots, public.stock_lot_allocations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.stock_lots, public.stock_lot_allocations TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. PRIMITIVAS: meter y sacar unidades de un lote, dejando el rastro del movimiento
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.lot_put(p_company_id UUID, p_lot_id UUID, p_quantity NUMERIC, p_movement_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_quantity <= 0 THEN RETURN; END IF;
  UPDATE public.stock_lots
  SET remaining_quantity = remaining_quantity + p_quantity, updated_at = pg_catalog.now()
  WHERE company_id = p_company_id AND id = p_lot_id;
  IF p_movement_id IS NOT NULL THEN
    INSERT INTO public.stock_lot_allocations (company_id, movement_id, lot_id, direction, quantity)
    VALUES (p_company_id, p_movement_id, p_lot_id, 'in', p_quantity);
  END IF;
END;
$$;

-- Lote "sin fecha" del producto (lo crea si no existe)
CREATE OR REPLACE FUNCTION private.undated_lot(p_company_id UUID, p_product_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id FROM public.stock_lots
  WHERE company_id = p_company_id AND product_id = p_product_id AND expires_on IS NULL;
  IF v_id IS NULL THEN
    INSERT INTO public.stock_lots (company_id, product_id) VALUES (p_company_id, p_product_id)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. TRIGGER: reparte cada movimiento de un producto con vencimiento
--    Corre después de sync_product_stock (BEFORE), que ya bloqueó el producto: los
--    movimientos de un mismo producto quedan serializados.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.allocate_stock_lots()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tracks BOOLEAN;
  v_in_lots NUMERIC;
  v_qty NUMERIC;
  v_take NUMERIC;
  v_lot_id UUID;
  v_hint UUID;
  r RECORD;
BEGIN
  SELECT tracks_expiry INTO v_tracks FROM public.products WHERE company_id = NEW.company_id AND id = NEW.product_id;
  IF NOT COALESCE(v_tracks, false) THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(pg_catalog.sum(remaining_quantity), 0) INTO v_in_lots
  FROM public.stock_lots WHERE company_id = NEW.company_id AND product_id = NEW.product_id;

  IF NEW.direction = 'increase' THEN
    -- Si el stock venía negativo, primero se cubre el faltante (esas unidades no van a ningún lote)
    v_qty := LEAST(NEW.quantity, GREATEST(NEW.new_stock - v_in_lots, 0));
    IF v_qty <= 0 THEN RETURN NULL; END IF;

    IF NEW.reason IN ('cancellation', 'sale_return') AND NEW.reference_sale_id IS NOT NULL THEN
      FOR r IN
        SELECT a.lot_id,
               pg_catalog.sum(CASE WHEN a.direction = 'out' THEN a.quantity ELSE -a.quantity END) AS net
        FROM public.stock_lot_allocations a
        JOIN public.stock_movements m ON m.company_id = a.company_id AND m.id = a.movement_id
        JOIN public.stock_lots l ON l.company_id = a.company_id AND l.id = a.lot_id
        WHERE m.company_id = NEW.company_id AND m.reference_sale_id = NEW.reference_sale_id
          AND m.product_id = NEW.product_id AND m.id <> NEW.id
        GROUP BY a.lot_id, l.expires_on, l.created_at
        HAVING pg_catalog.sum(CASE WHEN a.direction = 'out' THEN a.quantity ELSE -a.quantity END) > 0
        ORDER BY l.expires_on ASC NULLS LAST, l.created_at ASC
      LOOP
        EXIT WHEN v_qty <= 0;
        v_take := LEAST(v_qty, r.net);
        PERFORM private.lot_put(NEW.company_id, r.lot_id, v_take, NEW.id);
        v_qty := v_qty - v_take;
      END LOOP;
    ELSIF NEW.reason = 'purchase' AND NEW.expires_on IS NOT NULL THEN
      INSERT INTO public.stock_lots (company_id, product_id, lot_code, expires_on, initial_quantity, purchase_id)
      VALUES (NEW.company_id, NEW.product_id, NEW.lot_code, NEW.expires_on, v_qty, NEW.reference_purchase_id)
      RETURNING id INTO v_lot_id;
      PERFORM private.lot_put(NEW.company_id, v_lot_id, v_qty, NEW.id);
      v_qty := 0;
    END IF;

    IF v_qty > 0 THEN
      v_lot_id := private.undated_lot(NEW.company_id, NEW.product_id);
      UPDATE public.stock_lots SET initial_quantity = initial_quantity + v_qty
      WHERE company_id = NEW.company_id AND id = v_lot_id;
      PERFORM private.lot_put(NEW.company_id, v_lot_id, v_qty, NEW.id);
    END IF;
    RETURN NULL;
  END IF;

  -- Salida: lo que no alcanza en los lotes queda sin lote (stock negativo)
  v_qty := LEAST(NEW.quantity, v_in_lots);
  v_hint := NULLIF(pg_catalog.current_setting('stockly.lot_hint', true), '')::UUID;
  FOR r IN
    SELECT id, remaining_quantity FROM public.stock_lots
    WHERE company_id = NEW.company_id AND product_id = NEW.product_id AND remaining_quantity > 0
    ORDER BY (id = v_hint) IS TRUE DESC,
             (NEW.reason = 'purchase_cancellation' AND purchase_id = NEW.reference_purchase_id) IS TRUE DESC,
             expires_on ASC NULLS LAST, created_at ASC, id ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_qty <= 0;
    v_take := LEAST(v_qty, r.remaining_quantity);
    UPDATE public.stock_lots
    SET remaining_quantity = remaining_quantity - v_take, updated_at = pg_catalog.now()
    WHERE company_id = NEW.company_id AND id = r.id;
    INSERT INTO public.stock_lot_allocations (company_id, movement_id, lot_id, direction, quantity)
    VALUES (NEW.company_id, NEW.id, r.id, 'out', v_take);
    v_qty := v_qty - v_take;
  END LOOP;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS tr_allocate_stock_lots ON public.stock_movements;
CREATE TRIGGER tr_allocate_stock_lots
  AFTER INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.allocate_stock_lots();

REVOKE ALL ON FUNCTION private.lot_put(UUID, UUID, NUMERIC, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.undated_lot(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.allocate_stock_lots() FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. AUDITORÍA DE ACCIONES SOBRE LOTES
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.audit_lot(p_company_id UUID, p_lot_id UUID, p_action TEXT, p_data JSONB)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.audit_log (company_id, table_name, record_id, action, new_data, performed_by, actor_role)
  SELECT p_company_id, 'stock_lots', p_lot_id::text, p_action, p_data, auth.uid(),
         (SELECT cm.role FROM public.company_members cm WHERE cm.company_id = p_company_id AND cm.user_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION private.audit_lot(UUID, UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 6. ACTIVAR O DESACTIVAR EL CONTROL DE VENCIMIENTO DE UN PRODUCTO
--    Al activar, el stock actual queda en el lote "sin fecha". Al desactivar, los lotes
--    quedan en cero (se conserva el historial); si se vuelve a activar, se empieza de nuevo.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_product_tracks_expiry(p_company_id UUID, p_product_id UUID, p_enabled BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_prod RECORD;
  v_lot_id UUID;
BEGIN
  PERFORM private.assert_module_access(p_company_id, ARRAY['productos'], 'operate');
  IF p_enabled IS NULL THEN
    RAISE EXCEPTION 'Indicá si el producto controla vencimiento.';
  END IF;

  SELECT id, name, tracks_expiry, current_stock INTO v_prod
  FROM public.products WHERE company_id = p_company_id AND id = p_product_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El producto no existe o no pertenece a esta empresa.';
  END IF;
  IF v_prod.tracks_expiry = p_enabled THEN
    RETURN;
  END IF;

  UPDATE public.stock_lots SET remaining_quantity = 0, updated_at = pg_catalog.now()
  WHERE company_id = p_company_id AND product_id = p_product_id AND remaining_quantity > 0;

  UPDATE public.products SET tracks_expiry = p_enabled WHERE company_id = p_company_id AND id = p_product_id;

  IF p_enabled AND v_prod.current_stock > 0 THEN
    v_lot_id := private.undated_lot(p_company_id, p_product_id);
    UPDATE public.stock_lots
    SET remaining_quantity = v_prod.current_stock, initial_quantity = initial_quantity + v_prod.current_stock,
        updated_at = pg_catalog.now()
    WHERE company_id = p_company_id AND id = v_lot_id;
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. LOTES CON UNIDADES (pantalla Vencimientos, avisos y carrito)
--    days_left: días hasta el vencimiento según la fecha local de la empresa (negativo = vencido).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.stock_lots_list(p_company_id UUID)
RETURNS TABLE (
  lot_id UUID, product_id UUID, product_name TEXT, sku TEXT, unit TEXT, lot_code TEXT, expires_on DATE,
  remaining_quantity NUMERIC, initial_quantity NUMERIC, purchase_number TEXT, days_left INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_today DATE;
BEGIN
  -- Lo ve todo el equipo (el carrito avisa si un producto tiene unidades vencidas)
  IF p_company_id IS NULL OR p_company_id NOT IN (SELECT private.my_accessible_company_ids()) THEN
    RAISE EXCEPTION 'El usuario no es un miembro activo de esta empresa.';
  END IF;
  SELECT (pg_catalog.now() AT TIME ZONE c.timezone)::DATE INTO v_today FROM public.companies c WHERE c.id = p_company_id;
  RETURN QUERY
  SELECT l.id, p.id, p.name, p.sku, p.unit, l.lot_code, l.expires_on, l.remaining_quantity, l.initial_quantity,
         pu.purchase_number, (l.expires_on - v_today)::INTEGER
  FROM public.stock_lots l
  JOIN public.products p ON p.company_id = l.company_id AND p.id = l.product_id
  LEFT JOIN public.purchases pu ON pu.company_id = l.company_id AND pu.id = l.purchase_id
  WHERE l.company_id = p_company_id AND l.remaining_quantity > 0 AND p.tracks_expiry
  ORDER BY l.expires_on ASC NULLS LAST, p.name ASC, l.created_at ASC;
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. EDITAR FECHA Y NÚMERO DE UN LOTE (la fecha es obligatoria: un lote con fecha no
--    vuelve a "sin fecha")
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.clean_lot_code(p_lot_code TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v TEXT := NULLIF(pg_catalog.btrim(p_lot_code), '');
BEGIN
  IF v IS NOT NULL AND pg_catalog.length(v) > 50 THEN
    RAISE EXCEPTION 'El número de lote no puede superar los 50 caracteres.';
  END IF;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION private.clean_lot_code(TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.update_stock_lot(p_company_id UUID, p_lot_id UUID, p_lot_code TEXT, p_expires_on DATE)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lot RECORD;
  v_code TEXT := private.clean_lot_code(p_lot_code);
BEGIN
  PERFORM private.assert_module_access(p_company_id, ARRAY['productos'], 'operate');
  IF p_expires_on IS NULL THEN
    RAISE EXCEPTION 'Indicá la fecha de vencimiento.';
  END IF;

  SELECT l.* INTO v_lot FROM public.stock_lots l WHERE l.company_id = p_company_id AND l.id = p_lot_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El lote no existe o no pertenece a esta empresa.';
  END IF;

  UPDATE public.stock_lots SET lot_code = v_code, expires_on = p_expires_on, updated_at = pg_catalog.now()
  WHERE company_id = p_company_id AND id = p_lot_id;

  PERFORM private.audit_lot(p_company_id, p_lot_id, 'UPDATE', pg_catalog.jsonb_build_object(
    'product_id', v_lot.product_id, 'lot_code', v_code, 'expires_on', p_expires_on,
    'previous_lot_code', v_lot.lot_code, 'previous_expires_on', v_lot.expires_on));
END;
$$;

-- ----------------------------------------------------------------------------
-- 9. SEPARAR UNIDADES DE UN LOTE EN OTRO CON SU PROPIA FECHA
--    Sirve para repartir el stock "sin fecha" al empezar a controlar vencimientos.
--    No cambia el stock: no genera movimiento.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.split_stock_lot(
  p_company_id UUID, p_lot_id UUID, p_quantity NUMERIC, p_lot_code TEXT, p_expires_on DATE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lot RECORD;
  v_unit TEXT;
  v_new_id UUID;
  v_code TEXT := private.clean_lot_code(p_lot_code);
BEGIN
  PERFORM private.assert_module_access(p_company_id, ARRAY['productos'], 'operate');
  IF p_expires_on IS NULL THEN
    RAISE EXCEPTION 'Indicá la fecha de vencimiento.';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 OR pg_catalog.scale(p_quantity) > 2 THEN
    RAISE EXCEPTION 'La cantidad debe ser mayor a 0, con hasta 2 decimales.';
  END IF;

  SELECT l.* INTO v_lot FROM public.stock_lots l WHERE l.company_id = p_company_id AND l.id = p_lot_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El lote no existe o no pertenece a esta empresa.';
  END IF;
  -- Mismo orden de bloqueo que los movimientos: primero el producto, después el lote
  SELECT unit INTO v_unit FROM public.products WHERE company_id = p_company_id AND id = v_lot.product_id FOR UPDATE;
  SELECT l.* INTO v_lot FROM public.stock_lots l WHERE l.company_id = p_company_id AND l.id = p_lot_id FOR UPDATE;

  IF v_unit IN ('unidad', 'bulto', 'par') AND p_quantity <> pg_catalog.round(p_quantity, 0) THEN
    RAISE EXCEPTION 'La unidad % no admite cantidades fraccionarias.', v_unit;
  END IF;
  IF p_quantity > v_lot.remaining_quantity THEN
    RAISE EXCEPTION 'El lote tiene % unidades; no se pueden separar %.', v_lot.remaining_quantity, p_quantity;
  END IF;

  UPDATE public.stock_lots SET remaining_quantity = remaining_quantity - p_quantity, updated_at = pg_catalog.now()
  WHERE company_id = p_company_id AND id = p_lot_id;
  INSERT INTO public.stock_lots (company_id, product_id, lot_code, expires_on, initial_quantity, remaining_quantity)
  VALUES (p_company_id, v_lot.product_id, v_code, p_expires_on, p_quantity, p_quantity)
  RETURNING id INTO v_new_id;

  PERFORM private.audit_lot(p_company_id, v_new_id, 'INSERT', pg_catalog.jsonb_build_object(
    'product_id', v_lot.product_id, 'split_from', p_lot_id, 'quantity', p_quantity,
    'lot_code', v_code, 'expires_on', p_expires_on));
  RETURN v_new_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 10. DAR DE BAJA UN LOTE: salida "pérdida / rotura" por lo que queda, de ese lote.
--     Usa register_stock_adjustment (idempotencia, costos e Historial de siempre) y le
--     indica al trigger el lote con una variable local de la transacción.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.write_off_stock_lot(p_company_id UUID, p_idempotency_key UUID, p_lot_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lot RECORD;
  v_result JSONB;
  v_label TEXT;
  v_saved JSONB;
BEGIN
  PERFORM private.assert_module_access(p_company_id, ARRAY['productos'], 'operate');
  SELECT l.* INTO v_lot FROM public.stock_lots l WHERE l.company_id = p_company_id AND l.id = p_lot_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El lote no existe o no pertenece a esta empresa.';
  END IF;
  PERFORM 1 FROM public.products WHERE company_id = p_company_id AND id = v_lot.product_id FOR UPDATE;
  SELECT l.* INTO v_lot FROM public.stock_lots l WHERE l.company_id = p_company_id AND l.id = p_lot_id FOR UPDATE;

  -- Reintento con la misma clave (doble clic, red): devuelve lo ya registrado
  SELECT oi.response_payload INTO v_saved FROM public.operation_idempotency oi
  WHERE oi.company_id = p_company_id AND oi.created_by = auth.uid() AND oi.idempotency_key = p_idempotency_key
    AND oi.response_payload IS NOT NULL AND oi.expires_at > pg_catalog.now();
  IF v_saved IS NOT NULL THEN
    RETURN v_saved;
  END IF;
  IF v_lot.remaining_quantity <= 0 THEN
    RAISE EXCEPTION 'Este lote ya no tiene unidades.';
  END IF;

  v_label := 'Baja de lote' || COALESCE(' ' || v_lot.lot_code, '') ||
             COALESCE(' (vence ' || pg_catalog.to_char(v_lot.expires_on, 'DD/MM/YYYY') || ')', ' (sin fecha)');
  PERFORM pg_catalog.set_config('stockly.lot_hint', p_lot_id::text, true);
  v_result := public.register_stock_adjustment(
    p_company_id, p_idempotency_key, v_lot.product_id, 'decrease', 'loss_damage', v_lot.remaining_quantity, v_label, NULL
  );
  PERFORM pg_catalog.set_config('stockly.lot_hint', '', true);
  RETURN v_result;
END;
$$;

-- ----------------------------------------------------------------------------
-- 11. DÍAS DE AVISO ANTES DEL VENCIMIENTO (Master Admin)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_expiry_warning_days(p_company_id UUID, p_days INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.has_company_role(p_company_id, 'master_admin') THEN
    RAISE EXCEPTION 'Solo el Master Admin puede cambiar los días de aviso de vencimiento.';
  END IF;
  IF p_days IS NULL OR p_days < 1 OR p_days > 365 THEN
    RAISE EXCEPTION 'Los días de aviso tienen que estar entre 1 y 365.';
  END IF;
  UPDATE public.companies SET expiry_warning_days = p_days WHERE id = p_company_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_product_tracks_expiry(UUID, UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stock_lots_list(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_stock_lot(UUID, UUID, TEXT, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.split_stock_lot(UUID, UUID, NUMERIC, TEXT, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.write_off_stock_lot(UUID, UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_expiry_warning_days(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_product_tracks_expiry(UUID, UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stock_lots_list(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_stock_lot(UUID, UUID, TEXT, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.split_stock_lot(UUID, UUID, NUMERIC, TEXT, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.write_off_stock_lot(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_expiry_warning_days(UUID, INTEGER) TO authenticated;

-- ----------------------------------------------------------------------------
-- 12. COMPRAS: fecha de vencimiento y lote por línea (obligatoria si el producto controla
--     vencimiento). Misma firma; solo cambian la validación de ítems y las inserciones.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_purchase(p_company_id uuid, p_idempotency_key uuid, p_supplier_id uuid, p_items jsonb, p_invoice_number text DEFAULT NULL::text, p_purchase_date date DEFAULT NULL::date, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_company_active BOOLEAN;
  v_supplier_active BOOLEAN;
  v_num_items INT;
  v_canonical_json JSONB;
  v_request_hash TEXT;
  v_rec RECORD;
  v_attempts INT := 0;
  v_sorted_product_ids UUID[];
  v_item RECORD;
  v_prod RECORD;
  v_subtotal NUMERIC(14, 2) := 0.00;
  v_total_amount NUMERIC(14, 2) := 0.00;
  v_next_counter BIGINT;
  v_purchase_number TEXT;
  v_purchase_id UUID;
  v_movement_id UUID;
  v_effective_date DATE;
  v_timezone TEXT;
  v_local_today DATE;
  v_clean_invoice TEXT;
  v_response_payload JSONB;
BEGIN
  -- 1. Autenticación y Parámetros Obligatorios
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;

  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'El identificador de empresa (p_company_id) es obligatorio.';
  END IF;

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'La clave de idempotencia (p_idempotency_key) es obligatoria.';
  END IF;

  IF p_supplier_id IS NULL THEN
    RAISE EXCEPTION 'El identificador de proveedor (p_supplier_id) es obligatorio.';
  END IF;

  IF p_items IS NULL OR pg_catalog.jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'El detalle de la compra (p_items) debe ser un arreglo JSON válido.';
  END IF;

  v_num_items := pg_catalog.jsonb_array_length(p_items);
  IF v_num_items = 0 THEN
    RAISE EXCEPTION 'El detalle de compra no puede estar vacío.';
  END IF;

  -- 2. Validación de Rol: Exclusivo para master_admin activo
  PERFORM private.assert_module_access(p_company_id, ARRAY['compras'], 'operate');

  -- 2.1. Bloqueo de Empresa (FOR NO KEY UPDATE) para serializar contra desactivación concurrente
  SELECT is_active, timezone INTO v_company_active, v_timezone
  FROM public.companies
  WHERE id = p_company_id
  FOR NO KEY UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Empresa con ID % no encontrada.', p_company_id;
  END IF;

  IF NOT v_company_active THEN
    RAISE EXCEPTION 'La empresa se encuentra inactiva. No se admiten compras.';
  END IF;

  -- 2.2. Revalidar rol tras adquirir el bloqueo de empresa (anti-TOCTOU)
  PERFORM private.assert_module_access(p_company_id, ARRAY['compras'], 'operate');

  -- 3. Validación de Proveedor (debe pertenecer a la empresa y estar activo)
  SELECT is_active INTO v_supplier_active
  FROM public.suppliers
  WHERE id = p_supplier_id AND company_id = p_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El proveedor especificado no existe o no pertenece a esta empresa.'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT v_supplier_active THEN
    RAISE EXCEPTION 'No se pueden registrar compras a un proveedor inactivo.'
      USING ERRCODE = 'P0001';
  END IF;

  -- 4. Normalización de campos de texto y fecha
  -- Fecha local de la empresa (no la del servidor en UTC)
  v_local_today := (pg_catalog.now() AT TIME ZONE v_timezone)::DATE;
  v_effective_date := COALESCE(p_purchase_date, v_local_today);

  IF v_effective_date > v_local_today THEN
    RAISE EXCEPTION 'La fecha de la compra (%) no puede ser posterior a hoy (%).', v_effective_date, v_local_today;
  END IF;
  v_clean_invoice := NULLIF(pg_catalog.btrim(p_invoice_number), '');

  IF v_clean_invoice IS NOT NULL AND pg_catalog.length(v_clean_invoice) > 100 THEN
    RAISE EXCEPTION 'El número de comprobante o factura no puede superar los 100 caracteres.';
  END IF;

  IF p_notes IS NOT NULL AND pg_catalog.length(p_notes) > 1000 THEN
    RAISE EXCEPTION 'Las observaciones no pueden superar los 1000 caracteres.';
  END IF;

  -- 5. Idempotencia: Cálculo de Hash Canónico de la Petición
  v_canonical_json := pg_catalog.jsonb_build_object(
    'company_id', p_company_id,
    'supplier_id', p_supplier_id,
    'invoice_number', COALESCE(v_clean_invoice, ''),
    'purchase_date', v_effective_date,
    'items', p_items,
    'notes', COALESCE(p_notes, '')
  );

  v_request_hash := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(v_canonical_json::text, 'UTF8')),
    'hex'
  );

  -- Bucle de reserva/consulta de clave de idempotencia
  LOOP
    v_attempts := v_attempts + 1;
    IF v_attempts > 5 THEN
      RAISE EXCEPTION 'Fallo de concurrencia al procesar la clave de idempotencia de la compra.';
    END IF;

    SELECT id, request_hash, response_payload, expires_at INTO v_rec
    FROM public.operation_idempotency
    WHERE company_id = p_company_id
      AND created_by = v_user_id
      AND operation_type = 'purchase'
      AND idempotency_key = p_idempotency_key
    FOR UPDATE;

    IF FOUND THEN
      -- Si expiró el TTL, se purga y se reintenta inserción limpia
      IF v_rec.expires_at <= pg_catalog.now() THEN
        DELETE FROM public.operation_idempotency WHERE id = v_rec.id;
        CONTINUE;
      END IF;

      -- Verificar coherencia de hash
      IF v_rec.request_hash <> v_request_hash THEN
        RAISE EXCEPTION 'Idempotency key mismatch: clave de compra reutilizada con distintos parámetros.';
      END IF;

      IF v_rec.response_payload IS NULL THEN
        RAISE EXCEPTION 'Estado inconsistente de idempotencia: compra previa en procesamiento inconcluso.';
      END IF;

      -- Retorno directo del comprobante procesado originalmente
      RETURN v_rec.response_payload;
    END IF;

    -- Intento de inserción de reserva de clave
    BEGIN
      INSERT INTO public.operation_idempotency (
        company_id,
        operation_type,
        idempotency_key,
        created_by,
        request_hash,
        response_payload,
        created_at,
        updated_at,
        expires_at
      ) VALUES (
        p_company_id,
        'purchase',
        p_idempotency_key,
        v_user_id,
        v_request_hash,
        NULL,
        pg_catalog.now(),
        pg_catalog.now(),
        pg_catalog.now() + interval '24 hours'
      );
      EXIT; -- Inserción exitosa de reserva
    EXCEPTION WHEN unique_violation THEN
      CONTINUE; -- Colisión concurrente, repetir lectura FOR UPDATE
    END;
  END LOOP;

  -- 6. Validación de Ítems de Compra y Detección de Duplicados
  SELECT pg_catalog.array_agg((x.value->>'product_id')::UUID)
  INTO v_sorted_product_ids
  FROM pg_catalog.jsonb_array_elements(p_items) AS x;

  IF (SELECT pg_catalog.count(*) FROM pg_catalog.unnest(v_sorted_product_ids)) <>
     (SELECT pg_catalog.count(DISTINCT x) FROM pg_catalog.unnest(v_sorted_product_ids) x) THEN
    RAISE EXCEPTION 'Existen productos duplicados en el detalle de la compra.';
  END IF;

  -- 6.1. Bloqueo determinístico canónico de productos (ORDER BY id ASC FOR UPDATE)
  PERFORM 1
  FROM public.products p
  WHERE p.id = ANY(v_sorted_product_ids)
    AND p.company_id = p_company_id
  ORDER BY p.id ASC
  FOR UPDATE;

  -- Verificar que todos los productos existan y pertenezcan a la empresa
  IF (
    SELECT pg_catalog.count(*)
    FROM public.products p
    WHERE p.id = ANY(v_sorted_product_ids)
      AND p.company_id = p_company_id
  ) <> v_num_items THEN
    RAISE EXCEPTION 'Uno o más productos del detalle no pertenecen a esta empresa o no existen.';
  END IF;

  -- 6.2. Validación individual de cada ítem (producto activo, cantidades, costos y unidades indivisibles)
  FOR v_item IN
    SELECT (x.value->>'product_id')::UUID AS product_id,
           (x.value->>'quantity')::NUMERIC AS quantity,
           (x.value->>'unit_cost')::NUMERIC AS unit_cost,
           NULLIF(x.value->>'expires_on', '')::DATE AS expires_on,
           private.clean_lot_code(x.value->>'lot_code') AS lot_code,
           pr.tracks_expiry
    FROM pg_catalog.jsonb_array_elements(p_items) AS x
    JOIN public.products pr ON pr.company_id = p_company_id AND pr.id = (x.value->>'product_id')::UUID
  LOOP
    IF v_item.quantity IS NULL OR v_item.quantity <= 0.00 THEN
      RAISE EXCEPTION 'La cantidad debe ser mayor a 0 para cada producto de la compra.';
    END IF;

    IF pg_catalog.scale(v_item.quantity) > 2 THEN
      RAISE EXCEPTION 'La cantidad no puede tener más de 2 decimales.';
    END IF;

    IF v_item.unit_cost IS NULL OR v_item.unit_cost < 0.00 THEN
      RAISE EXCEPTION 'El costo unitario no puede ser negativo.';
    END IF;

    IF pg_catalog.scale(v_item.unit_cost) > 2 THEN
      RAISE EXCEPTION 'El costo unitario no puede tener más de 2 decimales.';
    END IF;

    SELECT id, name, unit, is_active INTO v_prod
    FROM public.products
    WHERE id = v_item.product_id AND company_id = p_company_id;

    IF NOT v_prod.is_active THEN
      RAISE EXCEPTION 'El producto "%" está inactivo y no puede ser comprado.', v_prod.name;
    END IF;

    -- Validación de indivisibilidad de unidades continuas vs enteras
    IF v_prod.unit IN ('unidad', 'bulto', 'par') AND v_item.quantity <> pg_catalog.round(v_item.quantity, 0) THEN
      RAISE EXCEPTION 'La unidad % es indivisible y no admite cantidades fraccionarias: %', v_prod.unit, v_item.quantity;
    END IF;

    IF v_item.tracks_expiry AND v_item.expires_on IS NULL THEN
      RAISE EXCEPTION 'Indicá la fecha de vencimiento de "%".', v_prod.name;
    END IF;

    v_subtotal := v_subtotal + pg_catalog.round(v_item.quantity * v_item.unit_cost, 2);
  END LOOP;

  v_total_amount := v_subtotal;

  -- 7. Numeración Correlativa Interna Segura (company_counters FOR UPDATE)
  SELECT last_value + 1 INTO v_next_counter
  FROM public.company_counters
  WHERE company_id = p_company_id AND kind = 'purchase'
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.company_counters (company_id, kind, last_value)
    VALUES (p_company_id, 'purchase', 1)
    ON CONFLICT (company_id, kind) DO UPDATE
      SET last_value = public.company_counters.last_value + 1,
          updated_at = pg_catalog.now()
    RETURNING last_value INTO v_next_counter;
  ELSE
    UPDATE public.company_counters
    SET last_value = v_next_counter,
        updated_at = pg_catalog.now()
    WHERE company_id = p_company_id AND kind = 'purchase';
  END IF;

  v_purchase_number := 'COM-' || pg_catalog.lpad(v_next_counter::text, 8, '0');

  -- 8. Inserción de la Cabecera de Compra
  INSERT INTO public.purchases (
    company_id,
    purchase_number,
    supplier_id,
    invoice_number,
    purchase_date,
    status,
    subtotal,
    total_amount,
    notes,
    created_by,
    created_at
  ) VALUES (
    p_company_id,
    v_purchase_number,
    p_supplier_id,
    v_clean_invoice,
    v_effective_date,
    'completed',
    v_subtotal,
    v_total_amount,
    p_notes,
    v_user_id,
    pg_catalog.now()
  ) RETURNING id INTO v_purchase_id;

  -- 9. Inserción de Líneas de Compra, Movimientos, Costos Congelados y Actualización de Reposición
  FOR v_item IN
    SELECT (x.value->>'product_id')::UUID AS product_id,
           (x.value->>'quantity')::NUMERIC AS quantity,
           (x.value->>'unit_cost')::NUMERIC AS unit_cost,
           NULLIF(x.value->>'expires_on', '')::DATE AS expires_on,
           private.clean_lot_code(x.value->>'lot_code') AS lot_code,
           pr.tracks_expiry
    FROM pg_catalog.jsonb_array_elements(p_items) AS x
    JOIN public.products pr ON pr.company_id = p_company_id AND pr.id = (x.value->>'product_id')::UUID
  LOOP
    -- 9.1. Registro en purchase_items (detalle histórico)
    INSERT INTO public.purchase_items (
      company_id,
      purchase_id,
      product_id,
      quantity,
      unit_cost,
      subtotal,
      lot_code,
      expires_on
    ) VALUES (
      p_company_id,
      v_purchase_id,
      v_item.product_id,
      v_item.quantity,
      v_item.unit_cost,
      pg_catalog.round(v_item.quantity * v_item.unit_cost, 2),
      CASE WHEN v_item.tracks_expiry THEN v_item.lot_code END,
      CASE WHEN v_item.tracks_expiry THEN v_item.expires_on END
    );

    -- 9.2. Registro en stock_movements (aumenta stock atómicamente mediante sync_product_stock)
    INSERT INTO public.stock_movements (
      company_id,
      product_id,
      direction,
      reason,
      quantity,
      reference_purchase_id,
      reference_doc,
      notes,
      created_by,
      lot_code,
      expires_on
    ) VALUES (
      p_company_id,
      v_item.product_id,
      'increase',
      'purchase',
      v_item.quantity,
      v_purchase_id,
      COALESCE(v_clean_invoice, v_purchase_number),
      'Compra ' || v_purchase_number,
      v_user_id,
      CASE WHEN v_item.tracks_expiry THEN v_item.lot_code END,
      CASE WHEN v_item.tracks_expiry THEN v_item.expires_on END
    ) RETURNING id INTO v_movement_id;

    -- 9.3. Congelar costo histórico en movement_costs
    INSERT INTO public.movement_costs (
      company_id,
      movement_id,
      unit_cost,
      total_cost
    ) VALUES (
      p_company_id,
      v_movement_id,
      v_item.unit_cost,
      pg_catalog.round(v_item.unit_cost * v_item.quantity, 2)
    );

    -- 9.4. Actualizar costo de reposición actual en product_costs
    INSERT INTO public.product_costs (
      company_id,
      product_id,
      cost_price,
      updated_at,
      updated_by
    ) VALUES (
      p_company_id,
      v_item.product_id,
      v_item.unit_cost,
      pg_catalog.now(),
      v_user_id
    )
    ON CONFLICT (company_id, product_id) DO UPDATE
      SET cost_price = EXCLUDED.cost_price,
          updated_at = EXCLUDED.updated_at,
          updated_by = EXCLUDED.updated_by;
  END LOOP;

  -- 10. Registro en auditoría inmutable
  INSERT INTO public.audit_log (
    company_id,
    table_name,
    record_id,
    action,
    new_data,
    performed_by,
    actor_role
  ) VALUES (
    p_company_id,
    'purchases',
    v_purchase_id::text,
    'INSERT',
    pg_catalog.jsonb_build_object(
      'purchase_number', v_purchase_number,
      'supplier_id', p_supplier_id,
      'invoice_number', v_clean_invoice,
      'purchase_date', v_effective_date,
      'total_amount', v_total_amount,
      'items_count', v_num_items
    ),
    v_user_id,
    'master_admin'
  );

  -- 11. Generar Payload de Respuesta y Asentar en operation_idempotency
  v_response_payload := pg_catalog.jsonb_build_object(
    'success', true,
    'purchase_id', v_purchase_id,
    'purchase_number', v_purchase_number,
    'company_id', p_company_id,
    'supplier_id', p_supplier_id,
    'invoice_number', v_clean_invoice,
    'purchase_date', v_effective_date,
    'subtotal', v_subtotal,
    'total_amount', v_total_amount,
    'status', 'completed',
    'created_at', pg_catalog.now()
  );

  UPDATE public.operation_idempotency
  SET response_payload = v_response_payload,
      updated_at = pg_catalog.now()
  WHERE company_id = p_company_id
    AND created_by = v_user_id
    AND operation_type = 'purchase'
    AND idempotency_key = p_idempotency_key;

  RETURN v_response_payload;
END;
$function$;
