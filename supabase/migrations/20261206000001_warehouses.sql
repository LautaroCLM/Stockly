-- ============================================================================
-- MIGRACIÓN: DEPÓSITOS
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
--
-- Varios lugares de stock en una misma empresa (una sola caja, mismos precios).
-- - Toda empresa tiene un depósito principal ("Principal"); el stock actual queda ahí.
-- - products.current_stock sigue siendo el TOTAL (lo usan informes, avisos y Excel);
--   product_stock guarda el stock de cada depósito. Ambos salen de stock_movements.
-- - Cada movimiento indica su depósito. Lo resuelve un trigger BEFORE INSERT, en este orden:
--     1) el que trae el movimiento (transferencias, conteo);
--     2) anulación / devolución de venta: el depósito de donde salió la venta;
--        anulación de compra: el depósito al que entró la compra;
--     3) el depósito elegido en la PC (cabecera HTTP x-stockly-warehouse, que manda la app);
--     4) el principal.
--   Así no hay que cambiar cada función que mueve stock.
-- - La regla "permite stock negativo" se aplica por depósito.
-- - Transferencias: salida transfer_out + entrada transfer_in; no mueven lotes.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. DEPÓSITOS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (name = pg_catalog.btrim(name) AND pg_catalog.length(name) BETWEEN 1 AND 40),
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_warehouses_company_id UNIQUE (company_id, id),
  CONSTRAINT chk_warehouses_default_active CHECK (NOT is_default OR is_active)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouses_name ON public.warehouses (company_id, pg_catalog.lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouses_default ON public.warehouses (company_id) WHERE is_default;

DROP TRIGGER IF EXISTS tr_audit_warehouses ON public.warehouses;
CREATE TRIGGER tr_audit_warehouses AFTER INSERT OR UPDATE OR DELETE ON public.warehouses
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger('id');

ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouses FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "warehouses_select" ON public.warehouses;
CREATE POLICY "warehouses_select" ON public.warehouses FOR SELECT TO authenticated
  USING (company_id IN (SELECT private.my_accessible_company_ids()));
REVOKE ALL ON public.warehouses FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.warehouses TO authenticated;

-- Principal para las empresas existentes y para cada empresa nueva
INSERT INTO public.warehouses (company_id, name, is_default)
SELECT c.id, 'Principal', true FROM public.companies c
WHERE NOT EXISTS (SELECT 1 FROM public.warehouses w WHERE w.company_id = c.id);

CREATE OR REPLACE FUNCTION public.create_default_warehouse()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.warehouses (company_id, name, is_default) VALUES (NEW.id, 'Principal', true);
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.create_default_warehouse() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS tr_companies_default_warehouse ON public.companies;
CREATE TRIGGER tr_companies_default_warehouse AFTER INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.create_default_warehouse();

CREATE OR REPLACE FUNCTION private.default_warehouse(p_company_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT w.id FROM public.warehouses w WHERE w.company_id = p_company_id AND w.is_default;
$$;
REVOKE ALL ON FUNCTION private.default_warehouse(UUID) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. STOCK POR DEPÓSITO
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_stock (
  company_id UUID NOT NULL,
  product_id UUID NOT NULL,
  warehouse_id UUID NOT NULL,
  quantity NUMERIC(12, 2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, warehouse_id),
  CONSTRAINT fk_product_stock_product FOREIGN KEY (company_id, product_id) REFERENCES public.products(company_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_product_stock_warehouse FOREIGN KEY (company_id, warehouse_id) REFERENCES public.warehouses(company_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_product_stock_warehouse ON public.product_stock (company_id, warehouse_id);

ALTER TABLE public.product_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_stock FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "product_stock_select" ON public.product_stock;
CREATE POLICY "product_stock_select" ON public.product_stock FOR SELECT TO authenticated
  USING (company_id IN (SELECT private.my_accessible_company_ids()));
REVOKE ALL ON public.product_stock FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.product_stock TO authenticated;

INSERT INTO public.product_stock (company_id, product_id, warehouse_id, quantity)
SELECT p.company_id, p.id, private.default_warehouse(p.company_id), p.current_stock
FROM public.products p
WHERE p.current_stock <> 0
ON CONFLICT (product_id, warehouse_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. DEPÓSITO EN CADA MOVIMIENTO (los existentes quedan en el principal)
-- ----------------------------------------------------------------------------
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS warehouse_id UUID;
ALTER TABLE public.stock_movements DISABLE TRIGGER tr_protect_stock_movements_immutable;
UPDATE public.stock_movements m SET warehouse_id = private.default_warehouse(m.company_id) WHERE m.warehouse_id IS NULL;
ALTER TABLE public.stock_movements ENABLE TRIGGER tr_protect_stock_movements_immutable;
ALTER TABLE public.stock_movements ALTER COLUMN warehouse_id SET NOT NULL;
ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS fk_stock_movements_warehouse;
ALTER TABLE public.stock_movements ADD CONSTRAINT fk_stock_movements_warehouse FOREIGN KEY (company_id, warehouse_id)
  REFERENCES public.warehouses(company_id, id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_stock_movements_warehouse ON public.stock_movements (company_id, warehouse_id, created_at);

ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS chk_stock_movements_reason;
ALTER TABLE public.stock_movements ADD CONSTRAINT chk_stock_movements_reason CHECK (reason = ANY (ARRAY[
  'initial_load', 'purchase', 'physical_count', 'loss_damage', 'internal_use', 'sale', 'cancellation',
  'purchase_cancellation', 'import', 'sale_return', 'transfer_in', 'transfer_out'
]));
ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS chk_stock_movements_dir_reason;
ALTER TABLE public.stock_movements ADD CONSTRAINT chk_stock_movements_dir_reason CHECK (
  (direction = 'increase' AND reason = ANY (ARRAY['initial_load', 'purchase', 'physical_count', 'cancellation', 'import', 'sale_return', 'transfer_in']))
  OR (direction = 'decrease' AND reason = ANY (ARRAY['sale', 'loss_damage', 'internal_use', 'physical_count', 'purchase_cancellation', 'transfer_out']))
);

-- Depósito elegido en la PC (cabecera de la app). Inválido = error: mejor frenar que mover el stock equivocado.
CREATE OR REPLACE FUNCTION private.request_warehouse(p_company_id UUID)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_text TEXT;
  v_id UUID;
BEGIN
  BEGIN
    v_text := NULLIF(pg_catalog.current_setting('request.headers', true), '')::JSON ->> 'x-stockly-warehouse';
  EXCEPTION WHEN OTHERS THEN
    v_text := NULL;
  END;
  IF v_text IS NULL OR v_text = '' THEN
    RETURN private.default_warehouse(p_company_id);
  END IF;
  SELECT w.id INTO v_id FROM public.warehouses w
  WHERE w.company_id = p_company_id AND w.id::TEXT = v_text AND w.is_active;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'El depósito elegido en esta PC no existe o está desactivado. Elegí otro en el encabezado.';
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION private.request_warehouse(UUID) FROM PUBLIC, anon, authenticated;

-- 3.1. BEFORE INSERT (corre antes que tr_sync_stock_movements por orden alfabético)
CREATE OR REPLACE FUNCTION public.resolve_movement_warehouse()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.warehouse_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.warehouses w WHERE w.company_id = NEW.company_id AND w.id = NEW.warehouse_id) THEN
      RAISE EXCEPTION 'El depósito no existe o no pertenece a esta empresa.';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.reason IN ('cancellation', 'sale_return') AND NEW.reference_sale_id IS NOT NULL THEN
    SELECT m.warehouse_id INTO NEW.warehouse_id FROM public.stock_movements m
    WHERE m.company_id = NEW.company_id AND m.reference_sale_id = NEW.reference_sale_id
      AND m.product_id = NEW.product_id AND m.reason = 'sale'
    ORDER BY m.created_at LIMIT 1;
  ELSIF NEW.reason = 'purchase_cancellation' AND NEW.reference_purchase_id IS NOT NULL THEN
    SELECT m.warehouse_id INTO NEW.warehouse_id FROM public.stock_movements m
    WHERE m.company_id = NEW.company_id AND m.reference_purchase_id = NEW.reference_purchase_id
      AND m.product_id = NEW.product_id AND m.reason = 'purchase'
    ORDER BY m.created_at LIMIT 1;
  END IF;

  IF NEW.warehouse_id IS NULL THEN
    NEW.warehouse_id := private.request_warehouse(NEW.company_id);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_movement_warehouse() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS tr_a_resolve_movement_warehouse ON public.stock_movements;
CREATE TRIGGER tr_a_resolve_movement_warehouse BEFORE INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.resolve_movement_warehouse();

-- 3.2. AFTER INSERT: stock del depósito y stock negativo por depósito
CREATE OR REPLACE FUNCTION public.apply_warehouse_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_qty NUMERIC(12, 2);
  v_allow_negative BOOLEAN;
  v_name TEXT;
  v_product TEXT;
BEGIN
  INSERT INTO public.product_stock (company_id, product_id, warehouse_id, quantity)
  VALUES (NEW.company_id, NEW.product_id, NEW.warehouse_id,
          CASE WHEN NEW.direction = 'increase' THEN NEW.quantity ELSE -NEW.quantity END)
  ON CONFLICT (product_id, warehouse_id) DO UPDATE
    SET quantity = public.product_stock.quantity + EXCLUDED.quantity, updated_at = pg_catalog.now()
  RETURNING quantity INTO v_qty;

  IF NEW.direction = 'decrease' AND v_qty < 0 THEN
    SELECT allow_negative_stock INTO v_allow_negative FROM public.companies WHERE id = NEW.company_id;
    IF NOT COALESCE(v_allow_negative, false) THEN
      SELECT w.name INTO v_name FROM public.warehouses w WHERE w.id = NEW.warehouse_id;
      SELECT p.name INTO v_product FROM public.products p WHERE p.id = NEW.product_id;
      RAISE EXCEPTION 'Stock insuficiente de "%" en el depósito %: hay %, se piden %.',
        v_product, v_name, v_qty + NEW.quantity, NEW.quantity;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_warehouse_stock() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS tr_apply_warehouse_stock ON public.stock_movements;
CREATE TRIGGER tr_apply_warehouse_stock AFTER INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.apply_warehouse_stock();

-- Cantidad de un producto en un depósito
CREATE OR REPLACE FUNCTION private.warehouse_qty(p_company_id UUID, p_product_id UUID, p_warehouse_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((SELECT ps.quantity FROM public.product_stock ps
    WHERE ps.company_id = p_company_id AND ps.product_id = p_product_id AND ps.warehouse_id = p_warehouse_id), 0);
$$;
REVOKE ALL ON FUNCTION private.warehouse_qty(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. LOTES: las transferencias no los mueven (misma función, con una salida temprana)
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
  -- Las transferencias entre depósitos no cambian los lotes (son de toda la empresa)
  IF NEW.reason IN ('transfer_in', 'transfer_out') THEN
    RETURN NULL;
  END IF;

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

-- ----------------------------------------------------------------------------
-- 5. CONTEO FÍSICO: se cuenta el depósito de la PC; la diferencia es contra ese depósito
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_physical_count(p_company_id uuid, p_idempotency_key uuid, p_product_id uuid, p_counted_quantity numeric, p_notes text DEFAULT NULL::text, p_reference_doc text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_company_active BOOLEAN;
  v_clean_notes TEXT := NULLIF(pg_catalog.btrim(p_notes), '');
  v_clean_ref TEXT := NULLIF(pg_catalog.btrim(p_reference_doc), '');
  v_canonical_json JSONB;
  v_request_hash TEXT;
  v_attempts INT := 0;
  v_rec RECORD;
  v_current_stock NUMERIC(12, 2);
  v_unit TEXT;
  v_delta NUMERIC(12, 2);
  v_direction TEXT;
  v_unit_cost NUMERIC;
  v_total_cost NUMERIC;
  v_movement_id UUID;
  v_response_payload JSONB;
  v_warehouse UUID;
BEGIN
  -- 1. Autenticación, parámetros y autorización con bloqueo de empresa
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;

  IF p_company_id IS NULL OR p_idempotency_key IS NULL OR p_product_id IS NULL OR p_counted_quantity IS NULL THEN
    RAISE EXCEPTION 'Parámetros obligatorios incompletos para el conteo físico.';
  END IF;

  PERFORM private.assert_module_access(p_company_id, ARRAY['productos'], 'operate');

  SELECT is_active INTO v_company_active
  FROM public.companies
  WHERE id = p_company_id
  FOR NO KEY UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Empresa con ID % no encontrada.', p_company_id;
  END IF;

  IF NOT v_company_active THEN
    RAISE EXCEPTION 'La empresa se encuentra inactiva. No se admiten operaciones.';
  END IF;

  -- Revalidación tras el bloqueo: una baja concurrente confirmada se detecta aquí
  PERFORM private.assert_module_access(p_company_id, ARRAY['productos'], 'operate');

  -- 2. Validación del valor contado
  IF pg_catalog.scale(p_counted_quantity) > 2 THEN
    RAISE EXCEPTION 'La cantidad contada excede los 2 decimales permitidos: %', p_counted_quantity;
  END IF;

  IF p_counted_quantity < 0 OR p_counted_quantity > 999999999.99 THEN
    RAISE EXCEPTION 'Cantidad contada fuera de rango permitido (0 <= cantidad <= 999.999.999,99): %', p_counted_quantity;
  END IF;

  -- 2.1. Se cuenta el depósito de la PC
  v_warehouse := private.request_warehouse(p_company_id);

  -- 3. Hash canónico de la petición
  v_canonical_json := pg_catalog.jsonb_build_object(
    'warehouse_id', v_warehouse,
    'company_id', p_company_id,
    'operation_type', 'physical_count',
    'product_id', p_product_id,
    'counted_quantity', pg_catalog.to_char(p_counted_quantity, 'FM999999999990.00'),
    'notes', v_clean_notes,
    'reference_doc', v_clean_ref
  );

  v_request_hash := pg_catalog.encode(
    extensions.digest(v_canonical_json::TEXT, 'sha256'),
    'hex'
  );

  -- 4. Candado de idempotencia (alcance por created_by, TTL 24 h)
  LOOP
    v_attempts := v_attempts + 1;
    IF v_attempts > 3 THEN
      RAISE EXCEPTION 'No se pudo adquirir el candado de idempotencia tras 3 reintentos por contención concurrente.';
    END IF;

    INSERT INTO public.operation_idempotency (
      company_id, operation_type, idempotency_key, request_hash, response_payload,
      created_by, created_at, updated_at, expires_at
    ) VALUES (
      p_company_id, 'stock_adjustment', p_idempotency_key, v_request_hash, NULL,
      v_user_id, pg_catalog.now(), pg_catalog.now(), pg_catalog.now() + interval '24 hours'
    )
    ON CONFLICT (company_id, created_by, operation_type, idempotency_key) DO NOTHING;

    IF FOUND THEN
      EXIT;
    END IF;

    SELECT id, request_hash, response_payload, expires_at INTO v_rec
    FROM public.operation_idempotency
    WHERE company_id = p_company_id
      AND created_by = v_user_id
      AND operation_type = 'stock_adjustment'
      AND idempotency_key = p_idempotency_key
    FOR UPDATE;

    IF FOUND THEN
      IF v_rec.expires_at <= pg_catalog.now() THEN
        DELETE FROM public.operation_idempotency WHERE id = v_rec.id;
        CONTINUE;
      END IF;

      IF v_rec.request_hash != v_request_hash THEN
        RAISE EXCEPTION 'Idempotency key mismatch: clave reutilizada con distintos parámetros.';
      END IF;

      IF v_rec.response_payload IS NULL THEN
        RAISE EXCEPTION 'Estado inconsistente de idempotencia: operación previa confirmada sin payload.';
      END IF;

      RETURN v_rec.response_payload;
    END IF;
  END LOOP;

  -- 5. Bloqueo del producto y diferencia contra el stock vigente
  SELECT current_stock, unit INTO v_current_stock, v_unit
  FROM public.products
  WHERE company_id = p_company_id AND id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto % no encontrado en la empresa.', p_product_id;
  END IF;

  IF v_unit IN ('unidad', 'bulto', 'par') AND p_counted_quantity != pg_catalog.round(p_counted_quantity, 0) THEN
    RAISE EXCEPTION 'La unidad % es indivisible y no admite cantidades fraccionarias: %', v_unit, p_counted_quantity;
  END IF;

  v_current_stock := private.warehouse_qty(p_company_id, p_product_id, v_warehouse);
  v_delta := p_counted_quantity - v_current_stock;

  IF v_delta <> 0 THEN
    v_direction := CASE WHEN v_delta > 0 THEN 'increase' ELSE 'decrease' END;

    SELECT cost_price INTO v_unit_cost
    FROM public.product_costs
    WHERE company_id = p_company_id AND product_id = p_product_id;

    v_unit_cost := COALESCE(v_unit_cost, 0.00);
    v_total_cost := pg_catalog.round(pg_catalog.abs(v_delta) * v_unit_cost, 2);

    -- El trigger tr_sync_stock_movements recalcula saldos y actualiza products.current_stock
    INSERT INTO public.stock_movements (
      company_id, product_id, direction, reason, quantity, notes, reference_doc, created_by, warehouse_id
    ) VALUES (
      p_company_id, p_product_id, v_direction, 'physical_count', pg_catalog.abs(v_delta),
      v_clean_notes, v_clean_ref, v_user_id, v_warehouse
    ) RETURNING id INTO v_movement_id;

    INSERT INTO public.movement_costs (company_id, movement_id, unit_cost, total_cost)
    VALUES (p_company_id, v_movement_id, v_unit_cost, v_total_cost);
  END IF;

  -- 6. Payload final (sin movimiento cuando el conteo coincide con el stock vigente)
  v_response_payload := pg_catalog.jsonb_build_object(
    'movement_id', v_movement_id,
    'product_id', p_product_id,
    'warehouse_id', v_warehouse,
    'counted_quantity', p_counted_quantity,
    'direction', v_direction,
    'quantity', pg_catalog.abs(v_delta),
    'previous_stock', v_current_stock,
    'new_stock', p_counted_quantity,
    'no_change', v_delta = 0,
    'created_at', pg_catalog.now()
  );

  UPDATE public.operation_idempotency
  SET response_payload = v_response_payload,
      updated_at = pg_catalog.now()
  WHERE company_id = p_company_id
    AND created_by = v_user_id
    AND operation_type = 'stock_adjustment'
    AND idempotency_key = p_idempotency_key;

  RETURN v_response_payload;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 6. ALTA, EDICIÓN Y PRINCIPAL (Master Admin)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_warehouse(p_company_id UUID, p_warehouse_id UUID, p_name TEXT, p_is_active BOOLEAN)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_name TEXT := pg_catalog.btrim(COALESCE(p_name, ''));
  v_id UUID;
  v_row RECORD;
BEGIN
  IF NOT private.has_company_role(p_company_id, 'master_admin') THEN
    RAISE EXCEPTION 'Solo el Master Admin puede administrar los depósitos.';
  END IF;
  IF v_name = '' OR pg_catalog.length(v_name) > 40 THEN
    RAISE EXCEPTION 'El nombre del depósito es obligatorio (hasta 40 caracteres).';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.warehouses w
    WHERE w.company_id = p_company_id AND pg_catalog.lower(w.name) = pg_catalog.lower(v_name)
      AND w.id IS DISTINCT FROM p_warehouse_id
  ) THEN
    RAISE EXCEPTION 'Ya existe un depósito llamado "%".', v_name;
  END IF;

  IF p_warehouse_id IS NULL THEN
    INSERT INTO public.warehouses (company_id, name, is_active) VALUES (p_company_id, v_name, COALESCE(p_is_active, true))
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  SELECT w.* INTO v_row FROM public.warehouses w WHERE w.company_id = p_company_id AND w.id = p_warehouse_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El depósito no existe o no pertenece a esta empresa.';
  END IF;
  IF NOT COALESCE(p_is_active, true) AND v_row.is_active THEN
    IF v_row.is_default THEN
      RAISE EXCEPTION 'No se puede desactivar el depósito principal: elegí otro como principal antes.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.product_stock ps WHERE ps.warehouse_id = p_warehouse_id AND ps.quantity <> 0) THEN
      RAISE EXCEPTION 'El depósito "%" todavía tiene stock: transferilo a otro depósito antes de desactivarlo.', v_row.name;
    END IF;
  END IF;
  UPDATE public.warehouses SET name = v_name, is_active = COALESCE(p_is_active, true), updated_at = pg_catalog.now()
  WHERE id = p_warehouse_id;
  RETURN p_warehouse_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_default_warehouse(p_company_id UUID, p_warehouse_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.has_company_role(p_company_id, 'master_admin') THEN
    RAISE EXCEPTION 'Solo el Master Admin puede administrar los depósitos.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.warehouses w WHERE w.company_id = p_company_id AND w.id = p_warehouse_id AND w.is_active) THEN
    RAISE EXCEPTION 'El depósito no existe o está desactivado.';
  END IF;
  UPDATE public.warehouses SET is_default = false, updated_at = pg_catalog.now()
  WHERE company_id = p_company_id AND is_default AND id <> p_warehouse_id;
  UPDATE public.warehouses SET is_default = true, updated_at = pg_catalog.now()
  WHERE company_id = p_company_id AND id = p_warehouse_id AND NOT is_default;
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. TRANSFERENCIAS
-- ----------------------------------------------------------------------------
ALTER TABLE public.company_counters DROP CONSTRAINT IF EXISTS company_counters_kind_check;
ALTER TABLE public.company_counters ADD CONSTRAINT company_counters_kind_check
  CHECK (kind = ANY (ARRAY['sale', 'purchase', 'sale_return', 'stock_transfer']));

CREATE TABLE IF NOT EXISTS public.stock_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  transfer_number TEXT NOT NULL,
  from_warehouse_id UUID NOT NULL,
  to_warehouse_id UUID NOT NULL,
  notes TEXT CHECK (notes IS NULL OR pg_catalog.length(notes) <= 500),
  idempotency_key UUID NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_stock_transfers_company_id UNIQUE (company_id, id),
  CONSTRAINT uq_stock_transfers_number UNIQUE (company_id, transfer_number),
  CONSTRAINT uq_stock_transfers_idempotency UNIQUE (company_id, idempotency_key),
  CONSTRAINT chk_stock_transfers_different CHECK (from_warehouse_id <> to_warehouse_id),
  CONSTRAINT fk_stock_transfers_from FOREIGN KEY (company_id, from_warehouse_id) REFERENCES public.warehouses(company_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_stock_transfers_to FOREIGN KEY (company_id, to_warehouse_id) REFERENCES public.warehouses(company_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_company ON public.stock_transfers (company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.stock_transfer_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  transfer_id UUID NOT NULL,
  product_id UUID NOT NULL,
  quantity NUMERIC(12, 2) NOT NULL CHECK (quantity > 0),
  CONSTRAINT fk_transfer_items_transfer FOREIGN KEY (company_id, transfer_id) REFERENCES public.stock_transfers(company_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_transfer_items_product FOREIGN KEY (company_id, product_id) REFERENCES public.products(company_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_transfer_items_transfer ON public.stock_transfer_items (company_id, transfer_id);

ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfer_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfer_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stock_transfers_select" ON public.stock_transfers;
CREATE POLICY "stock_transfers_select" ON public.stock_transfers FOR SELECT TO authenticated
  USING (company_id IN (SELECT private.my_accessible_company_ids()));
DROP POLICY IF EXISTS "stock_transfer_items_select" ON public.stock_transfer_items;
CREATE POLICY "stock_transfer_items_select" ON public.stock_transfer_items FOR SELECT TO authenticated
  USING (company_id IN (SELECT private.my_accessible_company_ids()));
REVOKE ALL ON public.stock_transfers, public.stock_transfer_items FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.stock_transfers, public.stock_transfer_items TO authenticated;

CREATE OR REPLACE FUNCTION public.create_stock_transfer(
  p_company_id UUID, p_idempotency_key UUID, p_from UUID, p_to UUID, p_items JSONB, p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_existing RECORD;
  v_lines INT;
  v_distinct INT;
  v_item RECORD;
  v_counter BIGINT;
  v_number TEXT;
  v_transfer_id UUID;
  v_movement_id UUID;
  v_cost NUMERIC(14, 2);
  v_label TEXT;
  v_notes TEXT := NULLIF(pg_catalog.btrim(p_notes), '');
BEGIN
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Falta la clave de la operación.';
  END IF;
  PERFORM private.assert_module_access(p_company_id, ARRAY['productos'], 'operate');
  PERFORM 1 FROM public.companies WHERE id = p_company_id FOR NO KEY UPDATE;

  SELECT id, transfer_number INTO v_existing FROM public.stock_transfers
  WHERE company_id = p_company_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN pg_catalog.jsonb_build_object('transfer_id', v_existing.id, 'transfer_number', v_existing.transfer_number, 'already_registered', true);
  END IF;

  IF p_from IS NULL OR p_to IS NULL OR p_from = p_to THEN
    RAISE EXCEPTION 'Elegí dos depósitos distintos.';
  END IF;
  IF (SELECT pg_catalog.count(*) FROM public.warehouses w WHERE w.company_id = p_company_id AND w.id IN (p_from, p_to) AND w.is_active) <> 2 THEN
    RAISE EXCEPTION 'Los depósitos no existen, no son de esta empresa o están desactivados.';
  END IF;
  IF v_notes IS NOT NULL AND pg_catalog.length(v_notes) > 500 THEN
    RAISE EXCEPTION 'La nota no puede superar los 500 caracteres.';
  END IF;
  IF p_items IS NULL OR pg_catalog.jsonb_typeof(p_items) <> 'array' OR pg_catalog.jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Agregá al menos un producto a la transferencia.';
  END IF;
  SELECT pg_catalog.count(*), pg_catalog.count(DISTINCT x.value ->> 'product_id') INTO v_lines, v_distinct
  FROM pg_catalog.jsonb_array_elements(p_items) x;
  IF v_lines <> v_distinct THEN
    RAISE EXCEPTION 'Hay productos repetidos en la transferencia.';
  END IF;

  -- Productos bloqueados en orden canónico, como en ventas y compras
  PERFORM 1 FROM public.products pr
  WHERE pr.company_id = p_company_id
    AND pr.id IN (SELECT (x.value ->> 'product_id')::UUID FROM pg_catalog.jsonb_array_elements(p_items) x)
  ORDER BY pr.id FOR UPDATE;

  INSERT INTO public.company_counters (company_id, kind, last_value)
  VALUES (p_company_id, 'stock_transfer', 1)
  ON CONFLICT (company_id, kind) DO UPDATE SET last_value = public.company_counters.last_value + 1, updated_at = pg_catalog.now()
  RETURNING last_value INTO v_counter;
  v_number := 'TRF-' || pg_catalog.lpad(v_counter::TEXT, 8, '0');
  v_label := 'Transferencia ' || v_number;

  INSERT INTO public.stock_transfers (company_id, transfer_number, from_warehouse_id, to_warehouse_id, notes, idempotency_key, created_by)
  VALUES (p_company_id, v_number, p_from, p_to, v_notes, p_idempotency_key, v_user)
  RETURNING id INTO v_transfer_id;

  FOR v_item IN
    SELECT (x.value ->> 'product_id')::UUID AS product_id, (x.value ->> 'quantity')::NUMERIC AS quantity, pr.name, pr.unit, pr.is_active
    FROM pg_catalog.jsonb_array_elements(p_items) x
    LEFT JOIN public.products pr ON pr.company_id = p_company_id AND pr.id = (x.value ->> 'product_id')::UUID
  LOOP
    IF v_item.name IS NULL THEN
      RAISE EXCEPTION 'Uno de los productos no existe o no pertenece a esta empresa.';
    END IF;
    IF v_item.quantity IS NULL OR v_item.quantity <= 0 OR pg_catalog.scale(v_item.quantity) > 2 THEN
      RAISE EXCEPTION 'La cantidad de "%" tiene que ser mayor a 0, con hasta 2 decimales.', v_item.name;
    END IF;
    IF v_item.unit IN ('unidad', 'bulto', 'par') AND v_item.quantity <> pg_catalog.round(v_item.quantity, 0) THEN
      RAISE EXCEPTION '"%" se mide en % y no admite cantidades fraccionarias.', v_item.name, v_item.unit;
    END IF;

    INSERT INTO public.stock_transfer_items (company_id, transfer_id, product_id, quantity)
    VALUES (p_company_id, v_transfer_id, v_item.product_id, v_item.quantity);

    SELECT COALESCE(pc.cost_price, 0) INTO v_cost FROM public.product_costs pc
    WHERE pc.company_id = p_company_id AND pc.product_id = v_item.product_id;
    v_cost := COALESCE(v_cost, 0);

    INSERT INTO public.stock_movements (company_id, product_id, direction, reason, quantity, reference_doc, notes, created_by, warehouse_id)
    VALUES (p_company_id, v_item.product_id, 'decrease', 'transfer_out', v_item.quantity, v_number, v_label, v_user, p_from)
    RETURNING id INTO v_movement_id;
    INSERT INTO public.movement_costs (company_id, movement_id, unit_cost, total_cost)
    VALUES (p_company_id, v_movement_id, v_cost, pg_catalog.round(v_cost * v_item.quantity, 2));

    INSERT INTO public.stock_movements (company_id, product_id, direction, reason, quantity, reference_doc, notes, created_by, warehouse_id)
    VALUES (p_company_id, v_item.product_id, 'increase', 'transfer_in', v_item.quantity, v_number, v_label, v_user, p_to)
    RETURNING id INTO v_movement_id;
    INSERT INTO public.movement_costs (company_id, movement_id, unit_cost, total_cost)
    VALUES (p_company_id, v_movement_id, v_cost, pg_catalog.round(v_cost * v_item.quantity, 2));
  END LOOP;

  RETURN pg_catalog.jsonb_build_object('transfer_id', v_transfer_id, 'transfer_number', v_number, 'already_registered', false);
END;
$$;

REVOKE ALL ON FUNCTION public.save_warehouse(UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_default_warehouse(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_stock_transfer(UUID, UUID, UUID, UUID, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_warehouse(UUID, UUID, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_default_warehouse(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_stock_transfer(UUID, UUID, UUID, UUID, JSONB, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 8. PRODUCTO CREADO CON STOCK DIRECTO (sin movimiento): ese stock queda en el principal
--    La app siempre crea con 0 y después mueve; esto mantiene la regla
--    "suma por depósito = total" también para cargas hechas por SQL.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_product_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.current_stock <> 0 THEN
    INSERT INTO public.product_stock (company_id, product_id, warehouse_id, quantity)
    VALUES (NEW.company_id, NEW.id, private.default_warehouse(NEW.company_id), NEW.current_stock)
    ON CONFLICT (product_id, warehouse_id) DO NOTHING;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.seed_product_stock() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS tr_products_seed_stock ON public.products;
CREATE TRIGGER tr_products_seed_stock AFTER INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.seed_product_stock();

-- ----------------------------------------------------------------------------
-- 9. TIEMPO REAL: depósitos y transferencias (el stock ya avisa por stock_movements)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['warehouses', 'stock_transfers'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = v_table
    ) THEN
      EXECUTE pg_catalog.format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
    END IF;
  END LOOP;
END
$$;
