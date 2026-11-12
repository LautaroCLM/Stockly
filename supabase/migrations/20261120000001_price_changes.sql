-- ============================================================================
-- MIGRACIÓN: CAMBIO DE PRECIOS MASIVO
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
--
-- Sube o baja el precio de venta de muchos productos por porcentaje, con filtro
-- por categoría y proveedor, redondeo y vista previa. Cada aplicación queda como
-- un "lote" con los precios anteriores, y se puede revertir completa.
--   * Solo cambia selling_price (el costo no se toca). Ventas y documentos ya
--     emitidos guardan su precio y no cambian.
--   * El cálculo vive en una sola función: la vista previa y la aplicación
--     dan exactamente el mismo resultado.
--   * Aplicar es todo o nada y es idempotente por el id del lote (doble clic seguro).
-- Acceso: módulo 'precios' (empleado: sin acceso por defecto; el admin siempre opera).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. NUEVO MÓDULO DE PERMISOS
-- ----------------------------------------------------------------------------
ALTER TABLE public.company_module_permissions DROP CONSTRAINT IF EXISTS company_module_permissions_module_check;
ALTER TABLE public.company_module_permissions ADD CONSTRAINT company_module_permissions_module_check CHECK (module IN (
  'compras', 'finanzas', 'gastos', 'cobros_pagos', 'informes', 'maquinas', 'personal', 'fichaje',
  'productos', 'caja', 'clientes', 'proveedores', 'anular_ventas', 'documentos', 'precios'
));

