-- ============================================================================
-- MIGRACIÓN: PERMISOS POR MÓDULO (ETAPA 1)
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
--
-- El administrador de cada empresa elige qué módulos puede usar el rol empleado y con
-- qué alcance. El administrador siempre tiene acceso total.
--   * Niveles por módulo: 'none' (sin acceso), 'view' (solo ver), 'operate' (ver y operar).
--   * Módulos de esta etapa: compras, finanzas, gastos, cobros_pagos, informes, maquinas,
--     personal y fichaje. El resto de los módulos mantiene sus reglas fijas.
--   * Sin configuración guardada, rige lo de siempre: el empleado no accede a ningún
--     módulo de la lista, salvo fichaje (ver y operar). Las empresas existentes no cambian.
--   * Se aplica en la base: tanto las operaciones (RPC) como las lecturas (RLS) consultan
--     private.has_module_level / private.assert_module_access.
--   * Solo el Master Admin cambia los permisos; cada cambio queda en la auditoría.
--   * Fichaje: clock_in / clock_out / clock_roster también los habilita el módulo personal.
--   * cancel_purchase pasa a exigir el módulo compras (operar) en vez de administrador.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TABLA DE PERMISOS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.company_module_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  module TEXT NOT NULL CHECK (module IN (
    'compras', 'finanzas', 'gastos', 'cobros_pagos', 'informes', 'maquinas', 'personal', 'fichaje'
  )),
  employee_level TEXT NOT NULL CHECK (employee_level IN ('none', 'view', 'operate')),
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_module_permissions UNIQUE (company_id, module)
);

DROP TRIGGER IF EXISTS tr_audit_module_permissions ON public.company_module_permissions;
CREATE TRIGGER tr_audit_module_permissions
  AFTER INSERT OR UPDATE OR DELETE ON public.company_module_permissions
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger('id');

ALTER TABLE public.company_module_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_module_permissions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "module_permissions_select_member" ON public.company_module_permissions;
CREATE POLICY "module_permissions_select_member"
  ON public.company_module_permissions FOR SELECT TO authenticated
  USING (company_id IN (SELECT private.my_active_company_ids()));

