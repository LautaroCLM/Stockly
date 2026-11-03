-- ============================================================================
-- MIGRACIÓN INCREMENTAL: ANULACIÓN DE VENTAS Y COMPRAS (Hallazgo H-06)
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
-- Problema: sales y purchases tenían estado 'cancelled' y columnas cancelled_*, pero
--           un trigger bloqueaba todo UPDATE y no existía RPC de anulación: un error de
--           cobro o una devolución no se podían corregir de forma trazable.
-- Solución:
--   1. Trigger de guarda: los documentos siguen inmutables, salvo la única transición
--      completed -> cancelled con fecha, autor y motivo. Las líneas siguen intocables.
--   2. Restricción de coherencia entre status y columnas cancelled_*.
--   3. RPC cancel_sale / cancel_purchase (master_admin, motivo obligatorio): revierten el
--      stock con movimientos cancellation / purchase_cancellation al costo congelado del
--      documento original. Repetir la anulación devuelve already_cancelled sin efectos.
-- Orden de bloqueos (igual que process_sale / process_purchase):
--   companies (FOR NO KEY UPDATE) -> documento (FOR UPDATE) -> products (ORDER BY id FOR UPDATE)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TRIGGER DE GUARDA: SOLO SE PERMITE LA TRANSICIÓN A ANULADO
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_document_cancellation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'La tabla % es inmutable: no se permiten eliminaciones.', TG_TABLE_NAME;
  END IF;

  IF OLD.status = 'completed'
     AND NEW.status = 'cancelled'
     AND NEW.cancelled_at IS NOT NULL
     AND NEW.cancelled_by IS NOT NULL
     AND pg_catalog.btrim(COALESCE(NEW.cancel_reason, '')) <> ''
     AND (pg_catalog.to_jsonb(NEW) - 'status' - 'cancelled_at' - 'cancelled_by' - 'cancel_reason')
         = (pg_catalog.to_jsonb(OLD) - 'status' - 'cancelled_at' - 'cancelled_by' - 'cancel_reason')
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'La tabla % es inmutable: solo se admite anular un documento completado.', TG_TABLE_NAME;
END;
$$;

COMMENT ON FUNCTION public.guard_document_cancellation() IS
  'Trigger BEFORE UPDATE OR DELETE para sales y purchases: inmutables salvo la transición completed -> cancelled.';

REVOKE ALL ON FUNCTION public.guard_document_cancellation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tr_sales_prevent_mutation ON public.sales;
CREATE TRIGGER tr_sales_prevent_mutation
  BEFORE UPDATE OR DELETE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.guard_document_cancellation();

DROP TRIGGER IF EXISTS tr_purchases_prevent_mutation ON public.purchases;
CREATE TRIGGER tr_purchases_prevent_mutation
  BEFORE UPDATE OR DELETE ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.guard_document_cancellation();

-- ----------------------------------------------------------------------------
-- 2. COHERENCIA ENTRE ESTADO Y DATOS DE ANULACIÓN
-- ----------------------------------------------------------------------------
ALTER TABLE public.sales
  ADD CONSTRAINT chk_sales_cancellation_consistency CHECK (
    (status = 'completed' AND cancelled_at IS NULL AND cancelled_by IS NULL AND cancel_reason IS NULL)
    OR (status = 'cancelled' AND cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL
        AND cancel_reason IS NOT NULL AND pg_catalog.length(cancel_reason) <= 500)
  );

ALTER TABLE public.purchases
  ADD CONSTRAINT chk_purchases_cancellation_consistency CHECK (
    (status = 'completed' AND cancelled_at IS NULL AND cancelled_by IS NULL AND cancel_reason IS NULL)
    OR (status = 'cancelled' AND cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL
        AND cancel_reason IS NOT NULL AND pg_catalog.length(cancel_reason) <= 500)
  );