-- ----------------------------------------------------------------------------
-- 2. LOTES DE CAMBIO Y SUS RENGLONES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.price_change_batches (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  percent NUMERIC(7, 2) NOT NULL CHECK (percent BETWEEN -90 AND 1000 AND percent <> 0),
  rounding_step NUMERIC(6, 2) NOT NULL CHECK (rounding_step IN (0.01, 1, 10, 50, 100)),
  category_ids UUID[] NOT NULL DEFAULT '{}',
  supplier_ids UUID[] NOT NULL DEFAULT '{}',
  note TEXT CHECK (note IS NULL OR pg_catalog.length(note) <= 200),
  items_count INTEGER NOT NULL CHECK (items_count > 0),
  status TEXT NOT NULL DEFAULT 'applied' CHECK (status IN ('applied', 'reverted')),
  reverted_items INTEGER CHECK (reverted_items IS NULL OR reverted_items > 0),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reverted_by UUID REFERENCES auth.users(id),
  reverted_at TIMESTAMPTZ,
  CONSTRAINT uq_price_change_batches_company_id UNIQUE (company_id, id),
  CONSTRAINT chk_price_change_batches_revert CHECK (
    (status = 'applied' AND reverted_by IS NULL AND reverted_at IS NULL AND reverted_items IS NULL) OR
    (status = 'reverted' AND reverted_by IS NOT NULL AND reverted_at IS NOT NULL AND reverted_items IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS price_change_batches_company_idx
  ON public.price_change_batches (company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.price_change_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  batch_id UUID NOT NULL,
  product_id UUID NOT NULL,
  old_price NUMERIC(14, 2) NOT NULL CHECK (old_price >= 0),
  new_price NUMERIC(14, 2) NOT NULL CHECK (new_price >= 0),
  CONSTRAINT fk_price_change_items_batch FOREIGN KEY (company_id, batch_id)
    REFERENCES public.price_change_batches(company_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_price_change_items_product FOREIGN KEY (company_id, product_id)
    REFERENCES public.products(company_id, id) ON DELETE RESTRICT,
  CONSTRAINT uq_price_change_items_product UNIQUE (batch_id, product_id)
);

CREATE INDEX IF NOT EXISTS price_change_items_batch_idx
  ON public.price_change_items (company_id, batch_id);
CREATE INDEX IF NOT EXISTS price_change_items_product_idx
  ON public.price_change_items (company_id, product_id);

DROP TRIGGER IF EXISTS tr_audit_price_change_batches ON public.price_change_batches;
CREATE TRIGGER tr_audit_price_change_batches
  AFTER INSERT OR UPDATE OR DELETE ON public.price_change_batches
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger('id');

-- Un lote solo pasa de aplicado a revertido; los renglones no cambian nunca
CREATE OR REPLACE FUNCTION public.guard_price_change_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'El historial de cambios de precios no se puede borrar.';
  END IF;
  IF TG_TABLE_NAME = 'price_change_items' THEN
    RAISE EXCEPTION 'Los renglones de un cambio de precios no se pueden modificar.';
  END IF;
  IF OLD.status = 'reverted' THEN
    RAISE EXCEPTION 'Un cambio ya revertido no se puede modificar.';
  END IF;
  IF NEW.status <> 'reverted'
     OR (to_jsonb(NEW) - 'status' - 'reverted_by' - 'reverted_at' - 'reverted_items')
        IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'reverted_by' - 'reverted_at' - 'reverted_items') THEN
    RAISE EXCEPTION 'Los datos de un cambio de precios no se pueden editar: solo se puede revertir.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_price_change_mutation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tr_price_change_batches_guard ON public.price_change_batches;
CREATE TRIGGER tr_price_change_batches_guard
  BEFORE UPDATE OR DELETE ON public.price_change_batches
  FOR EACH ROW EXECUTE FUNCTION public.guard_price_change_mutation();

DROP TRIGGER IF EXISTS tr_price_change_items_guard ON public.price_change_items;
CREATE TRIGGER tr_price_change_items_guard
  BEFORE UPDATE OR DELETE ON public.price_change_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_price_change_mutation();

-- ----------------------------------------------------------------------------
-- 3. RLS: lectura según el módulo; toda escritura pasa por las funciones
-- ----------------------------------------------------------------------------
ALTER TABLE public.price_change_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_change_batches FORCE ROW LEVEL SECURITY;
ALTER TABLE public.price_change_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_change_items FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "price_change_batches_select" ON public.price_change_batches;
CREATE POLICY "price_change_batches_select"
  ON public.price_change_batches FOR SELECT TO authenticated
  USING (company_id IN (SELECT private.my_active_company_ids()) AND private.has_module_level(company_id, ARRAY['precios'], 'view'));

DROP POLICY IF EXISTS "price_change_items_select" ON public.price_change_items;
CREATE POLICY "price_change_items_select"
  ON public.price_change_items FOR SELECT TO authenticated
  USING (company_id IN (SELECT private.my_active_company_ids()) AND private.has_module_level(company_id, ARRAY['precios'], 'view'));

REVOKE ALL ON public.price_change_batches, public.price_change_items FROM PUBLIC, anon;
GRANT SELECT ON public.price_change_batches, public.price_change_items TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.price_change_batches, public.price_change_items FROM authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'price_change_batches'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.price_change_batches;
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- 4. CÁLCULO ÚNICO: qué productos cambian y a qué precio
--    Solo productos activos con precio mayor a 0. Redondea al múltiplo indicado.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.price_change_rows(
  p_company_id UUID,
  p_percent NUMERIC,
  p_step NUMERIC,
  p_category_ids UUID[],
  p_supplier_ids UUID[]
)
RETURNS TABLE (
  product_id UUID, sku TEXT, name TEXT, category_id UUID, supplier_id UUID,
  old_price NUMERIC, new_price NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_percent IS NULL OR p_percent = 0 OR p_percent < -90 OR p_percent > 1000 THEN
    RAISE EXCEPTION 'El porcentaje debe ser distinto de 0 y estar entre -90 y 1000.';
  END IF;
  IF p_step IS NULL OR p_step NOT IN (0.01, 1, 10, 50, 100) THEN
    RAISE EXCEPTION 'Redondeo inválido.';
  END IF;
  IF pg_catalog.cardinality(COALESCE(p_category_ids, '{}')) > 200
     OR pg_catalog.cardinality(COALESCE(p_supplier_ids, '{}')) > 200 THEN
    RAISE EXCEPTION 'Demasiados filtros seleccionados.';
  END IF;

  RETURN QUERY
  SELECT c.id, c.sku, c.name, c.category_id, c.supplier_id, c.selling_price, c.new_price
  FROM (
    SELECT p.id, p.sku, p.name, p.category_id, p.supplier_id, p.selling_price,
           pg_catalog.round(p.selling_price * (100 + p_percent) / 100 / p_step) * p_step AS new_price
    FROM public.products p
    WHERE p.company_id = p_company_id
      AND p.is_active
      AND p.selling_price > 0
      AND (COALESCE(pg_catalog.cardinality(p_category_ids), 0) = 0 OR p.category_id = ANY (p_category_ids))
      AND (COALESCE(pg_catalog.cardinality(p_supplier_ids), 0) = 0 OR p.supplier_id = ANY (p_supplier_ids))
  ) c
  WHERE c.new_price > 0
    AND c.new_price <= 999999999999.99
    AND c.new_price <> c.selling_price;
END;
$$;

REVOKE ALL ON FUNCTION private.price_change_rows(UUID, NUMERIC, NUMERIC, UUID[], UUID[]) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. VISTA PREVIA (no modifica nada)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.preview_price_change(
  p_company_id UUID,
  p_percent NUMERIC,
  p_step NUMERIC,
  p_category_ids UUID[] DEFAULT NULL,
  p_supplier_ids UUID[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  PERFORM private.assert_module_access(p_company_id, ARRAY['precios'], 'operate');

  RETURN COALESCE((
    SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'productId', r.product_id, 'sku', r.sku, 'name', r.name,
      'categoryId', r.category_id, 'supplierId', r.supplier_id,
      'oldPrice', r.old_price, 'newPrice', r.new_price
    ) ORDER BY r.name, r.sku)
    FROM private.price_change_rows(p_company_id, p_percent, p_step, p_category_ids, p_supplier_ids) r
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.preview_price_change(UUID, NUMERIC, NUMERIC, UUID[], UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_price_change(UUID, NUMERIC, NUMERIC, UUID[], UUID[]) TO authenticated;

-- ----------------------------------------------------------------------------
-- 6. APLICAR (todo o nada, idempotente por id de lote)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_price_change(
  p_company_id UUID,
  p_batch_id UUID,
  p_percent NUMERIC,
  p_step NUMERIC,
  p_category_ids UUID[] DEFAULT NULL,
  p_supplier_ids UUID[] DEFAULT NULL,
  p_excluded_ids UUID[] DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing public.price_change_batches%ROWTYPE;
  v_expected INTEGER;
  v_updated INTEGER;
  v_note TEXT := NULLIF(pg_catalog.btrim(COALESCE(p_note, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  PERFORM private.assert_module_access(p_company_id, ARRAY['precios'], 'operate');

  IF p_batch_id IS NULL THEN
    RAISE EXCEPTION 'Falta el identificador del cambio.';
  END IF;
  IF v_note IS NOT NULL AND pg_catalog.length(v_note) > 200 THEN
    RAISE EXCEPTION 'La nota no puede superar los 200 caracteres.';
  END IF;

  -- Un doble clic o un reintento no vuelve a aplicar el aumento
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_batch_id::TEXT, 0));
  SELECT * INTO v_existing FROM public.price_change_batches WHERE id = p_batch_id;
  IF FOUND THEN
    IF v_existing.company_id <> p_company_id THEN
      RAISE EXCEPTION 'Identificador de cambio inválido.';
    END IF;
    RETURN pg_catalog.jsonb_build_object('batchId', v_existing.id, 'updated', v_existing.items_count, 'duplicate', true);
  END IF;

  SELECT pg_catalog.count(*) INTO v_expected
  FROM private.price_change_rows(p_company_id, p_percent, p_step, p_category_ids, p_supplier_ids) r
  WHERE r.product_id <> ALL (COALESCE(p_excluded_ids, '{}'));

  IF v_expected = 0 THEN
    RAISE EXCEPTION 'No hay productos para modificar con ese filtro.';
  END IF;

  INSERT INTO public.price_change_batches (
    id, company_id, percent, rounding_step, category_ids, supplier_ids, note, items_count, created_by
  ) VALUES (
    p_batch_id, p_company_id, p_percent, p_step, COALESCE(p_category_ids, '{}'), COALESCE(p_supplier_ids, '{}'),
    v_note, v_expected, auth.uid()
  );

  WITH target AS (
    SELECT r.product_id, r.old_price, r.new_price
    FROM private.price_change_rows(p_company_id, p_percent, p_step, p_category_ids, p_supplier_ids) r
    WHERE r.product_id <> ALL (COALESCE(p_excluded_ids, '{}'))
  ), upd AS (
    UPDATE public.products p
    SET selling_price = t.new_price, updated_at = pg_catalog.now()
    FROM target t
    WHERE p.company_id = p_company_id AND p.id = t.product_id AND p.selling_price = t.old_price
    RETURNING p.id AS product_id, t.old_price, t.new_price
  )
  INSERT INTO public.price_change_items (company_id, batch_id, product_id, old_price, new_price)
  SELECT p_company_id, p_batch_id, u.product_id, u.old_price, u.new_price FROM upd u;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> v_expected THEN
    RAISE EXCEPTION 'Los precios cambiaron mientras se aplicaba el ajuste. No se modificó nada: volvé a intentar.';
  END IF;

  RETURN pg_catalog.jsonb_build_object('batchId', p_batch_id, 'updated', v_updated, 'duplicate', false);
END;
$$;

COMMENT ON FUNCTION public.apply_price_change(UUID, UUID, NUMERIC, NUMERIC, UUID[], UUID[], UUID[], TEXT) IS
  'Aplica un cambio porcentual de precios de venta como un lote reversible, todo o nada. Requiere operar el módulo precios.';

REVOKE ALL ON FUNCTION public.apply_price_change(UUID, UUID, NUMERIC, NUMERIC, UUID[], UUID[], UUID[], TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_price_change(UUID, UUID, NUMERIC, NUMERIC, UUID[], UUID[], UUID[], TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. REVERTIR: devuelve el precio anterior solo a los productos que siguen
--    con el precio que dejó el cambio (no pisa ediciones posteriores)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revert_price_change(p_company_id UUID, p_batch_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_batch public.price_change_batches%ROWTYPE;
  v_reverted INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  PERFORM private.assert_module_access(p_company_id, ARRAY['precios'], 'operate');

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_batch_id::TEXT, 0));
  SELECT * INTO v_batch FROM public.price_change_batches WHERE id = p_batch_id AND company_id = p_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró ese cambio de precios.';
  END IF;
  IF v_batch.status = 'reverted' THEN
    RAISE EXCEPTION 'Ese cambio de precios ya fue revertido.';
  END IF;

  UPDATE public.products p
  SET selling_price = i.old_price, updated_at = pg_catalog.now()
  FROM public.price_change_items i
  WHERE i.company_id = p_company_id AND i.batch_id = p_batch_id
    AND p.company_id = p_company_id AND p.id = i.product_id
    AND p.selling_price = i.new_price;
  GET DIAGNOSTICS v_reverted = ROW_COUNT;

  IF v_reverted = 0 THEN
    RAISE EXCEPTION 'Ningún producto conserva el precio de este cambio: ya fueron modificados después.';
  END IF;

  UPDATE public.price_change_batches
  SET status = 'reverted', reverted_by = auth.uid(), reverted_at = pg_catalog.now(), reverted_items = v_reverted
  WHERE id = p_batch_id;

  RETURN pg_catalog.jsonb_build_object('reverted', v_reverted, 'skipped', v_batch.items_count - v_reverted);
END;
$$;

REVOKE ALL ON FUNCTION public.revert_price_change(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revert_price_change(UUID, UUID) TO authenticated;

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
      'productos', 'caja', 'clientes', 'proveedores', 'anular_ventas', 'documentos', 'precios'
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
    'productos', 'caja', 'clientes', 'proveedores', 'anular_ventas', 'documentos', 'precios'
  ]) WITH ORDINALITY AS m(module, ord)
  LEFT JOIN public.company_module_permissions p ON p.company_id = p_company_id AND p.module = m.module
  ORDER BY m.ord;
END;
$function$;