REVOKE ALL ON public.company_module_permissions FROM PUBLIC, anon;
GRANT SELECT ON public.company_module_permissions TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.company_module_permissions FROM authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'company_module_permissions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.company_module_permissions;
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- 2. REGLA CENTRAL DE ACCESO
-- ----------------------------------------------------------------------------
-- Nivel efectivo de quien consulta en un módulo: administrador = 'operate'; empleado = lo
-- configurado (o el valor por defecto); quien no es miembro activo = 'none'.
CREATE OR REPLACE FUNCTION private.module_level(p_company_id UUID, p_module TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role TEXT;
  v_level TEXT;
BEGIN
  SELECT cm.role INTO v_role
  FROM public.company_members cm
  JOIN public.companies c ON c.id = cm.company_id
  WHERE cm.company_id = p_company_id AND cm.user_id = auth.uid() AND cm.is_active = true AND c.is_active = true;

  IF v_role IS NULL THEN
    RETURN 'none';
  END IF;
  IF v_role = 'master_admin' THEN
    RETURN 'operate';
  END IF;

  SELECT p.employee_level INTO v_level
  FROM public.company_module_permissions p
  WHERE p.company_id = p_company_id AND p.module = p_module;

  RETURN COALESCE(v_level, CASE WHEN p_module = 'fichaje' THEN 'operate' ELSE 'none' END);
END;
$$;

-- ¿Alcanza el nivel pedido en alguno de los módulos indicados?
CREATE OR REPLACE FUNCTION private.has_module_level(p_company_id UUID, p_modules TEXT[], p_need TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.unnest(p_modules) AS m(module)
    WHERE CASE private.module_level(p_company_id, m.module) WHEN 'operate' THEN 2 WHEN 'view' THEN 1 ELSE 0 END
          >= CASE p_need WHEN 'operate' THEN 2 ELSE 1 END
  );
$$;

CREATE OR REPLACE FUNCTION private.assert_module_access(p_company_id UUID, p_modules TEXT[], p_need TEXT)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Usuario autenticado, empresa activa y miembro activo
  PERFORM private.assert_company_role(p_company_id, NULL);
  IF p_need NOT IN ('view', 'operate') THEN
    RAISE EXCEPTION 'Nivel de acceso inválido.';
  END IF;
  IF NOT private.has_module_level(p_company_id, p_modules, p_need) THEN
    RAISE EXCEPTION 'No tenés permiso para esta operación. Pedile acceso al administrador.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.module_level(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.has_module_level(UUID, TEXT[], TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.assert_module_access(UUID, TEXT[], TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.has_module_level(UUID, TEXT[], TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. CONSULTAR Y CAMBIAR PERMISOS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_module_permissions(p_company_id UUID)
RETURNS TABLE (module TEXT, employee_level TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  PERFORM private.assert_company_role(p_company_id, NULL);

  RETURN QUERY
  SELECT m.module,
         COALESCE(p.employee_level, CASE WHEN m.module = 'fichaje' THEN 'operate' ELSE 'none' END)
  FROM pg_catalog.unnest(ARRAY['compras', 'finanzas', 'gastos', 'cobros_pagos', 'informes', 'maquinas', 'personal', 'fichaje'])
       WITH ORDINALITY AS m(module, ord)
  LEFT JOIN public.company_module_permissions p ON p.company_id = p_company_id AND p.module = m.module
  ORDER BY m.ord;
END;
$$;

REVOKE ALL ON FUNCTION public.get_module_permissions(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_module_permissions(UUID) TO authenticated;

-- p_levels: objeto JSON {"compras": "view", "gastos": "none", ...}. Solo cambia los módulos indicados.
CREATE OR REPLACE FUNCTION public.set_module_permissions(p_company_id UUID, p_levels JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item RECORD;
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
    IF v_item.module NOT IN ('compras', 'finanzas', 'gastos', 'cobros_pagos', 'informes', 'maquinas', 'personal', 'fichaje') THEN
      RAISE EXCEPTION 'Módulo inválido: %.', v_item.module;
    END IF;
    IF pg_catalog.jsonb_typeof(v_item.level) <> 'string' OR (v_item.level #>> '{}') NOT IN ('none', 'view', 'operate') THEN
      RAISE EXCEPTION 'Nivel inválido para el módulo %.', v_item.module;
    END IF;

    INSERT INTO public.company_module_permissions (company_id, module, employee_level, updated_by)
    VALUES (p_company_id, v_item.module, v_item.level #>> '{}', auth.uid())
    ON CONFLICT (company_id, module) DO UPDATE
      SET employee_level = EXCLUDED.employee_level, updated_by = EXCLUDED.updated_by, updated_at = now()
      WHERE public.company_module_permissions.employee_level IS DISTINCT FROM EXCLUDED.employee_level;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.set_module_permissions(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_module_permissions(UUID, JSONB) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. OPERACIONES Y CONSULTAS: del rol fijo al permiso por módulo
--    (cada función conserva su lógica; solo cambia la línea que valida el acceso)
-- ----------------------------------------------------------------------------

-- public.process_purchase(uuid,uuid,uuid,jsonb,text,date,text): compras (operate) [2 verificación(es)]
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
           (x.value->>'unit_cost')::NUMERIC AS unit_cost
    FROM pg_catalog.jsonb_array_elements(p_items) AS x
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
           (x.value->>'unit_cost')::NUMERIC AS unit_cost
    FROM pg_catalog.jsonb_array_elements(p_items) AS x
  LOOP
    -- 9.1. Registro en purchase_items (detalle histórico)
    INSERT INTO public.purchase_items (
      company_id,
      purchase_id,
      product_id,
      quantity,
      unit_cost,
      subtotal
    ) VALUES (
      p_company_id,
      v_purchase_id,
      v_item.product_id,
      v_item.quantity,
      v_item.unit_cost,
      pg_catalog.round(v_item.quantity * v_item.unit_cost, 2)
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
      created_by
    ) VALUES (
      p_company_id,
      v_item.product_id,
      'increase',
      'purchase',
      v_item.quantity,
      v_purchase_id,
      COALESCE(v_clean_invoice, v_purchase_number),
      'Compra ' || v_purchase_number,
      v_user_id
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

-- public.process_credit_purchase(uuid,uuid,uuid,jsonb,text,date,text): compras (operate) [1 verificación(es)]
CREATE OR REPLACE FUNCTION public.process_credit_purchase(p_company_id uuid, p_idempotency_key uuid, p_supplier_id uuid, p_items jsonb, p_invoice_number text DEFAULT NULL::text, p_purchase_date date DEFAULT NULL::date, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user UUID := auth.uid();
  v_replay BOOLEAN;
  v_result JSONB;
  v_purchase_id UUID;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  PERFORM private.assert_module_access(p_company_id, ARRAY['compras'], 'operate');

  -- Si la clave ya se usó, es un reintento: se devuelve lo guardado sin tocar la condición de pago
  SELECT EXISTS (
    SELECT 1 FROM public.operation_idempotency oi
    WHERE oi.company_id = p_company_id AND oi.created_by = v_user
      AND oi.operation_type = 'purchase' AND oi.idempotency_key = p_idempotency_key
  ) INTO v_replay;

  v_result := public.process_purchase(
    p_company_id, p_idempotency_key, p_supplier_id, p_items, p_invoice_number, p_purchase_date, p_notes
  );
  v_purchase_id := (v_result ->> 'purchase_id')::UUID;

  IF NOT v_replay THEN
    INSERT INTO public.credit_purchases (purchase_id, company_id, created_by)
    VALUES (v_purchase_id, p_company_id, v_user)
    ON CONFLICT (purchase_id) DO NOTHING;
  END IF;

  RETURN v_result;
END;
$function$;

-- public.financial_summary(uuid,date,date): finanzas (view) [1 verificación(es)]
CREATE OR REPLACE FUNCTION public.financial_summary(p_company_id uuid, p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tz TEXT;
  v_start TIMESTAMPTZ;
  v_end TIMESTAMPTZ;
  v_sales_total NUMERIC(14, 2);
  v_sales_count INTEGER;
  v_cancelled_total NUMERIC(14, 2);
  v_cancelled_count INTEGER;
  v_cogs NUMERIC(14, 2);
  v_purchases_total NUMERIC(14, 2);
  v_purchases_count INTEGER;
  v_payments JSONB;
  v_inventory NUMERIC(14, 2);
  v_expenses_total NUMERIC(14, 2);
  v_expenses_count INTEGER;
  v_expenses_by_cat JSONB;
  v_credit_sales NUMERIC(14, 2);
  v_collections NUMERIC(14, 2);
  v_receivable NUMERIC(14, 2);
  v_credit_purchases NUMERIC(14, 2);
  v_supplier_payments NUMERIC(14, 2);
  v_payables NUMERIC(14, 2);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;

  PERFORM private.assert_module_access(p_company_id, ARRAY['finanzas'], 'view');

  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
    RAISE EXCEPTION 'El período indicado no es válido.';
  END IF;
  IF p_to - p_from > 731 THEN
    RAISE EXCEPTION 'El período no puede superar los 2 años.';
  END IF;

  SELECT c.timezone INTO v_tz FROM public.companies c WHERE c.id = p_company_id;
  v_start := p_from::TIMESTAMP AT TIME ZONE v_tz;
  v_end := (p_to + 1)::TIMESTAMP AT TIME ZONE v_tz;

  SELECT
    COALESCE(SUM(s.total_amount) FILTER (WHERE s.status = 'completed'), 0)::NUMERIC(14, 2),
    (COUNT(*) FILTER (WHERE s.status = 'completed'))::INTEGER,
    COALESCE(SUM(s.total_amount) FILTER (WHERE s.status = 'cancelled'), 0)::NUMERIC(14, 2),
    (COUNT(*) FILTER (WHERE s.status = 'cancelled'))::INTEGER
  INTO v_sales_total, v_sales_count, v_cancelled_total, v_cancelled_count
  FROM public.sales s
  WHERE s.company_id = p_company_id
    AND s.created_at >= v_start AND s.created_at < v_end;

  SELECT COALESCE(SUM(mc.total_cost), 0)::NUMERIC(14, 2)
  INTO v_cogs
  FROM public.sales s
  JOIN public.stock_movements sm
    ON sm.company_id = s.company_id AND sm.reference_sale_id = s.id AND sm.reason = 'sale'
  JOIN public.movement_costs mc
    ON mc.company_id = sm.company_id AND mc.movement_id = sm.id
  WHERE s.company_id = p_company_id
    AND s.status = 'completed'
    AND s.created_at >= v_start AND s.created_at < v_end;

  SELECT COALESCE(SUM(p.total_amount), 0)::NUMERIC(14, 2), COUNT(*)::INTEGER
  INTO v_purchases_total, v_purchases_count
  FROM public.purchases p
  WHERE p.company_id = p_company_id
    AND p.status = 'completed'
    AND p.purchase_date BETWEEN p_from AND p_to;

  -- Cobrado por medio: pagos de ventas (sin cuenta corriente, que todavía no se cobró)
  -- más los cobros de cuenta corriente hechos en el período.
  SELECT COALESCE(pg_catalog.jsonb_object_agg(t.method, t.total), '{}'::JSONB)
  INTO v_payments
  FROM (
    SELECT u.method, SUM(u.amount)::NUMERIC(14, 2) AS total
    FROM (
      SELECT pay.value ->> 'method' AS method, (pay.value ->> 'amount')::NUMERIC AS amount
      FROM public.sales s
      CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(s.payments) AS pay(value)
      WHERE s.company_id = p_company_id
        AND s.status = 'completed'
        AND s.created_at >= v_start AND s.created_at < v_end
        AND pay.value ->> 'method' <> 'cuenta_corriente'
      UNION ALL
      SELECT pay.value ->> 'method', (pay.value ->> 'amount')::NUMERIC
      FROM public.customer_payments cp
      CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(cp.payments) AS pay(value)
      WHERE cp.company_id = p_company_id
        AND cp.status = 'active'
        AND cp.created_at >= v_start AND cp.created_at < v_end
    ) u
    GROUP BY u.method
  ) t;

  SELECT COALESCE(SUM((pay.value ->> 'amount')::NUMERIC), 0)::NUMERIC(14, 2)
  INTO v_credit_sales
  FROM public.sales s
  CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(s.payments) AS pay(value)
  WHERE s.company_id = p_company_id
    AND s.status = 'completed'
    AND s.created_at >= v_start AND s.created_at < v_end
    AND pay.value ->> 'method' = 'cuenta_corriente';

  SELECT COALESCE(SUM(cp.amount), 0)::NUMERIC(14, 2)
  INTO v_collections
  FROM public.customer_payments cp
  WHERE cp.company_id = p_company_id AND cp.status = 'active'
    AND cp.created_at >= v_start AND cp.created_at < v_end;

  SELECT COALESCE(SUM(b.balance) FILTER (WHERE b.balance > 0), 0)::NUMERIC(14, 2)
  INTO v_receivable
  FROM private.customer_balance_rows(p_company_id) b;

  SELECT COALESCE(SUM(p.total_amount), 0)::NUMERIC(14, 2)
  INTO v_credit_purchases
  FROM public.credit_purchases cp
  JOIN public.purchases p ON p.company_id = cp.company_id AND p.id = cp.purchase_id
  WHERE cp.company_id = p_company_id
    AND p.status = 'completed'
    AND p.purchase_date BETWEEN p_from AND p_to;

  SELECT COALESCE(SUM(sp.amount), 0)::NUMERIC(14, 2)
  INTO v_supplier_payments
  FROM public.supplier_payments sp
  WHERE sp.company_id = p_company_id AND sp.status = 'active'
    AND sp.created_at >= v_start AND sp.created_at < v_end;

  SELECT COALESCE(SUM(b.balance) FILTER (WHERE b.balance > 0), 0)::NUMERIC(14, 2)
  INTO v_payables
  FROM private.supplier_balance_rows(p_company_id) b;

  SELECT COALESCE(SUM(pr.current_stock * pc.cost_price), 0)::NUMERIC(14, 2)
  INTO v_inventory
  FROM public.products pr
  JOIN public.product_costs pc
    ON pc.product_id = pr.id AND pc.company_id = pr.company_id
  WHERE pr.company_id = p_company_id AND pr.current_stock > 0;

  SELECT COALESCE(SUM(e.amount), 0)::NUMERIC(14, 2), COUNT(*)::INTEGER
  INTO v_expenses_total, v_expenses_count
  FROM public.expenses e
  WHERE e.company_id = p_company_id AND e.status = 'active'
    AND e.expense_date BETWEEN p_from AND p_to;

  SELECT COALESCE(pg_catalog.jsonb_object_agg(t.category, t.total), '{}'::JSONB)
  INTO v_expenses_by_cat
  FROM (
    SELECT e.category, SUM(e.amount)::NUMERIC(14, 2) AS total
    FROM public.expenses e
    WHERE e.company_id = p_company_id AND e.status = 'active'
      AND e.expense_date BETWEEN p_from AND p_to
    GROUP BY e.category
  ) t;

  RETURN pg_catalog.jsonb_build_object(
    'sales_total', v_sales_total,
    'sales_count', v_sales_count,
    'cancelled_total', v_cancelled_total,
    'cancelled_count', v_cancelled_count,
    'cogs_total', v_cogs,
    'purchases_total', v_purchases_total,
    'purchases_count', v_purchases_count,
    'payments_by_method', v_payments,
    'inventory_value', v_inventory,
    'expenses_total', v_expenses_total,
    'expenses_count', v_expenses_count,
    'expenses_by_category', v_expenses_by_cat,
    'credit_sales_total', v_credit_sales,
    'collections_total', v_collections,
    'receivable_total', v_receivable,
    'credit_purchases_total', v_credit_purchases,
    'supplier_payments_total', v_supplier_payments,
    'payables_total', v_payables
  );
END;
$function$;

-- create_expense(uuid,date,text,text,numeric,text,uuid,boolean,uuid): gastos (operate) [1 verificación(es)]
CREATE OR REPLACE FUNCTION public.create_expense(p_company_id uuid, p_expense_date date, p_category text, p_description text, p_amount numeric, p_payment_method text, p_supplier_id uuid, p_pay_from_cash boolean, p_machine_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_description TEXT := pg_catalog.btrim(p_description);
  v_session_id UUID;
  v_movement_id UUID;
  v_expense_id UUID;
  v_machine_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  PERFORM private.assert_module_access(p_company_id, ARRAY['gastos'], 'operate');
  PERFORM private.assert_money(p_amount, 'el importe', false);

  IF p_expense_date IS NULL THEN
    RAISE EXCEPTION 'Indicá la fecha del gasto.';
  END IF;
  IF p_expense_date > (pg_catalog.timezone((SELECT c.timezone FROM public.companies c WHERE c.id = p_company_id), now()))::DATE THEN
    RAISE EXCEPTION 'La fecha del gasto no puede ser futura.';
  END IF;
  IF v_description IS NULL OR v_description = '' THEN
    RAISE EXCEPTION 'Describí el gasto.';
  END IF;
  IF p_supplier_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.suppliers s WHERE s.id = p_supplier_id AND s.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'El proveedor no pertenece a esta empresa.';
  END IF;

  IF p_machine_id IS NOT NULL THEN
    SELECT m.status INTO v_machine_status
    FROM public.machines m
    WHERE m.id = p_machine_id AND m.company_id = p_company_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La máquina no pertenece a esta empresa.';
    END IF;
    IF v_machine_status = 'inactive' THEN
      RAISE EXCEPTION 'La máquina está inactiva: reactivala para cargarle gastos.';
    END IF;
  END IF;

  IF COALESCE(p_pay_from_cash, false) THEN
    IF p_payment_method <> 'efectivo' THEN
      RAISE EXCEPTION 'Solo un gasto en efectivo puede salir de la caja.';
    END IF;
    SELECT cs.id INTO v_session_id
    FROM public.cash_sessions cs
    WHERE cs.company_id = p_company_id AND cs.status = 'open';
    IF v_session_id IS NULL THEN
      RAISE EXCEPTION 'No hay una caja abierta: abrila para pagar este gasto desde la caja.';
    END IF;
    v_movement_id := (public.register_cash_movement(
      p_company_id, v_session_id, 'out', p_amount, pg_catalog.left('Gasto: ' || v_description, 500)
    ) ->> 'movement_id')::UUID;
  END IF;

  INSERT INTO public.expenses (
    company_id, expense_date, category, description, amount, payment_method,
    supplier_id, cash_movement_id, machine_id, created_by
  ) VALUES (
    p_company_id, p_expense_date, p_category, v_description, p_amount, p_payment_method,
    p_supplier_id, v_movement_id, p_machine_id, auth.uid()
  ) RETURNING id INTO v_expense_id;

  RETURN pg_catalog.jsonb_build_object('expense_id', v_expense_id);
END;
$function$;

-- public.void_expense(uuid,uuid,text): gastos (operate) [1 verificación(es)]
CREATE OR REPLACE FUNCTION public.void_expense(p_company_id uuid, p_expense_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_reason TEXT := pg_catalog.btrim(p_reason);
  v_expense public.expenses%ROWTYPE;
  v_session_id UUID;
  v_refund_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  PERFORM private.assert_module_access(p_company_id, ARRAY['gastos'], 'operate');

  IF v_reason IS NULL OR v_reason = '' THEN
    RAISE EXCEPTION 'Indicá el motivo de la anulación.';
  END IF;
  IF pg_catalog.length(v_reason) > 500 THEN
    RAISE EXCEPTION 'El motivo no puede superar los 500 caracteres.';
  END IF;

  SELECT * INTO v_expense
  FROM public.expenses e
  WHERE e.id = p_expense_id AND e.company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Gasto no encontrado en esta empresa.';
  END IF;
  IF v_expense.status = 'voided' THEN
    RAISE EXCEPTION 'Este gasto ya está anulado.';
  END IF;

  IF v_expense.cash_movement_id IS NOT NULL THEN
    SELECT cs.id INTO v_session_id
    FROM public.cash_sessions cs
    WHERE cs.company_id = p_company_id AND cs.status = 'open';
    IF v_session_id IS NULL THEN
      RAISE EXCEPTION 'Este gasto se pagó con efectivo de la caja: abrí la caja para anularlo y que el dinero vuelva.';
    END IF;
    v_refund_id := (public.register_cash_movement(
      p_company_id, v_session_id, 'in', v_expense.amount,
      pg_catalog.left('Anulación de gasto: ' || v_expense.description, 500)
    ) ->> 'movement_id')::UUID;
  END IF;

  UPDATE public.expenses
  SET status = 'voided', voided_at = now(), voided_by = auth.uid(), void_reason = v_reason,
      void_cash_movement_id = v_refund_id
  WHERE id = p_expense_id;

  RETURN pg_catalog.jsonb_build_object('expense_id', p_expense_id);
END;
$function$;

-- public.customer_balances(uuid): cobros_pagos (view) [1 verificación(es)]
CREATE OR REPLACE FUNCTION public.customer_balances(p_company_id uuid)
 RETURNS TABLE(customer_id uuid, customer_name text, charged_total numeric, collected_total numeric, balance numeric, last_activity timestamp with time zone, oldest_open_since timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  PERFORM private.assert_module_access(p_company_id, ARRAY['cobros_pagos'], 'view');
  RETURN QUERY
    SELECT b.customer_id, b.customer_name, b.charged_total, b.collected_total, b.balance,
           b.last_activity, b.oldest_open_since
    FROM private.customer_balance_rows(p_company_id) b
    ORDER BY b.balance DESC, b.customer_name;
END;
$function$;

-- public.customer_statement(uuid,uuid): cobros_pagos (view) [1 verificación(es)]
CREATE OR REPLACE FUNCTION public.customer_statement(p_company_id uuid, p_customer_id uuid)
 RETURNS TABLE(kind text, reference_id uuid, document text, occurred_at timestamp with time zone, amount numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  PERFORM private.assert_module_access(p_company_id, ARRAY['cobros_pagos'], 'view');
  IF NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.id = p_customer_id AND c.company_id = p_company_id) THEN
    RAISE EXCEPTION 'Cliente no encontrado en esta empresa.';
  END IF;
  RETURN QUERY
    SELECT m.kind, m.reference_id, m.document, m.occurred_at, m.amount
    FROM (
      SELECT 'sale'::TEXT AS kind, s.id AS reference_id, s.sale_number AS document,
             s.created_at AS occurred_at, private.sale_credit_amount(s.payments) AS amount
      FROM public.sales s
      WHERE s.company_id = p_company_id AND s.customer_id = p_customer_id AND s.status = 'completed'
        AND private.sale_credit_amount(s.payments) > 0
      UNION ALL
      SELECT 'payment'::TEXT, cp.id, 'Cobro', cp.created_at, -cp.amount
      FROM public.customer_payments cp
      WHERE cp.company_id = p_company_id AND cp.customer_id = p_customer_id AND cp.status = 'active'
    ) m
    ORDER BY m.occurred_at, m.reference_id;
END;
$function$;

-- public.register_customer_payment(uuid,uuid,jsonb,text,boolean,uuid): cobros_pagos (operate) [1 verificación(es)]
CREATE OR REPLACE FUNCTION public.register_customer_payment(p_company_id uuid, p_customer_id uuid, p_payments jsonb, p_notes text, p_into_cash boolean, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user UUID := auth.uid();
  v_notes TEXT := NULLIF(pg_catalog.btrim(COALESCE(p_notes, '')), '');
  v_customer_name TEXT;
  v_existing public.customer_payments%ROWTYPE;
  v_pay RECORD;
  v_total NUMERIC(14, 2) := 0;
  v_cash NUMERIC(14, 2) := 0;
  v_balance NUMERIC(14, 2);
  v_session_id UUID;
  v_movement_id UUID;
  v_payment_id UUID;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'La clave de idempotencia es obligatoria.';
  END IF;
  PERFORM private.assert_module_access(p_company_id, ARRAY['cobros_pagos'], 'operate');

  IF p_payments IS NULL OR pg_catalog.jsonb_typeof(p_payments) <> 'array' OR pg_catalog.jsonb_array_length(p_payments) = 0 THEN
    RAISE EXCEPTION 'Indicá con qué medio de pago se cobra.';
  END IF;
  IF v_notes IS NOT NULL AND pg_catalog.length(v_notes) > 500 THEN
    RAISE EXCEPTION 'La nota no puede superar los 500 caracteres.';
  END IF;

  -- Se bloquea al cliente: dos cobros simultáneos no pueden pasarse del saldo juntos
  SELECT c.name INTO v_customer_name
  FROM public.customers c
  WHERE c.id = p_customer_id AND c.company_id = p_company_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El cliente no existe o no pertenece a esta empresa.';
  END IF;

  SELECT * INTO v_existing
  FROM public.customer_payments cp
  WHERE cp.company_id = p_company_id AND cp.created_by = v_user AND cp.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.customer_id <> p_customer_id THEN
      RAISE EXCEPTION 'Clave de cobro reutilizada con otro cliente.';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'payment_id', v_existing.id, 'balance_after', private.customer_balance(p_company_id, p_customer_id)
    );
  END IF;

  FOR v_pay IN
    SELECT (y.value ->> 'method')::TEXT AS method, (y.value ->> 'amount')::NUMERIC AS amount
    FROM pg_catalog.jsonb_array_elements(p_payments) AS y
  LOOP
    IF v_pay.method IS NULL OR v_pay.method NOT IN ('efectivo', 'transferencia', 'debito', 'credito', 'cheque') THEN
      RAISE EXCEPTION 'Medio de pago inválido para un cobro: %.', COALESCE(v_pay.method, '(vacío)');
    END IF;
    PERFORM private.assert_money(v_pay.amount, 'el importe de cada medio de pago', false);
    v_total := v_total + v_pay.amount;
    IF v_pay.method = 'efectivo' THEN
      v_cash := v_cash + v_pay.amount;
    END IF;
  END LOOP;

  v_balance := private.customer_balance(p_company_id, p_customer_id);
  IF v_total > v_balance THEN
    RAISE EXCEPTION 'El cobro ($ %) supera el saldo del cliente ($ %).', v_total, GREATEST(v_balance, 0);
  END IF;

  IF COALESCE(p_into_cash, false) THEN
    IF v_cash = 0 THEN
      RAISE EXCEPTION 'Solo el efectivo puede ingresar a la caja: este cobro no tiene efectivo.';
    END IF;
    SELECT cs.id INTO v_session_id
    FROM public.cash_sessions cs
    WHERE cs.company_id = p_company_id AND cs.status = 'open';
    IF v_session_id IS NULL THEN
      RAISE EXCEPTION 'No hay una caja abierta: abrila para que el efectivo del cobro ingrese a la caja.';
    END IF;
    v_movement_id := (public.register_cash_movement(
      p_company_id, v_session_id, 'in', v_cash,
      pg_catalog.left('Cobro de cuenta corriente: ' || v_customer_name, 500)
    ) ->> 'movement_id')::UUID;
  END IF;

  INSERT INTO public.customer_payments (
    company_id, customer_id, amount, payments, notes, cash_movement_id, idempotency_key, created_by
  ) VALUES (
    p_company_id, p_customer_id, v_total, p_payments, v_notes, v_movement_id, p_idempotency_key, v_user
  ) RETURNING id INTO v_payment_id;

  RETURN pg_catalog.jsonb_build_object('payment_id', v_payment_id, 'balance_after', v_balance - v_total);
END;
$function$;

-- public.void_customer_payment(uuid,uuid,text): cobros_pagos (operate) [1 verificación(es)]
CREATE OR REPLACE FUNCTION public.void_customer_payment(p_company_id uuid, p_payment_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_reason TEXT := pg_catalog.btrim(p_reason);
  v_payment public.customer_payments%ROWTYPE;
  v_session_id UUID;
  v_out_id UUID;
  v_cash NUMERIC(14, 2);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  PERFORM private.assert_module_access(p_company_id, ARRAY['cobros_pagos'], 'operate');

  IF v_reason IS NULL OR v_reason = '' THEN
    RAISE EXCEPTION 'Indicá el motivo de la anulación.';
  END IF;
  IF pg_catalog.length(v_reason) > 500 THEN
    RAISE EXCEPTION 'El motivo no puede superar los 500 caracteres.';
  END IF;

  SELECT * INTO v_payment
  FROM public.customer_payments cp
  WHERE cp.id = p_payment_id AND cp.company_id = p_company_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cobro no encontrado en esta empresa.';
  END IF;
  IF v_payment.status = 'voided' THEN
    RAISE EXCEPTION 'Este cobro ya está anulado.';
  END IF;

  IF v_payment.cash_movement_id IS NOT NULL THEN
    SELECT COALESCE(SUM((pay.value ->> 'amount')::NUMERIC), 0) INTO v_cash
    FROM pg_catalog.jsonb_array_elements(v_payment.payments) AS pay(value)
    WHERE pay.value ->> 'method' = 'efectivo';

    SELECT cs.id INTO v_session_id
    FROM public.cash_sessions cs
    WHERE cs.company_id = p_company_id AND cs.status = 'open';
    IF v_session_id IS NULL THEN
      RAISE EXCEPTION 'El efectivo de este cobro ingresó a la caja: abrí la caja para anularlo y que el dinero salga.';
    END IF;
    v_out_id := (public.register_cash_movement(
      p_company_id, v_session_id, 'out', v_cash,
      pg_catalog.left('Anulación de cobro de cuenta corriente: ' || v_reason, 500)
    ) ->> 'movement_id')::UUID;
  END IF;

  UPDATE public.customer_payments
  SET status = 'voided', voided_at = now(), voided_by = auth.uid(), void_reason = v_reason,
      void_cash_movement_id = v_out_id
  WHERE id = p_payment_id;

  RETURN pg_catalog.jsonb_build_object('payment_id', p_payment_id);
END;
$function$;

-- public.supplier_balances(uuid): cobros_pagos (view) [1 verificación(es)]
CREATE OR REPLACE FUNCTION public.supplier_balances(p_company_id uuid)
 RETURNS TABLE(supplier_id uuid, supplier_name text, charged_total numeric, paid_total numeric, balance numeric, last_activity timestamp with time zone, oldest_open_since timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  PERFORM private.assert_module_access(p_company_id, ARRAY['cobros_pagos'], 'view');
  RETURN QUERY
    SELECT b.supplier_id, b.supplier_name, b.charged_total, b.paid_total, b.balance,
           b.last_activity, b.oldest_open_since
    FROM private.supplier_balance_rows(p_company_id) b
    ORDER BY b.balance DESC, b.supplier_name;
END;
$function$;

-- public.supplier_statement(uuid,uuid): cobros_pagos (view) [1 verificación(es)]
CREATE OR REPLACE FUNCTION public.supplier_statement(p_company_id uuid, p_supplier_id uuid)
 RETURNS TABLE(kind text, reference_id uuid, document text, occurred_at timestamp with time zone, amount numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  PERFORM private.assert_module_access(p_company_id, ARRAY['cobros_pagos'], 'view');
  IF NOT EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = p_supplier_id AND s.company_id = p_company_id) THEN
    RAISE EXCEPTION 'Proveedor no encontrado en esta empresa.';
  END IF;
  RETURN QUERY
    SELECT m.kind, m.reference_id, m.document, m.occurred_at, m.amount
    FROM (
      SELECT 'purchase'::TEXT AS kind, p.id AS reference_id, p.purchase_number AS document,
             p.created_at AS occurred_at, p.total_amount AS amount
      FROM public.credit_purchases cp
      JOIN public.purchases p ON p.company_id = cp.company_id AND p.id = cp.purchase_id
      WHERE cp.company_id = p_company_id AND p.supplier_id = p_supplier_id AND p.status = 'completed'
      UNION ALL
      SELECT 'payment'::TEXT, sp.id, 'Pago', sp.created_at, -sp.amount
      FROM public.supplier_payments sp
      WHERE sp.company_id = p_company_id AND sp.supplier_id = p_supplier_id AND sp.status = 'active'
    ) m
    ORDER BY m.occurred_at, m.reference_id;
END;
$function$;

-- public.register_supplier_payment(uuid,uuid,jsonb,text,boolean,uuid): cobros_pagos (operate) [1 verificación(es)]
CREATE OR REPLACE FUNCTION public.register_supplier_payment(p_company_id uuid, p_supplier_id uuid, p_payments jsonb, p_notes text, p_from_cash boolean, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user UUID := auth.uid();
  v_notes TEXT := NULLIF(pg_catalog.btrim(COALESCE(p_notes, '')), '');
  v_supplier_name TEXT;
  v_existing public.supplier_payments%ROWTYPE;
  v_pay RECORD;
  v_total NUMERIC(14, 2) := 0;
  v_cash NUMERIC(14, 2) := 0;
  v_balance NUMERIC(14, 2);
  v_session_id UUID;
  v_movement_id UUID;
  v_payment_id UUID;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'La clave de idempotencia es obligatoria.';
  END IF;
  PERFORM private.assert_module_access(p_company_id, ARRAY['cobros_pagos'], 'operate');

  IF p_payments IS NULL OR pg_catalog.jsonb_typeof(p_payments) <> 'array' OR pg_catalog.jsonb_array_length(p_payments) = 0 THEN
    RAISE EXCEPTION 'Indicá con qué medio de pago se paga.';
  END IF;
  IF v_notes IS NOT NULL AND pg_catalog.length(v_notes) > 500 THEN
    RAISE EXCEPTION 'La nota no puede superar los 500 caracteres.';
  END IF;

  -- Se bloquea al proveedor: dos pagos simultáneos no pueden pasarse del saldo juntos
  SELECT s.name INTO v_supplier_name
  FROM public.suppliers s
  WHERE s.id = p_supplier_id AND s.company_id = p_company_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El proveedor no existe o no pertenece a esta empresa.';
  END IF;

  SELECT * INTO v_existing
  FROM public.supplier_payments sp
  WHERE sp.company_id = p_company_id AND sp.created_by = v_user AND sp.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.supplier_id <> p_supplier_id THEN
      RAISE EXCEPTION 'Clave de pago reutilizada con otro proveedor.';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'payment_id', v_existing.id, 'balance_after', private.supplier_balance(p_company_id, p_supplier_id)
    );
  END IF;

  FOR v_pay IN
    SELECT (y.value ->> 'method')::TEXT AS method, (y.value ->> 'amount')::NUMERIC AS amount
    FROM pg_catalog.jsonb_array_elements(p_payments) AS y
  LOOP
    IF v_pay.method IS NULL OR v_pay.method NOT IN ('efectivo', 'transferencia', 'debito', 'credito', 'cheque') THEN
      RAISE EXCEPTION 'Medio de pago inválido para un pago: %.', COALESCE(v_pay.method, '(vacío)');
    END IF;
    PERFORM private.assert_money(v_pay.amount, 'el importe de cada medio de pago', false);
    v_total := v_total + v_pay.amount;
    IF v_pay.method = 'efectivo' THEN
      v_cash := v_cash + v_pay.amount;
    END IF;
  END LOOP;

  v_balance := private.supplier_balance(p_company_id, p_supplier_id);
  IF v_total > v_balance THEN
    RAISE EXCEPTION 'El pago ($ %) supera lo que se le debe al proveedor ($ %).', v_total, GREATEST(v_balance, 0);
  END IF;

  IF COALESCE(p_from_cash, false) THEN
    IF v_cash = 0 THEN
      RAISE EXCEPTION 'Solo el efectivo puede salir de la caja: este pago no tiene efectivo.';
    END IF;
    SELECT cs.id INTO v_session_id
    FROM public.cash_sessions cs
    WHERE cs.company_id = p_company_id AND cs.status = 'open';
    IF v_session_id IS NULL THEN
      RAISE EXCEPTION 'No hay una caja abierta: abrila para que el efectivo del pago salga de la caja.';
    END IF;
    v_movement_id := (public.register_cash_movement(
      p_company_id, v_session_id, 'out', v_cash,
      pg_catalog.left('Pago a proveedor: ' || v_supplier_name, 500)
    ) ->> 'movement_id')::UUID;
  END IF;

  INSERT INTO public.supplier_payments (
    company_id, supplier_id, amount, payments, notes, cash_movement_id, idempotency_key, created_by
  ) VALUES (
    p_company_id, p_supplier_id, v_total, p_payments, v_notes, v_movement_id, p_idempotency_key, v_user
  ) RETURNING id INTO v_payment_id;

  RETURN pg_catalog.jsonb_build_object('payment_id', v_payment_id, 'balance_after', v_balance - v_total);
END;
$function$;

-- public.void_supplier_payment(uuid,uuid,text): cobros_pagos (operate) [1 verificación(es)]
CREATE OR REPLACE FUNCTION public.void_supplier_payment(p_company_id uuid, p_payment_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_reason TEXT := pg_catalog.btrim(p_reason);
  v_payment public.supplier_payments%ROWTYPE;
  v_session_id UUID;
  v_in_id UUID;
  v_cash NUMERIC(14, 2);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  PERFORM private.assert_module_access(p_company_id, ARRAY['cobros_pagos'], 'operate');

  IF v_reason IS NULL OR v_reason = '' THEN
    RAISE EXCEPTION 'Indicá el motivo de la anulación.';
  END IF;
  IF pg_catalog.length(v_reason) > 500 THEN
    RAISE EXCEPTION 'El motivo no puede superar los 500 caracteres.';
  END IF;

  SELECT * INTO v_payment
  FROM public.supplier_payments sp
  WHERE sp.id = p_payment_id AND sp.company_id = p_company_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pago no encontrado en esta empresa.';
  END IF;
  IF v_payment.status = 'voided' THEN
    RAISE EXCEPTION 'Este pago ya está anulado.';
  END IF;

  IF v_payment.cash_movement_id IS NOT NULL THEN
    SELECT COALESCE(SUM((pay.value ->> 'amount')::NUMERIC), 0) INTO v_cash
    FROM pg_catalog.jsonb_array_elements(v_payment.payments) AS pay(value)
    WHERE pay.value ->> 'method' = 'efectivo';

    SELECT cs.id INTO v_session_id
    FROM public.cash_sessions cs
    WHERE cs.company_id = p_company_id AND cs.status = 'open';
    IF v_session_id IS NULL THEN
      RAISE EXCEPTION 'El efectivo de este pago salió de la caja: abrí la caja para anularlo y que el dinero vuelva a entrar.';
    END IF;
    v_in_id := (public.register_cash_movement(
      p_company_id, v_session_id, 'in', v_cash,
      pg_catalog.left('Anulación de pago a proveedor: ' || v_reason, 500)
    ) ->> 'movement_id')::UUID;
  END IF;

  UPDATE public.supplier_payments
  SET status = 'voided', voided_at = now(), voided_by = auth.uid(), void_reason = v_reason,
      void_cash_movement_id = v_in_id
  WHERE id = p_payment_id;

  RETURN pg_catalog.jsonb_build_object('payment_id', p_payment_id);
END;
$function$;

-- private.assert_report_period(uuid,date,date): informes (view) [1 verificación(es)]
CREATE OR REPLACE FUNCTION private.assert_report_period(p_company_id uuid, p_from date, p_to date)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tz TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  PERFORM private.assert_module_access(p_company_id, ARRAY['informes'], 'view');
  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
    RAISE EXCEPTION 'El período indicado no es válido.';
  END IF;
  IF p_to - p_from > 731 THEN
    RAISE EXCEPTION 'El período no puede superar los 2 años.';
  END IF;
  SELECT c.timezone INTO v_tz FROM public.companies c WHERE c.id = p_company_id;
  RETURN v_tz;
END;
$function$;

-- public.report_inventory_valuation(uuid): informes (view) [1 verificación(es)]
CREATE OR REPLACE FUNCTION public.report_inventory_valuation(p_company_id uuid)
 RETURNS TABLE(product_id uuid, sku text, product_name text, current_stock numeric, cost_price numeric, selling_price numeric, stock_value numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  PERFORM private.assert_module_access(p_company_id, ARRAY['informes'], 'view');
  RETURN QUERY
    SELECT p.id, p.sku, p.name, p.current_stock::NUMERIC,
           COALESCE(pc.cost_price, 0)::NUMERIC(14, 2),
           p.selling_price::NUMERIC(14, 2),
           (GREATEST(p.current_stock, 0) * COALESCE(pc.cost_price, 0))::NUMERIC(14, 2)
    FROM public.products p
    LEFT JOIN public.product_costs pc ON pc.product_id = p.id AND pc.company_id = p.company_id
    WHERE p.company_id = p_company_id AND p.is_active
    ORDER BY (GREATEST(p.current_stock, 0) * COALESCE(pc.cost_price, 0)) DESC, p.name;
END;
$function$;

-- upsert_machine(uuid,uuid,text,text,text,text,text,integer,text,text): maquinas (operate) [1 verificación(es)]
CREATE OR REPLACE FUNCTION public.upsert_machine(p_company_id uuid, p_machine_id uuid, p_name text, p_machine_type text, p_identifier text, p_brand text, p_model text, p_model_year integer, p_status text, p_notes text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_name TEXT := pg_catalog.btrim(COALESCE(p_name, ''));
  v_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  PERFORM private.assert_module_access(p_company_id, ARRAY['maquinas'], 'operate');

  IF v_name = '' THEN
    RAISE EXCEPTION 'Indicá el nombre de la máquina.';
  END IF;
  IF pg_catalog.length(v_name) > 100 THEN
    RAISE EXCEPTION 'El nombre no puede superar los 100 caracteres.';
  END IF;
  IF p_status NOT IN ('active', 'in_repair', 'inactive') THEN
    RAISE EXCEPTION 'Estado de máquina inválido.';
  END IF;
  IF p_model_year IS NOT NULL AND p_model_year NOT BETWEEN 1950 AND 2100 THEN
    RAISE EXCEPTION 'El año del modelo no es válido.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.machines m
    WHERE m.company_id = p_company_id AND pg_catalog.lower(m.name) = pg_catalog.lower(v_name)
      AND m.id IS DISTINCT FROM p_machine_id
  ) THEN
    RAISE EXCEPTION 'Ya existe una máquina con ese nombre.';
  END IF;

  IF p_machine_id IS NULL THEN
    INSERT INTO public.machines (
      company_id, name, machine_type, identifier, brand, model, model_year, status, notes, created_by
    ) VALUES (
      p_company_id, v_name, p_machine_type, NULLIF(pg_catalog.btrim(COALESCE(p_identifier, '')), ''),
      NULLIF(pg_catalog.btrim(COALESCE(p_brand, '')), ''), NULLIF(pg_catalog.btrim(COALESCE(p_model, '')), ''),
      p_model_year, p_status, NULLIF(pg_catalog.btrim(COALESCE(p_notes, '')), ''), auth.uid()
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE public.machines SET
      name = v_name, machine_type = p_machine_type,
      identifier = NULLIF(pg_catalog.btrim(COALESCE(p_identifier, '')), ''),
      brand = NULLIF(pg_catalog.btrim(COALESCE(p_brand, '')), ''),
      model = NULLIF(pg_catalog.btrim(COALESCE(p_model, '')), ''),
      model_year = p_model_year, status = p_status,
      notes = NULLIF(pg_catalog.btrim(COALESCE(p_notes, '')), ''), updated_at = now()
    WHERE id = p_machine_id AND company_id = p_company_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Máquina no encontrada en esta empresa.';
    END IF;
  END IF;

  RETURN v_id;
END;
$function$;

-- public.machine_costs(uuid,date,date): maquinas (view) [1 verificación(es)]
CREATE OR REPLACE FUNCTION public.machine_costs(p_company_id uuid, p_from date, p_to date)
 RETURNS TABLE(machine_id uuid, machine_name text, machine_type text, status text, expenses_count bigint, fuel_total numeric, maintenance_total numeric, other_total numeric, total numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  PERFORM private.assert_module_access(p_company_id, ARRAY['maquinas'], 'view');
  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
    RAISE EXCEPTION 'El período indicado no es válido.';
  END IF;
  IF p_to - p_from > 731 THEN
    RAISE EXCEPTION 'El período no puede superar los 2 años.';
  END IF;

  RETURN QUERY
    SELECT m.id, m.name, m.machine_type, m.status,
           COUNT(e.id)::BIGINT,
           COALESCE(SUM(e.amount) FILTER (WHERE e.category = 'combustible'), 0)::NUMERIC(14, 2),
           COALESCE(SUM(e.amount) FILTER (WHERE e.category IN ('mantenimiento', 'repuestos')), 0)::NUMERIC(14, 2),
           COALESCE(SUM(e.amount) FILTER (WHERE e.category NOT IN ('combustible', 'mantenimiento', 'repuestos')), 0)::NUMERIC(14, 2),
           COALESCE(SUM(e.amount), 0)::NUMERIC(14, 2)
    FROM public.machines m
    LEFT JOIN public.expenses e
      ON e.company_id = m.company_id AND e.machine_id = m.id AND e.status = 'active'
     AND e.expense_date BETWEEN p_from AND p_to
    WHERE m.company_id = p_company_id
    GROUP BY m.id, m.name, m.machine_type, m.status
    ORDER BY COALESCE(SUM(e.amount), 0) DESC, m.name;
END;
$function$;

-- upsert_employee(uuid,uuid,text,text,text,text,date,text,text): personal (operate) [1 verificación(es)]
CREATE OR REPLACE FUNCTION public.upsert_employee(p_company_id uuid, p_employee_id uuid, p_full_name text, p_document_number text, p_job_title text, p_phone text, p_hire_date date, p_status text, p_notes text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_name TEXT := pg_catalog.btrim(COALESCE(p_full_name, ''));
  v_doc TEXT := NULLIF(pg_catalog.btrim(COALESCE(p_document_number, '')), '');
  v_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  PERFORM private.assert_module_access(p_company_id, ARRAY['personal'], 'operate');

  IF v_name = '' THEN
    RAISE EXCEPTION 'Indicá el nombre del empleado.';
  END IF;
  IF p_status NOT IN ('active', 'inactive') THEN
    RAISE EXCEPTION 'Estado de empleado inválido.';
  END IF;
  IF v_doc IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.company_id = p_company_id AND e.document_number = v_doc AND e.id IS DISTINCT FROM p_employee_id
  ) THEN
    RAISE EXCEPTION 'Ya hay un empleado con ese documento.';
  END IF;

  IF p_employee_id IS NULL THEN
    INSERT INTO public.employees (company_id, full_name, document_number, job_title, phone, hire_date, status, notes, created_by)
    VALUES (
      p_company_id, v_name, v_doc, NULLIF(pg_catalog.btrim(COALESCE(p_job_title, '')), ''),
      NULLIF(pg_catalog.btrim(COALESCE(p_phone, '')), ''), p_hire_date, p_status,
      NULLIF(pg_catalog.btrim(COALESCE(p_notes, '')), ''), auth.uid()
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE public.employees SET
      full_name = v_name, document_number = v_doc,
      job_title = NULLIF(pg_catalog.btrim(COALESCE(p_job_title, '')), ''),
      phone = NULLIF(pg_catalog.btrim(COALESCE(p_phone, '')), ''),
      hire_date = p_hire_date, status = p_status,
      notes = NULLIF(pg_catalog.btrim(COALESCE(p_notes, '')), ''), updated_at = now()
    WHERE id = p_employee_id AND company_id = p_company_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Empleado no encontrado en esta empresa.';
    END IF;
  END IF;

  RETURN v_id;
END;
$function$;

-- public.set_employee_schedule(uuid,uuid,jsonb): personal (operate) [1 verificación(es)]
CREATE OR REPLACE FUNCTION public.set_employee_schedule(p_company_id uuid, p_employee_id uuid, p_blocks jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_block RECORD;
  v_count INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  PERFORM private.assert_module_access(p_company_id, ARRAY['personal'], 'operate');

  IF p_blocks IS NULL OR pg_catalog.jsonb_typeof(p_blocks) <> 'array' THEN
    RAISE EXCEPTION 'El horario debe ser una lista de bloques.';
  END IF;
  IF pg_catalog.jsonb_array_length(p_blocks) > 70 THEN
    RAISE EXCEPTION 'Demasiados bloques horarios.';
  END IF;

  PERFORM 1 FROM public.employees e WHERE e.id = p_employee_id AND e.company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Empleado no encontrado en esta empresa.';
  END IF;

  FOR v_block IN
    SELECT (b.value ->> 'weekday')::SMALLINT AS weekday, (b.value ->> 'start')::TIME AS start_time, (b.value ->> 'end')::TIME AS end_time
    FROM pg_catalog.jsonb_array_elements(p_blocks) AS b(value)
  LOOP
    IF v_block.weekday IS NULL OR v_block.weekday NOT BETWEEN 1 AND 7 THEN
      RAISE EXCEPTION 'Día de la semana inválido en el horario.';
    END IF;
    IF v_block.start_time IS NULL OR v_block.end_time IS NULL OR v_block.end_time <= v_block.start_time THEN
      RAISE EXCEPTION 'Cada bloque horario debe terminar después de empezar (dentro del mismo día).';
    END IF;
    v_count := v_count + 1;
  END LOOP;

  -- Los bloques de un mismo día no pueden superponerse ni repetirse
  IF EXISTS (
    WITH blocks AS (
      SELECT (x.value ->> 'weekday')::SMALLINT AS weekday, (x.value ->> 'start')::TIME AS start_time, (x.value ->> 'end')::TIME AS end_time
      FROM pg_catalog.jsonb_array_elements(p_blocks) AS x(value)
    )
    SELECT 1 FROM blocks a JOIN blocks b
      ON a.weekday = b.weekday AND a.start_time <> b.start_time
     AND a.start_time < b.end_time AND b.start_time < a.end_time
    UNION ALL
    SELECT 1 FROM blocks GROUP BY weekday, start_time, end_time HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Hay bloques horarios que se superponen en un mismo día.';
  END IF;

  DELETE FROM public.employee_schedules WHERE company_id = p_company_id AND employee_id = p_employee_id;
  INSERT INTO public.employee_schedules (company_id, employee_id, weekday, start_time, end_time)
  SELECT p_company_id, p_employee_id, (x.value ->> 'weekday')::SMALLINT, (x.value ->> 'start')::TIME, (x.value ->> 'end')::TIME
  FROM pg_catalog.jsonb_array_elements(p_blocks) AS x(value);

  RETURN v_count;
END;
$function$;

-- save_attendance(uuid,uuid,uuid,timestamp with time zone,timestamp with time zone,text): personal (operate) [1 verificación(es)]
CREATE OR REPLACE FUNCTION public.save_attendance(p_company_id uuid, p_employee_id uuid, p_record_id uuid, p_check_in timestamp with time zone, p_check_out timestamp with time zone, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_reason TEXT := pg_catalog.btrim(COALESCE(p_reason, ''));
  v_id UUID;
  v_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  PERFORM private.assert_module_access(p_company_id, ARRAY['personal'], 'operate');
  PERFORM private.lock_active_employee(p_company_id, p_employee_id);

  IF v_reason = '' THEN
    RAISE EXCEPTION 'Indicá el motivo de la carga o corrección.';
  END IF;
  IF pg_catalog.length(v_reason) > 500 THEN
    RAISE EXCEPTION 'El motivo no puede superar los 500 caracteres.';
  END IF;
  IF p_check_in IS NULL THEN
    RAISE EXCEPTION 'Indicá la hora de entrada.';
  END IF;
  IF p_check_in > now() OR (p_check_out IS NOT NULL AND p_check_out > now()) THEN
    RAISE EXCEPTION 'Las horas no pueden ser futuras.';
  END IF;
  IF p_check_out IS NOT NULL AND p_check_out <= p_check_in THEN
    RAISE EXCEPTION 'La salida tiene que ser posterior a la entrada.';
  END IF;
  IF p_check_out IS NOT NULL AND p_check_out - p_check_in > interval '24 hours' THEN
    RAISE EXCEPTION 'Un registro no puede durar más de 24 horas.';
  END IF;

  PERFORM private.assert_no_attendance_overlap(p_company_id, p_employee_id, p_record_id, p_check_in, p_check_out);

  IF p_record_id IS NULL THEN
    INSERT INTO public.attendance_records (company_id, employee_id, check_in, check_out, source, reason, created_by)
    VALUES (p_company_id, p_employee_id, p_check_in, p_check_out, 'manual', v_reason, auth.uid())
    RETURNING id INTO v_id;
  ELSE
    SELECT r.status INTO v_status FROM public.attendance_records r
    WHERE r.id = p_record_id AND r.company_id = p_company_id AND r.employee_id = p_employee_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Registro no encontrado.';
    END IF;
    IF v_status = 'voided' THEN
      RAISE EXCEPTION 'Un registro anulado no se puede corregir.';
    END IF;
    UPDATE public.attendance_records
    SET check_in = p_check_in, check_out = p_check_out, source = 'manual', reason = v_reason, updated_at = now()
    WHERE id = p_record_id
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$function$;

-- public.void_attendance(uuid,uuid,text): personal (operate) [1 verificación(es)]
CREATE OR REPLACE FUNCTION public.void_attendance(p_company_id uuid, p_record_id uuid, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_reason TEXT := pg_catalog.btrim(COALESCE(p_reason, ''));
  v_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  PERFORM private.assert_module_access(p_company_id, ARRAY['personal'], 'operate');
  IF v_reason = '' THEN
    RAISE EXCEPTION 'Indicá el motivo de la anulación.';
  END IF;
  IF pg_catalog.length(v_reason) > 500 THEN
    RAISE EXCEPTION 'El motivo no puede superar los 500 caracteres.';
  END IF;

  SELECT r.status INTO v_status FROM public.attendance_records r
  WHERE r.id = p_record_id AND r.company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro no encontrado.';
  END IF;
  IF v_status = 'voided' THEN
    RAISE EXCEPTION 'Este registro ya está anulado.';
  END IF;

  UPDATE public.attendance_records
  SET status = 'voided', voided_at = now(), voided_by = auth.uid(), void_reason = v_reason, updated_at = now()
  WHERE id = p_record_id;
  RETURN p_record_id;
END;
$function$;

-- public.attendance_report(uuid,date,date): personal (view) [1 verificación(es)]
CREATE OR REPLACE FUNCTION public.attendance_report(p_company_id uuid, p_from date, p_to date)
 RETURNS TABLE(employee_id uuid, employee_name text, days_worked bigint, worked_minutes bigint, scheduled_minutes bigint, late_count bigint, open_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tz TEXT;
  v_today DATE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  PERFORM private.assert_module_access(p_company_id, ARRAY['personal'], 'view');
  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
    RAISE EXCEPTION 'El período indicado no es válido.';
  END IF;
  IF p_to - p_from > 366 THEN
    RAISE EXCEPTION 'El período no puede superar 1 año.';
  END IF;

  SELECT c.timezone INTO v_tz FROM public.companies c WHERE c.id = p_company_id;
  v_today := (now() AT TIME ZONE v_tz)::DATE;

  RETURN QUERY
    WITH recs AS (
      SELECT r.employee_id, (r.check_in AT TIME ZONE v_tz) AS local_in, r.check_in, r.check_out
      FROM public.attendance_records r
      WHERE r.company_id = p_company_id AND r.status = 'active'
        AND (r.check_in AT TIME ZONE v_tz)::DATE BETWEEN p_from AND p_to
    ),
    first_in AS (
      SELECT x.employee_id, x.local_in::DATE AS d, MIN(x.local_in)::TIME AS first_time
      FROM recs x GROUP BY x.employee_id, x.local_in::DATE
    ),
    late AS (
      SELECT f.employee_id, COUNT(*) AS n
      FROM first_in f
      JOIN LATERAL (
        SELECT MIN(s.start_time) AS start_time FROM public.employee_schedules s
        WHERE s.company_id = p_company_id AND s.employee_id = f.employee_id AND s.weekday = EXTRACT(ISODOW FROM f.d)::INT
      ) sch ON sch.start_time IS NOT NULL
      WHERE f.first_time > sch.start_time + interval '10 minutes'
      GROUP BY f.employee_id
    ),
    planned AS (
      SELECT s.employee_id, SUM(EXTRACT(EPOCH FROM (s.end_time - s.start_time)) / 60)::BIGINT AS minutes
      FROM public.employee_schedules s
      JOIN generate_series(p_from, LEAST(p_to, v_today), interval '1 day') AS g(d)
        ON EXTRACT(ISODOW FROM g.d)::INT = s.weekday
      WHERE s.company_id = p_company_id
      GROUP BY s.employee_id
    ),
    worked AS (
      SELECT x.employee_id,
             COUNT(DISTINCT x.local_in::DATE) AS days,
             COALESCE(SUM(EXTRACT(EPOCH FROM (x.check_out - x.check_in)) / 60) FILTER (WHERE x.check_out IS NOT NULL), 0)::BIGINT AS minutes,
             COUNT(*) FILTER (WHERE x.check_out IS NULL) AS open_n
      FROM recs x GROUP BY x.employee_id
    )
    SELECT e.id, e.full_name,
           COALESCE(w.days, 0)::BIGINT, COALESCE(w.minutes, 0)::BIGINT, COALESCE(p.minutes, 0)::BIGINT,
           COALESCE(l.n, 0)::BIGINT, COALESCE(w.open_n, 0)::BIGINT
    FROM public.employees e
    LEFT JOIN worked w ON w.employee_id = e.id
    LEFT JOIN planned p ON p.employee_id = e.id
    LEFT JOIN late l ON l.employee_id = e.id
    WHERE e.company_id = p_company_id AND (e.status = 'active' OR w.days IS NOT NULL)
    ORDER BY e.full_name;
END;
$function$;

-- public.clock_in(uuid,uuid): fichaje/personal (operate) [1 verificación(es)]
CREATE OR REPLACE FUNCTION public.clock_in(p_company_id uuid, p_employee_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_open TIMESTAMPTZ;
  v_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  -- Cualquier miembro activo de la empresa (administrador o empleado)
  PERFORM private.assert_module_access(p_company_id, ARRAY['fichaje', 'personal'], 'operate');
  PERFORM private.lock_active_employee(p_company_id, p_employee_id);

  SELECT r.check_in INTO v_open
  FROM public.attendance_records r
  WHERE r.company_id = p_company_id AND r.employee_id = p_employee_id AND r.status = 'active' AND r.check_out IS NULL;
  IF FOUND THEN
    RAISE EXCEPTION 'El empleado ya tiene una entrada abierta: primero marcá su salida.';
  END IF;

  INSERT INTO public.attendance_records (company_id, employee_id, check_in, source, created_by)
  VALUES (p_company_id, p_employee_id, clock_timestamp(), 'clock', auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

-- public.clock_out(uuid,uuid): fichaje/personal (operate) [1 verificación(es)]
CREATE OR REPLACE FUNCTION public.clock_out(p_company_id uuid, p_employee_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_id UUID;
  v_in TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  -- Cualquier miembro activo de la empresa (administrador o empleado)
  PERFORM private.assert_module_access(p_company_id, ARRAY['fichaje', 'personal'], 'operate');
  PERFORM private.lock_active_employee(p_company_id, p_employee_id);

  SELECT r.id, r.check_in INTO v_id, v_in
  FROM public.attendance_records r
  WHERE r.company_id = p_company_id AND r.employee_id = p_employee_id AND r.status = 'active' AND r.check_out IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El empleado no tiene una entrada abierta: primero marcá su entrada.';
  END IF;
  IF clock_timestamp() <= v_in THEN
    RAISE EXCEPTION 'La salida tiene que ser posterior a la entrada.';
  END IF;

  UPDATE public.attendance_records SET check_out = clock_timestamp(), updated_at = now() WHERE id = v_id;
  RETURN v_id;
END;
$function$;

-- clock_roster(uuid,integer,timestamp with time zone): fichaje/personal (view) [1 verificación(es)]
CREATE OR REPLACE FUNCTION public.clock_roster(p_company_id uuid, p_weekday integer, p_since timestamp with time zone)
 RETURNS TABLE(employee_id uuid, full_name text, job_title text, schedule jsonb, records jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_since TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  PERFORM private.assert_module_access(p_company_id, ARRAY['fichaje', 'personal'], 'view');
  IF p_weekday IS NULL OR p_weekday NOT BETWEEN 1 AND 7 THEN
    RAISE EXCEPTION 'Día de la semana inválido.';
  END IF;
  v_since := GREATEST(COALESCE(p_since, now() - interval '36 hours'), now() - interval '36 hours');

  RETURN QUERY
  SELECT
    e.id,
    e.full_name,
    e.job_title,
    COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'start', pg_catalog.to_char(s.start_time, 'HH24:MI'),
          'end', pg_catalog.to_char(s.end_time, 'HH24:MI')
        ) ORDER BY s.start_time)
      FROM public.employee_schedules s
      WHERE s.company_id = e.company_id AND s.employee_id = e.id AND s.weekday = p_weekday
    ), '[]'::JSONB),
    COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('id', r.id, 'checkIn', r.check_in, 'checkOut', r.check_out)
        ORDER BY r.check_in)
      FROM public.attendance_records r
      WHERE r.company_id = e.company_id AND r.employee_id = e.id AND r.status = 'active'
        AND (r.check_in >= v_since OR r.check_out IS NULL)
    ), '[]'::JSONB)
  FROM public.employees e
  WHERE e.company_id = p_company_id AND e.status = 'active'
  ORDER BY e.full_name;
END;
$function$;

-- Anulación de documentos: con p_module se exige ese módulo (operar); sin él, solo administrador
CREATE OR REPLACE FUNCTION private.prepare_document_cancellation(p_company_id uuid, p_document_id uuid, p_reason text, p_module text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  IF p_module IS NULL THEN
    PERFORM private.assert_company_role(p_company_id, 'master_admin');
  ELSE
    PERFORM private.assert_module_access(p_company_id, ARRAY[p_module], 'operate');
  END IF;

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
  IF p_module IS NULL THEN
    PERFORM private.assert_company_role(p_company_id, 'master_admin');
  ELSE
    PERFORM private.assert_module_access(p_company_id, ARRAY[p_module], 'operate');
  END IF;

  IF v_reason IS NULL OR v_reason = '' THEN
    RAISE EXCEPTION 'Se requiere indicar el motivo de la anulación.';
  END IF;

  IF pg_catalog.length(v_reason) > 500 THEN
    RAISE EXCEPTION 'El motivo de la anulación no puede superar los 500 caracteres.';
  END IF;

  RETURN v_reason;
END;
$function$;

REVOKE ALL ON FUNCTION private.prepare_document_cancellation(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.prepare_document_cancellation(p_company_id uuid, p_document_id uuid, p_reason text)
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT private.prepare_document_cancellation(p_company_id, p_document_id, p_reason, NULL::TEXT);
$function$;

-- cancel_purchase: exige el módulo compras (operar)
CREATE OR REPLACE FUNCTION public.cancel_purchase(p_company_id uuid, p_purchase_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_reason TEXT;
  v_purchase RECORD;
  v_item RECORD;
  v_movement_id UUID;
  v_now TIMESTAMPTZ := pg_catalog.now();
BEGIN
  v_reason := private.prepare_document_cancellation(p_company_id, p_purchase_id, p_reason, 'compras');

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
$function$;

-- ----------------------------------------------------------------------------
-- 5. LECTURAS (RLS): del rol fijo al permiso por módulo
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "purchases_select_admin" ON public.purchases;
DROP POLICY IF EXISTS "purchases_select_module" ON public.purchases;
CREATE POLICY "purchases_select_module" ON public.purchases FOR SELECT TO authenticated
  USING (company_id IN (SELECT private.my_active_company_ids()) AND private.has_module_level(company_id, ARRAY['compras'], 'view'));

DROP POLICY IF EXISTS "purchase_items_select_admin" ON public.purchase_items;
DROP POLICY IF EXISTS "purchase_items_select_module" ON public.purchase_items;
CREATE POLICY "purchase_items_select_module" ON public.purchase_items FOR SELECT TO authenticated
  USING (company_id IN (SELECT private.my_active_company_ids()) AND private.has_module_level(company_id, ARRAY['compras'], 'view'));

DROP POLICY IF EXISTS "credit_purchases_select_admin" ON public.credit_purchases;
DROP POLICY IF EXISTS "credit_purchases_select_module" ON public.credit_purchases;
CREATE POLICY "credit_purchases_select_module" ON public.credit_purchases FOR SELECT TO authenticated
  USING (company_id IN (SELECT private.my_active_company_ids()) AND private.has_module_level(company_id, ARRAY['compras'], 'view'));

DROP POLICY IF EXISTS "expenses_select_admin" ON public.expenses;
DROP POLICY IF EXISTS "expenses_select_module" ON public.expenses;
CREATE POLICY "expenses_select_module" ON public.expenses FOR SELECT TO authenticated
  USING (company_id IN (SELECT private.my_active_company_ids()) AND private.has_module_level(company_id, ARRAY['gastos'], 'view'));

DROP POLICY IF EXISTS "customer_payments_select_member" ON public.customer_payments;
DROP POLICY IF EXISTS "customer_payments_select_module" ON public.customer_payments;
CREATE POLICY "customer_payments_select_module" ON public.customer_payments FOR SELECT TO authenticated
  USING (company_id IN (SELECT private.my_accessible_company_ids()) AND private.has_module_level(company_id, ARRAY['cobros_pagos'], 'view'));

DROP POLICY IF EXISTS "supplier_payments_select_admin" ON public.supplier_payments;
DROP POLICY IF EXISTS "supplier_payments_select_module" ON public.supplier_payments;
CREATE POLICY "supplier_payments_select_module" ON public.supplier_payments FOR SELECT TO authenticated
  USING (company_id IN (SELECT private.my_active_company_ids()) AND private.has_module_level(company_id, ARRAY['cobros_pagos'], 'view'));

DROP POLICY IF EXISTS "machines_select_admin" ON public.machines;
DROP POLICY IF EXISTS "machines_select_module" ON public.machines;
CREATE POLICY "machines_select_module" ON public.machines FOR SELECT TO authenticated
  USING (company_id IN (SELECT private.my_active_company_ids()) AND private.has_module_level(company_id, ARRAY['maquinas'], 'view'));

DROP POLICY IF EXISTS "employees_select_admin" ON public.employees;
DROP POLICY IF EXISTS "employees_select_module" ON public.employees;
CREATE POLICY "employees_select_module" ON public.employees FOR SELECT TO authenticated
  USING (company_id IN (SELECT private.my_active_company_ids()) AND private.has_module_level(company_id, ARRAY['personal'], 'view'));

DROP POLICY IF EXISTS "employee_schedules_select_admin" ON public.employee_schedules;
DROP POLICY IF EXISTS "employee_schedules_select_module" ON public.employee_schedules;
CREATE POLICY "employee_schedules_select_module" ON public.employee_schedules FOR SELECT TO authenticated
  USING (company_id IN (SELECT private.my_active_company_ids()) AND private.has_module_level(company_id, ARRAY['personal'], 'view'));

DROP POLICY IF EXISTS "attendance_records_select_admin" ON public.attendance_records;
DROP POLICY IF EXISTS "attendance_records_select_module" ON public.attendance_records;
CREATE POLICY "attendance_records_select_module" ON public.attendance_records FOR SELECT TO authenticated
  USING (company_id IN (SELECT private.my_active_company_ids()) AND private.has_module_level(company_id, ARRAY['personal'], 'view'));