-- ----------------------------------------------------------------------------
-- 3. VALIDACIÓN COMÚN: AUTORIZACIÓN CON BLOQUEO DE EMPRESA Y MOTIVO
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.prepare_document_cancellation(
  p_company_id UUID,
  p_document_id UUID,
  p_reason TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company_active BOOLEAN;
  v_reason TEXT := pg_catalog.btrim(p_reason);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;

  IF p_company_id IS NULL OR p_document_id IS NULL THEN
    RAISE EXCEPTION 'Parámetros obligatorios incompletos para la anulación.';
  END IF;

  PERFORM private.assert_company_role(p_company_id, 'master_admin');

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
  PERFORM private.assert_company_role(p_company_id, 'master_admin');

  IF v_reason IS NULL OR v_reason = '' THEN
    RAISE EXCEPTION 'Se requiere indicar el motivo de la anulación.';
  END IF;

  IF pg_catalog.length(v_reason) > 500 THEN
    RAISE EXCEPTION 'El motivo de la anulación no puede superar los 500 caracteres.';
  END IF;

  RETURN v_reason;
END;
$$;

REVOKE ALL ON FUNCTION private.prepare_document_cancellation(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. RPC: public.cancel_sale
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_sale(
  p_company_id UUID,
  p_sale_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_reason TEXT;
  v_sale RECORD;
  v_item RECORD;
  v_movement_id UUID;
  v_now TIMESTAMPTZ := pg_catalog.now();
BEGIN
  v_reason := private.prepare_document_cancellation(p_company_id, p_sale_id, p_reason);

  SELECT id, sale_number, status, cancelled_at, total_amount INTO v_sale
  FROM public.sales
  WHERE id = p_sale_id AND company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venta no encontrada en esta empresa.';
  END IF;

  -- Reintento de una anulación ya confirmada: sin efectos
  IF v_sale.status = 'cancelled' THEN
    RETURN pg_catalog.jsonb_build_object(
      'sale_id', v_sale.id, 'sale_number', v_sale.sale_number, 'status', 'cancelled',
      'cancelled_at', v_sale.cancelled_at, 'already_cancelled', true
    );
  END IF;

  -- Bloqueo canónico de productos antes de insertar movimientos
  PERFORM 1
  FROM public.products p
  WHERE p.company_id = p_company_id
    AND p.id IN (SELECT si.product_id FROM public.sale_items si WHERE si.sale_id = p_sale_id AND si.company_id = p_company_id)
  ORDER BY p.id
  FOR UPDATE;

  -- Reposición de stock al costo congelado de la venta original
  FOR v_item IN
    SELECT si.product_id, si.quantity, COALESCE(mc.unit_cost, 0.00) AS unit_cost
    FROM public.sale_items si
    LEFT JOIN public.stock_movements sm
      ON sm.company_id = si.company_id AND sm.reference_sale_id = si.sale_id
     AND sm.product_id = si.product_id AND sm.reason = 'sale'
    LEFT JOIN public.movement_costs mc
      ON mc.company_id = sm.company_id AND mc.movement_id = sm.id
    WHERE si.sale_id = p_sale_id AND si.company_id = p_company_id
    ORDER BY si.product_id
  LOOP
    INSERT INTO public.stock_movements (
      company_id, product_id, direction, reason, quantity, reference_sale_id, reference_doc, notes, created_by
    ) VALUES (
      p_company_id, v_item.product_id, 'increase', 'cancellation', v_item.quantity, p_sale_id,
      v_sale.sale_number, 'Anulación ' || v_sale.sale_number, v_user_id
    ) RETURNING id INTO v_movement_id;

    INSERT INTO public.movement_costs (company_id, movement_id, unit_cost, total_cost)
    VALUES (p_company_id, v_movement_id, v_item.unit_cost, pg_catalog.round(v_item.unit_cost * v_item.quantity, 2));
  END LOOP;

  UPDATE public.sales
  SET status = 'cancelled', cancelled_at = v_now, cancelled_by = v_user_id, cancel_reason = v_reason
  WHERE id = p_sale_id AND company_id = p_company_id;

  INSERT INTO public.audit_log (
    company_id, table_name, record_id, action, old_data, new_data, performed_by, actor_role
  ) VALUES (
    p_company_id, 'sales', p_sale_id::TEXT, 'UPDATE',
    pg_catalog.jsonb_build_object('status', 'completed'),
    pg_catalog.jsonb_build_object('status', 'cancelled', 'reason', v_reason, 'total_amount', v_sale.total_amount),
    v_user_id, 'master_admin'
  );

  RETURN pg_catalog.jsonb_build_object(
    'sale_id', p_sale_id, 'sale_number', v_sale.sale_number, 'status', 'cancelled',
    'cancelled_at', v_now, 'already_cancelled', false
  );
END;
$$;

COMMENT ON FUNCTION public.cancel_sale(UUID, UUID, TEXT) IS
  'Anula una venta completada: repone el stock al costo congelado y registra la anulación. Exclusivo master_admin.';

REVOKE ALL ON FUNCTION public.cancel_sale(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_sale(UUID, UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. RPC: public.cancel_purchase
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_purchase(
  p_company_id UUID,
  p_purchase_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_reason TEXT;
  v_purchase RECORD;
  v_item RECORD;
  v_movement_id UUID;
  v_now TIMESTAMPTZ := pg_catalog.now();
BEGIN
  v_reason := private.prepare_document_cancellation(p_company_id, p_purchase_id, p_reason);

  SELECT id, purchase_number, status, cancelled_at, total_amount INTO v_purchase
  FROM public.purchases
  WHERE id = p_purchase_id AND company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compra no encontrada en esta empresa.';
  END IF;

  IF v_purchase.status = 'cancelled' THEN
    RETURN pg_catalog.jsonb_build_object(
      'purchase_id', v_purchase.id, 'purchase_number', v_purchase.purchase_number, 'status', 'cancelled',
      'cancelled_at', v_purchase.cancelled_at, 'already_cancelled', true
    );
  END IF;

  PERFORM 1
  FROM public.products p
  WHERE p.company_id = p_company_id
    AND p.id IN (SELECT pi.product_id FROM public.purchase_items pi WHERE pi.purchase_id = p_purchase_id AND pi.company_id = p_company_id)
  ORDER BY p.id
  FOR UPDATE;

  -- Salida de stock al costo de la compra; sync_product_stock aplica la política de stock negativo
  FOR v_item IN
    SELECT pi.product_id, pi.quantity, pi.unit_cost
    FROM public.purchase_items pi
    WHERE pi.purchase_id = p_purchase_id AND pi.company_id = p_company_id
    ORDER BY pi.product_id
  LOOP
    INSERT INTO public.stock_movements (
      company_id, product_id, direction, reason, quantity, reference_purchase_id, reference_doc, notes, created_by
    ) VALUES (
      p_company_id, v_item.product_id, 'decrease', 'purchase_cancellation', v_item.quantity, p_purchase_id,
      v_purchase.purchase_number, 'Anulación ' || v_purchase.purchase_number, v_user_id
    ) RETURNING id INTO v_movement_id;

    INSERT INTO public.movement_costs (company_id, movement_id, unit_cost, total_cost)
    VALUES (p_company_id, v_movement_id, v_item.unit_cost, pg_catalog.round(v_item.unit_cost * v_item.quantity, 2));
  END LOOP;

  UPDATE public.purchases
  SET status = 'cancelled', cancelled_at = v_now, cancelled_by = v_user_id, cancel_reason = v_reason
  WHERE id = p_purchase_id AND company_id = p_company_id;

  INSERT INTO public.audit_log (
    company_id, table_name, record_id, action, old_data, new_data, performed_by, actor_role
  ) VALUES (
    p_company_id, 'purchases', p_purchase_id::TEXT, 'UPDATE',
    pg_catalog.jsonb_build_object('status', 'completed'),
    pg_catalog.jsonb_build_object('status', 'cancelled', 'reason', v_reason, 'total_amount', v_purchase.total_amount),
    v_user_id, 'master_admin'
  );

  RETURN pg_catalog.jsonb_build_object(
    'purchase_id', p_purchase_id, 'purchase_number', v_purchase.purchase_number, 'status', 'cancelled',
    'cancelled_at', v_now, 'already_cancelled', false
  );
END;
$$;

COMMENT ON FUNCTION public.cancel_purchase(UUID, UUID, TEXT) IS
  'Anula una compra completada: descuenta el stock ingresado (respetando la política de stock negativo) y registra la anulación. Exclusivo master_admin.';

REVOKE ALL ON FUNCTION public.cancel_purchase(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_purchase(UUID, UUID, TEXT) TO authenticated;
