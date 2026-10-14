# 03. Funciones Atómicas de Negocio (PL/pgSQL)
**Módulo:** Lógica de Servidor, Transaccionalidad Atómica y Procedimientos Almacenados Multiempresa (Pooled SaaS)  
**Versión:** 2.0  
**Fecha:** Octubre 2026  

---

## 1. Convenciones y Estándares de Seguridad Multiempresa

Todas las funciones expuestas de la API cumplen con las siguientes reglas arquitectónicas:
1. **Identificación Obligatoria de Tenant:** Todas las funciones operativas reciben obligatoriamente el parámetro `p_company_id UUID`.
2. **Validación de Membresía y Empresa Activa:** Se invoca de forma obligatoria `PERFORM private.assert_company_role(p_company_id, ...)` al inicio de la función. Si la empresa o la membresía del usuario se encuentran inactivas (`is_active = false`), la ejecución se aborta de inmediato con excepción controlada.
3. **Seguridad Estricta:** Se declaran con `SECURITY DEFINER` y `SET search_path = ''` para evitar secuestro de esquemas, con referencias 100% calificadas (`public.*`, `private.*`, `pg_catalog.*`).
4. **Revocación Universal:**
   ```sql
   REVOKE ALL ON FUNCTION public.<nombre> FROM PUBLIC, anon;
   GRANT EXECUTE ON FUNCTION public.<nombre> TO authenticated;
   ```
5. **Numeración Comercial Transaccional:** Se prohibe el uso de secuencias globales (`nextval`). La numeración de ventas y compras se serializa mediante bloqueo pesimista en `public.company_counters (company_id, kind) FOR UPDATE`.
6. **Protección Anti-Deadlocks:** El bloqueo de registros múltiples (productos en ventas/compras) se ejecuta siempre ordenado ascendentemente por su clave primaria `id`.

---

## 2. Utilidad de Fecha Local por Empresa: `local_today()`

```sql
CREATE OR REPLACE FUNCTION public.local_today(p_company_id UUID)
RETURNS DATE
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (pg_catalog.now() AT TIME ZONE COALESCE(
    (SELECT timezone FROM public.companies WHERE id = p_company_id),
    'America/Argentina/Buenos_Aires'
  ))::date;
$$;

REVOKE ALL ON FUNCTION public.local_today(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.local_today(UUID) TO authenticated;
```

---

## 3. Gobernanza de Empresas, Membresías y Roles

### 3.1. `create_company()` (Creación de Nuevo Tenant)
```sql
CREATE OR REPLACE FUNCTION public.create_company(
  p_name TEXT,
  p_tax_id TEXT,
  p_currency TEXT DEFAULT 'ARS',
  p_timezone TEXT DEFAULT 'America/Argentina/Buenos_Aires'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company_id UUID;
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  IF p_name IS NULL OR pg_catalog.trim(p_name) = '' THEN
    RAISE EXCEPTION 'El nombre de la empresa es obligatorio';
  END IF;

  -- 1. Crear empresa asignando al creador como created_by y titular vigente owner_id
  INSERT INTO public.companies (
    name, tax_id, currency, timezone, is_active, created_by, owner_id
  ) VALUES (
    p_name, p_tax_id, COALESCE(p_currency, 'ARS'), COALESCE(p_timezone, 'America/Argentina/Buenos_Aires'), true, v_user_id, v_user_id
  ) RETURNING id INTO v_company_id;

  -- 2. Asignar membresía master_admin activa al creador
  INSERT INTO public.company_members (
    company_id, user_id, role, is_active
  ) VALUES (
    v_company_id, v_user_id, 'master_admin', true
  );

  -- 3. Inicializar contadores transaccionales para ventas y compras
  INSERT INTO public.company_counters (company_id, kind, last_value)
  VALUES 
    (v_company_id, 'sale', 0),
    (v_company_id, 'purchase', 0);

  RETURN v_company_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_company(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_company(TEXT, TEXT, TEXT, TEXT) TO authenticated;
```

### 3.2. `invite_user_to_company()` (Invitación con Jerarquía Estricta)
```sql
CREATE OR REPLACE FUNCTION public.invite_user_to_company(
  p_company_id UUID,
  p_email TEXT,
  p_role TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invitation_id UUID;
  v_token_raw TEXT;
  v_token_hash TEXT;
  v_owner_id UUID;
BEGIN
  -- Validar membresía activa como master_admin
  PERFORM private.assert_company_role(p_company_id, 'master_admin');

  -- Bloqueo pesimista en companies para serializar operaciones de miembros
  SELECT owner_id INTO v_owner_id
  FROM public.companies
  WHERE id = p_company_id
  FOR NO KEY UPDATE;

  IF p_role NOT IN ('master_admin', 'employee') THEN
    RAISE EXCEPTION 'Rol inválido: %. Permitidos: master_admin, employee', p_role;
  END IF;

  -- Regla de Jerarquía: Solo el titular vigente (owner_id) puede invitar administradores
  IF p_role = 'master_admin' AND auth.uid() != v_owner_id THEN
    RAISE EXCEPTION 'Solo el titular de la empresa puede invitar o promover administradores (master_admin)';
  END IF;

  -- Validar que no sea ya un miembro activo
  IF EXISTS (
    SELECT 1 FROM public.company_members cm
    JOIN public.profiles p ON p.id = cm.user_id
    WHERE cm.company_id = p_company_id AND p.email = p_email AND cm.is_active = true
  ) THEN
    RAISE EXCEPTION 'El usuario con email % ya es un miembro activo de la empresa', p_email;
  END IF;

  -- Generar token aleatorio y su hash SHA-256
  v_token_raw := encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(digest(v_token_raw, 'sha256'), 'hex');

  INSERT INTO public.company_invitations (
    company_id, email, role, token_hash, invited_by, status, expires_at
  ) VALUES (
    p_company_id, p_email, p_role, v_token_hash, auth.uid(), 'pending', (pg_catalog.now() + interval '7 days')
  ) RETURNING id INTO v_invitation_id;

  -- Retorna el ID de invitación. El servicio de correo recibe v_token_raw para el link
  RETURN v_invitation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.invite_user_to_company(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invite_user_to_company(UUID, TEXT, TEXT) TO authenticated;
```

### 3.3. `accept_company_invitation()` (Aceptación de Invitación)
```sql
CREATE OR REPLACE FUNCTION public.accept_company_invitation(
  p_token TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_token_hash TEXT;
  v_invitation RECORD;
  v_user_email TEXT;
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  SELECT email INTO v_user_email FROM public.profiles WHERE id = v_user_id;

  v_token_hash := encode(digest(p_token, 'sha256'), 'hex');

  -- Bloqueo de la invitación
  SELECT * INTO v_invitation
  FROM public.company_invitations
  WHERE token_hash = v_token_hash AND status = 'pending' AND expires_at > pg_catalog.now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitación no válida, expirada o ya procesada';
  END IF;

  IF lower(v_invitation.email) != lower(v_user_email) THEN
    RAISE EXCEPTION 'La invitación fue emitida para % pero ha iniciado sesión como %', v_invitation.email, v_user_email;
  END IF;

  -- Bloquear fila de la empresa para consistencia
  PERFORM 1 FROM public.companies WHERE id = v_invitation.company_id AND is_active = true FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La empresa receptora se encuentra inactiva o deshabilitada';
  END IF;

  -- Insertar o reactivar membresía
  INSERT INTO public.company_members (company_id, user_id, role, is_active)
  VALUES (v_invitation.company_id, v_user_id, v_invitation.role, true)
  ON CONFLICT (company_id, user_id) DO UPDATE
  SET role = EXCLUDED.role, is_active = true, updated_at = pg_catalog.now();

  -- Marcar invitación como aceptada
  UPDATE public.company_invitations
  SET status = 'accepted', accepted_at = pg_catalog.now()
  WHERE id = v_invitation.id;

  RETURN v_invitation.company_id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_company_invitation(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_company_invitation(TEXT) TO authenticated;
```

### 3.4. `transfer_company_ownership()` (Traspaso Atómico de Titularidad)
```sql
CREATE OR REPLACE FUNCTION public.transfer_company_ownership(
  p_company_id UUID,
  p_new_owner_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current_owner UUID;
BEGIN
  -- Bloqueo pesimista exclusivo de la empresa
  SELECT owner_id INTO v_current_owner
  FROM public.companies
  WHERE id = p_company_id AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Empresa no encontrada o inactiva';
  END IF;

  IF auth.uid() != v_current_owner THEN
    RAISE EXCEPTION 'Solo el titular vigente (owner_id) puede transferir la titularidad de la empresa';
  END IF;

  IF p_new_owner_user_id = v_current_owner THEN
    RAISE EXCEPTION 'El usuario seleccionado ya es el titular de la empresa';
  END IF;

  -- Validar que el nuevo titular sea un master_admin activo
  IF NOT EXISTS (
    SELECT 1 FROM public.company_members
    WHERE company_id = p_company_id AND user_id = p_new_owner_user_id AND role = 'master_admin' AND is_active = true
  ) THEN
    RAISE EXCEPTION 'El nuevo titular debe ser un miembro activo con rol master_admin';
  END IF;

  -- Actualizar titularidad vigente
  UPDATE public.companies
  SET owner_id = p_new_owner_user_id, updated_at = pg_catalog.now()
  WHERE id = p_company_id;
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_company_ownership(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_company_ownership(UUID, UUID) TO authenticated;
```

### 3.5. `reactivate_member()` (Reactivación Administrativa Explícita)
```sql
CREATE OR REPLACE FUNCTION public.reactivate_member(
  p_company_id UUID,
  p_user_id UUID,
  p_new_role TEXT,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner_id UUID;
BEGIN
  PERFORM private.assert_company_role(p_company_id, 'master_admin');

  SELECT owner_id INTO v_owner_id FROM public.companies WHERE id = p_company_id FOR NO KEY UPDATE;

  IF p_new_role NOT IN ('master_admin', 'employee') THEN
    RAISE EXCEPTION 'Rol inválido: %', p_new_role;
  END IF;

  -- Jerarquía: Asignar master_admin requiere ser titular vigente
  IF p_new_role = 'master_admin' AND auth.uid() != v_owner_id THEN
    RAISE EXCEPTION 'Solo el titular vigente de la empresa puede reactivar a un usuario con rol master_admin';
  END IF;

  IF p_reason IS NULL OR pg_catalog.trim(p_reason) = '' THEN
    RAISE EXCEPTION 'Debe especificar el motivo de reactivación';
  END IF;

  PERFORM 1 FROM public.company_members
  WHERE company_id = p_company_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membresía no encontrada para este usuario';
  END IF;

  UPDATE public.company_members
  SET is_active = true, role = p_new_role, updated_at = pg_catalog.now()
  WHERE company_id = p_company_id AND user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reactivate_member(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reactivate_member(UUID, UUID, TEXT, TEXT) TO authenticated;
```

### 3.6. `deactivate_company()` (Baja Lógica de Empresa)
```sql
CREATE OR REPLACE FUNCTION public.deactivate_company(
  p_company_id UUID,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner_id UUID;
BEGIN
  SELECT owner_id INTO v_owner_id
  FROM public.companies
  WHERE id = p_company_id AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Empresa no encontrada o ya se encuentra deshabilitada';
  END IF;

  IF auth.uid() != v_owner_id THEN
    RAISE EXCEPTION 'Solo el titular vigente (owner_id) puede desactivar la empresa';
  END IF;

  IF p_reason IS NULL OR pg_catalog.trim(p_reason) = '' THEN
    RAISE EXCEPTION 'Debe proporcionar un motivo para la baja de la empresa';
  END IF;

  UPDATE public.companies
  SET is_active = false, updated_at = pg_catalog.now()
  WHERE id = p_company_id;
END;
$$;

REVOKE ALL ON FUNCTION public.deactivate_company(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deactivate_company(UUID, TEXT) TO authenticated;
```

---

## 4. Circuito de Ventas: `process_sale()` y `cancel_sale()`

### 4.1. `process_sale()`
```sql
CREATE OR REPLACE FUNCTION public.process_sale(
  p_company_id UUID,
  p_customer_id UUID,
  p_items JSONB,       -- [{ product_id: UUID, quantity: NUMERIC }]
  p_payments JSONB,    -- [{ payment_method: TEXT, amount: NUMERIC }]
  p_discount NUMERIC,  -- Monto fijo de descuento
  p_notes TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sale_id UUID;
  v_sale_number TEXT;
  v_subtotal NUMERIC(14, 2) := 0.00;
  v_total_amount NUMERIC(14, 2);
  v_total_payments NUMERIC(14, 2) := 0.00;
  v_product_ids UUID[];
  v_item RECORD;
  v_payment RECORD;
  v_prod RECORD;
  v_cost NUMERIC(14, 2);
  v_movement_id UUID;
  v_is_admin BOOLEAN;
  v_next_counter BIGINT;
BEGIN
  -- Validar membresía y que la empresa esté activa
  PERFORM private.assert_company_role(p_company_id, NULL);

  v_is_admin := private.has_company_role(p_company_id, 'master_admin');

  IF COALESCE(p_discount, 0) > 0 AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Solo usuarios con rol master_admin pueden autorizar descuentos';
  END IF;

  SELECT array_agg((value->>'product_id')::UUID) INTO v_product_ids
  FROM jsonb_array_elements(p_items);

  IF v_product_ids IS NULL OR array_length(v_product_ids, 1) = 0 THEN
    RAISE EXCEPTION 'El detalle de venta no puede estar vacío';
  END IF;

  IF (SELECT count(*) FROM unnest(v_product_ids)) != (SELECT count(DISTINCT x) FROM unnest(v_product_ids) x) THEN
    RAISE EXCEPTION 'Existen productos duplicados en el detalle de la venta';
  END IF;

  -- Bloquear productos de la empresa en orden determinístico anti-deadlocks
  FOR v_prod IN
    SELECT id, name, selling_price, is_active
    FROM public.products
    WHERE id = ANY(v_product_ids) AND company_id = p_company_id
    ORDER BY id
    FOR UPDATE
  LOOP
    IF NOT v_prod.is_active THEN
      RAISE EXCEPTION 'El producto % está inactivo y no puede ser vendido', v_prod.name;
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM public.products WHERE id = ANY(v_product_ids) AND company_id = p_company_id) != array_length(v_product_ids, 1) THEN
    RAISE EXCEPTION 'Uno o más productos del detalle no pertenecen a esta empresa o no existen';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id UUID, quantity NUMERIC) LOOP
    IF v_item.quantity <= 0 THEN
      RAISE EXCEPTION 'La cantidad debe ser mayor a 0 para cada producto';
    END IF;
    SELECT selling_price INTO v_prod.selling_price FROM public.products WHERE id = v_item.product_id AND company_id = p_company_id;
    v_subtotal := v_subtotal + ROUND(v_prod.selling_price * v_item.quantity, 2);
  END LOOP;

  IF p_discount > v_subtotal THEN
    RAISE EXCEPTION 'El descuento no puede superar el subtotal de la venta';
  END IF;

  v_total_amount := v_subtotal - COALESCE(p_discount, 0);

  IF v_total_amount = 0 THEN
    IF NOT v_is_admin THEN
      RAISE EXCEPTION 'Ventas con total $0.00 requieren autorización de master_admin';
    END IF;
  ELSE
    FOR v_payment IN SELECT * FROM jsonb_to_recordset(p_payments) AS x(payment_method TEXT, amount NUMERIC) LOOP
      IF v_payment.amount <= 0 THEN
        RAISE EXCEPTION 'El importe de cada medio de pago debe ser mayor a 0';
      END IF;
      v_total_payments := v_total_payments + v_payment.amount;
    END LOOP;

    IF v_total_payments != v_total_amount THEN
      RAISE EXCEPTION 'La suma de los pagos (% ARS) no coincide con el total de la venta (% ARS)', v_total_payments, v_total_amount;
    END IF;
  END IF;

  -- Numeración correlativa por empresa mediante company_counters (FOR UPDATE)
  SELECT last_value + 1 INTO v_next_counter
  FROM public.company_counters
  WHERE company_id = p_company_id AND kind = 'sale'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contador de ventas no configurado para esta empresa';
  END IF;

  UPDATE public.company_counters
  SET last_value = v_next_counter
  WHERE company_id = p_company_id AND kind = 'sale';

  v_sale_number := 'VTA-' || lpad(v_next_counter::text, 8, '0');

  -- Insertar venta
  INSERT INTO public.sales (
    company_id, sale_number, customer_id, status, subtotal, discount, total_amount, notes, created_by
  ) VALUES (
    p_company_id, v_sale_number, p_customer_id, 'completed', v_subtotal, COALESCE(p_discount, 0), v_total_amount, p_notes, auth.uid()
  ) RETURNING id INTO v_sale_id;

  -- Procesar cada ítem: detalle, stock y costo congelado
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id UUID, quantity NUMERIC) LOOP
    SELECT selling_price INTO v_prod.selling_price FROM public.products WHERE id = v_item.product_id AND company_id = p_company_id;
    SELECT cost_price INTO v_cost FROM public.product_costs WHERE product_id = v_item.product_id AND company_id = p_company_id;

    INSERT INTO public.sale_items (company_id, sale_id, product_id, quantity, unit_price, subtotal)
    VALUES (p_company_id, v_sale_id, v_item.product_id, v_item.quantity, v_prod.selling_price, ROUND(v_prod.selling_price * v_item.quantity, 2));

    -- Movimiento de stock (trigger sync_product_stock descuenta stock)
    INSERT INTO public.stock_movements (
      company_id, product_id, direction, reason, quantity, reference_sale_id, created_by
    ) VALUES (
      p_company_id, v_item.product_id, 'decrease', 'sale', v_item.quantity, v_sale_id, auth.uid()
    ) RETURNING id INTO v_movement_id;

    -- Congelar costo histórico en movement_costs
    INSERT INTO public.movement_costs (company_id, movement_id, unit_cost, total_cost)
    VALUES (p_company_id, v_movement_id, COALESCE(v_cost, 0.00), ROUND(COALESCE(v_cost, 0.00) * v_item.quantity, 2));
  END LOOP;

  -- Asentar pagos en transactions
  IF v_total_amount = 0 THEN
    INSERT INTO public.transactions (
      company_id, type, category, amount, payment_method, status, reference_sale_id, description, transaction_date, created_by
    ) VALUES (
      p_company_id, 'income', 'sale', 0.00, 'courtesy', 'completed', v_sale_id, 'Venta bonificada / cortesía ' || v_sale_number, public.local_today(p_company_id), auth.uid()
    );
  ELSE
    FOR v_payment IN SELECT * FROM jsonb_to_recordset(p_payments) AS x(payment_method TEXT, amount NUMERIC) LOOP
      INSERT INTO public.transactions (
        company_id, type, category, amount, payment_method, status, reference_sale_id, description, transaction_date, created_by
      ) VALUES (
        p_company_id, 'income', 'sale', v_payment.amount, v_payment.payment_method, 'completed', v_sale_id, 'Cobro venta ' || v_sale_number, public.local_today(p_company_id), auth.uid()
      );
    END LOOP;
  END IF;

  RETURN v_sale_id;
END;
$$;

REVOKE ALL ON FUNCTION public.process_sale(UUID, UUID, JSONB, JSONB, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_sale(UUID, UUID, JSONB, JSONB, NUMERIC, TEXT) TO authenticated;
```

### 4.2. `cancel_sale()`
```sql
CREATE OR REPLACE FUNCTION public.cancel_sale(
  p_company_id UUID,
  p_sale_id UUID,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item RECORD;
  v_orig_cost NUMERIC(14, 2);
  v_mov_id UUID;
BEGIN
  PERFORM private.assert_company_role(p_company_id, 'master_admin');

  IF p_reason IS NULL OR pg_catalog.trim(p_reason) = '' THEN
    RAISE EXCEPTION 'El motivo de anulación es obligatorio';
  END IF;

  PERFORM set_config('stockapp.allow_cancellation', 'true', true);

  PERFORM 1 FROM public.sales
  WHERE id = p_sale_id AND company_id = p_company_id AND status = 'completed'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venta no encontrada o ya anulada en esta empresa';
  END IF;

  UPDATE public.sales
  SET status = 'cancelled', cancelled_at = pg_catalog.now(), cancelled_by = auth.uid(), cancel_reason = p_reason
  WHERE id = p_sale_id AND company_id = p_company_id;

  -- Revertir existencias mediante movimientos compensatorios
  FOR v_item IN
    SELECT product_id, quantity
    FROM public.sale_items
    WHERE sale_id = p_sale_id AND company_id = p_company_id
    ORDER BY product_id
  LOOP
    PERFORM 1 FROM public.products WHERE id = v_item.product_id AND company_id = p_company_id FOR UPDATE;

    SELECT mc.unit_cost INTO v_orig_cost
    FROM public.stock_movements sm
    JOIN public.movement_costs mc ON mc.movement_id = sm.id AND mc.company_id = p_company_id
    WHERE sm.reference_sale_id = p_sale_id AND sm.product_id = v_item.product_id AND sm.company_id = p_company_id;

    INSERT INTO public.stock_movements (
      company_id, product_id, direction, reason, quantity, reference_sale_id, notes, created_by
    ) VALUES (
      p_company_id, v_item.product_id, 'increase', 'cancellation', v_item.quantity, p_sale_id, 'Anulación venta: ' || p_reason, auth.uid()
    ) RETURNING id INTO v_mov_id;

    INSERT INTO public.movement_costs (company_id, movement_id, unit_cost, total_cost)
    VALUES (p_company_id, v_mov_id, COALESCE(v_orig_cost, 0.00), ROUND(COALESCE(v_orig_cost, 0.00) * v_item.quantity, 2));
  END LOOP;

  UPDATE public.transactions
  SET status = 'cancelled'
  WHERE reference_sale_id = p_sale_id AND company_id = p_company_id;

  PERFORM set_config('stockapp.allow_cancellation', 'false', true);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_sale(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_sale(UUID, UUID, TEXT) TO authenticated;
```

---

## 5. Circuito de Compras: `register_purchase()` y `cancel_purchase()`

### 5.1. `register_purchase()`
```sql
CREATE OR REPLACE FUNCTION public.register_purchase(
  p_company_id UUID,
  p_supplier_id UUID,
  p_items JSONB,             -- [{ product_id: UUID, quantity: NUMERIC, unit_cost: NUMERIC }]
  p_payment_method TEXT,
  p_reference_doc TEXT,
  p_notes TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_purchase_id UUID;
  v_purchase_number TEXT;
  v_total_amount NUMERIC(14, 2) := 0.00;
  v_item RECORD;
  v_product_ids UUID[];
  v_movement_id UUID;
  v_next_counter BIGINT;
BEGIN
  PERFORM private.assert_company_role(p_company_id, 'master_admin');

  SELECT array_agg((value->>'product_id')::UUID) INTO v_product_ids FROM jsonb_array_elements(p_items);

  -- Bloquear productos ordenados anti-deadlocks
  PERFORM 1 FROM public.products
  WHERE id = ANY(v_product_ids) AND company_id = p_company_id
  ORDER BY id FOR UPDATE;

  IF (SELECT count(*) FROM public.products WHERE id = ANY(v_product_ids) AND company_id = p_company_id) != array_length(v_product_ids, 1) THEN
    RAISE EXCEPTION 'Uno o más productos no pertenecen a esta empresa';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id UUID, quantity NUMERIC, unit_cost NUMERIC) LOOP
    IF v_item.quantity <= 0 OR v_item.unit_cost < 0 THEN
      RAISE EXCEPTION 'Cantidad debe ser > 0 y costo >= 0';
    END IF;
    v_total_amount := v_total_amount + ROUND(v_item.quantity * v_item.unit_cost, 2);
  END LOOP;

  -- Numeración correlativa por empresa
  SELECT last_value + 1 INTO v_next_counter
  FROM public.company_counters
  WHERE company_id = p_company_id AND kind = 'purchase'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contador de compras no configurado para esta empresa';
  END IF;

  UPDATE public.company_counters
  SET last_value = v_next_counter
  WHERE company_id = p_company_id AND kind = 'purchase';

  v_purchase_number := 'COM-' || lpad(v_next_counter::text, 8, '0');

  INSERT INTO public.purchases (
    company_id, purchase_number, supplier_id, status, total_amount, payment_method, reference_doc, notes, created_by
  ) VALUES (
    p_company_id, v_purchase_number, p_supplier_id, 'completed', v_total_amount, p_payment_method, p_reference_doc, p_notes, auth.uid()
  ) RETURNING id INTO v_purchase_id;

  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id UUID, quantity NUMERIC, unit_cost NUMERIC) LOOP
    INSERT INTO public.purchase_items (company_id, purchase_id, product_id, quantity, unit_cost, subtotal)
    VALUES (p_company_id, v_purchase_id, v_item.product_id, v_item.quantity, v_item.unit_cost, ROUND(v_item.quantity * v_item.unit_cost, 2));

    -- Actualizar Costo de Reposición
    UPDATE public.product_costs
    SET cost_price = v_item.unit_cost, updated_at = pg_catalog.now(), updated_by = auth.uid()
    WHERE product_id = v_item.product_id AND company_id = p_company_id;

    -- Movimiento de stock (trigger sync_product_stock incrementa existencias)
    INSERT INTO public.stock_movements (
      company_id, product_id, direction, reason, quantity, reference_purchase_id, reference_doc, created_by
    ) VALUES (
      p_company_id, v_item.product_id, 'increase', 'purchase', v_item.quantity, v_purchase_id, p_reference_doc, auth.uid()
    ) RETURNING id INTO v_movement_id;

    INSERT INTO public.movement_costs (company_id, movement_id, unit_cost, total_cost)
    VALUES (p_company_id, v_movement_id, v_item.unit_cost, ROUND(v_item.quantity * v_item.unit_cost, 2));
  END LOOP;

  -- Registrar egreso en transactions
  INSERT INTO public.transactions (
    company_id, type, category, amount, payment_method, status, reference_purchase_id, description, transaction_date, created_by
  ) VALUES (
    p_company_id, 'expense', 'stock_purchase', v_total_amount, p_payment_method, 'completed', v_purchase_id, 'Compra a proveedor ' || v_purchase_number, public.local_today(p_company_id), auth.uid()
  );

  RETURN v_purchase_id;
END;
$$;

REVOKE ALL ON FUNCTION public.register_purchase(UUID, UUID, JSONB, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_purchase(UUID, UUID, JSONB, TEXT, TEXT, TEXT) TO authenticated;
```

### 5.2. `cancel_purchase()`
```sql
CREATE OR REPLACE FUNCTION public.cancel_purchase(
  p_company_id UUID,
  p_purchase_id UUID,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item RECORD;
  v_mov_id UUID;
  v_last_cost NUMERIC(14, 2);
BEGIN
  PERFORM private.assert_company_role(p_company_id, 'master_admin');

  IF p_reason IS NULL OR pg_catalog.trim(p_reason) = '' THEN
    RAISE EXCEPTION 'El motivo de anulación es obligatorio';
  END IF;

  PERFORM set_config('stockapp.allow_cancellation', 'true', true);

  PERFORM 1 FROM public.purchases
  WHERE id = p_purchase_id AND company_id = p_company_id AND status = 'completed'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compra no encontrada o ya anulada';
  END IF;

  UPDATE public.purchases
  SET status = 'cancelled', cancelled_at = pg_catalog.now(), cancelled_by = auth.uid(), cancel_reason = p_reason
  WHERE id = p_purchase_id AND company_id = p_company_id;

  FOR v_item IN
    SELECT product_id, quantity, unit_cost
    FROM public.purchase_items
    WHERE purchase_id = p_purchase_id AND company_id = p_company_id
    ORDER BY product_id
  LOOP
    PERFORM 1 FROM public.products WHERE id = v_item.product_id AND company_id = p_company_id FOR UPDATE;

    INSERT INTO public.stock_movements (
      company_id, product_id, direction, reason, quantity, reference_purchase_id, notes, created_by
    ) VALUES (
      p_company_id, v_item.product_id, 'decrease', 'purchase_cancellation', v_item.quantity, p_purchase_id, 'Anulación compra: ' || p_reason, auth.uid()
    ) RETURNING id INTO v_mov_id;

    INSERT INTO public.movement_costs (company_id, movement_id, unit_cost, total_cost)
    VALUES (p_company_id, v_mov_id, v_item.unit_cost, ROUND(v_item.quantity * v_item.unit_cost, 2));

    -- Recalcular costo de reposición desde la última compra válida dentro de la misma empresa
    SELECT pi.unit_cost INTO v_last_cost
    FROM public.purchase_items pi
    JOIN public.purchases p ON p.id = pi.purchase_id AND p.company_id = p_company_id
    WHERE pi.product_id = v_item.product_id
      AND pi.company_id = p_company_id
      AND p.status = 'completed'
      AND p.id != p_purchase_id
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT 1;

    UPDATE public.product_costs
    SET cost_price = COALESCE(v_last_cost, 0.00), updated_at = pg_catalog.now(), updated_by = auth.uid()
    WHERE product_id = v_item.product_id AND company_id = p_company_id;
  END LOOP;

  UPDATE public.transactions
  SET status = 'cancelled'
  WHERE reference_purchase_id = p_purchase_id AND company_id = p_company_id;

  PERFORM set_config('stockapp.allow_cancellation', 'false', true);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_purchase(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_purchase(UUID, UUID, TEXT) TO authenticated;
```

---

## 6. Ajustes de Stock y Operaciones Especiales

### 6.1. `register_adjustment()`
```sql
CREATE OR REPLACE FUNCTION public.register_adjustment(
  p_company_id UUID,
  p_product_id UUID,
  p_direction TEXT,
  p_quantity NUMERIC,
  p_reason TEXT,
  p_notes TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_movement_id UUID;
  v_current_cost NUMERIC(14, 2);
BEGIN
  PERFORM private.assert_company_role(p_company_id, NULL);

  IF p_direction NOT IN ('increase', 'decrease') THEN
    RAISE EXCEPTION 'Dirección inválida. Valores: increase, decrease';
  END IF;

  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'La cantidad de ajuste debe ser mayor a 0';
  END IF;

  IF p_notes IS NULL OR pg_catalog.trim(p_notes) = '' THEN
    RAISE EXCEPTION 'El ajuste de stock requiere una justificación obligatoria en notas';
  END IF;

  PERFORM 1 FROM public.products
  WHERE id = p_product_id AND company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto no encontrado en esta empresa';
  END IF;

  SELECT cost_price INTO v_current_cost
  FROM public.product_costs
  WHERE product_id = p_product_id AND company_id = p_company_id;

  INSERT INTO public.stock_movements (
    company_id, product_id, direction, reason, quantity, notes, created_by
  ) VALUES (
    p_company_id, p_product_id, p_direction, p_reason, p_quantity, p_notes, auth.uid()
  ) RETURNING id INTO v_movement_id;

  INSERT INTO public.movement_costs (company_id, movement_id, unit_cost, total_cost)
  VALUES (p_company_id, v_movement_id, COALESCE(v_current_cost, 0.00), ROUND(COALESCE(v_current_cost, 0.00) * p_quantity, 2));

  RETURN v_movement_id;
END;
$$;

REVOKE ALL ON FUNCTION public.register_adjustment(UUID, UUID, TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_adjustment(UUID, UUID, TEXT, NUMERIC, TEXT, TEXT) TO authenticated;
```

### 6.2. `bulk_update_prices()`
```sql
CREATE OR REPLACE FUNCTION public.bulk_update_prices(
  p_company_id UUID,
  p_category_id UUID,
  p_product_ids UUID[],
  p_percentage NUMERIC,
  p_fixed_delta NUMERIC
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated_count INTEGER := 0;
BEGIN
  PERFORM private.assert_company_role(p_company_id, 'master_admin');

  WITH target_products AS (
    SELECT id, selling_price
    FROM public.products
    WHERE company_id = p_company_id
      AND (p_category_id IS NULL OR category_id = p_category_id)
      AND (p_product_ids IS NULL OR id = ANY(p_product_ids))
    ORDER BY id
    FOR UPDATE
  ),
  updated AS (
    UPDATE public.products p
    SET 
      selling_price = GREATEST(0.00, ROUND(p.selling_price * (1 + COALESCE(p_percentage, 0.00) / 100) + COALESCE(p_fixed_delta, 0.00), 2)),
      updated_at = pg_catalog.now()
    FROM target_products tp
    WHERE p.id = tp.id AND p.company_id = p_company_id
    RETURNING p.id
  )
  SELECT count(*) INTO v_updated_count FROM updated;

  RETURN v_updated_count;
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_update_prices(UUID, UUID, UUID[], NUMERIC, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_update_prices(UUID, UUID, UUID[], NUMERIC, NUMERIC) TO authenticated;
```

### 6.3. `import_initial_stock()`
```sql
CREATE OR REPLACE FUNCTION public.import_initial_stock(
  p_company_id UUID,
  p_items JSONB -- [{ product_id: UUID, quantity: NUMERIC, unit_cost: NUMERIC, notes: TEXT }]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item RECORD;
  v_count INTEGER := 0;
  v_mov_id UUID;
  v_product_ids UUID[];
BEGIN
  PERFORM private.assert_company_role(p_company_id, 'master_admin');

  SELECT array_agg((value->>'product_id')::UUID) INTO v_product_ids FROM jsonb_array_elements(p_items);

  IF EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE product_id = ANY(v_product_ids) AND company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'No se puede realizar carga inicial: uno o más productos ya registran movimientos de stock';
  END IF;

  PERFORM 1 FROM public.products
  WHERE id = ANY(v_product_ids) AND company_id = p_company_id
  ORDER BY id FOR UPDATE;

  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id UUID, quantity NUMERIC, unit_cost NUMERIC, notes TEXT) LOOP
    IF v_item.quantity < 0 THEN
      RAISE EXCEPTION 'La cantidad inicial no puede ser negativa';
    END IF;

    UPDATE public.product_costs
    SET cost_price = COALESCE(v_item.unit_cost, 0.00), updated_at = pg_catalog.now(), updated_by = auth.uid()
    WHERE product_id = v_item.product_id AND company_id = p_company_id;

    INSERT INTO public.stock_movements (
      company_id, product_id, direction, reason, quantity, notes, created_by
    ) VALUES (
      p_company_id, v_item.product_id, 'increase', 'initial_load', v_item.quantity, COALESCE(v_item.notes, 'Carga inicial / migración'), auth.uid()
    ) RETURNING id INTO v_mov_id;

    INSERT INTO public.movement_costs (company_id, movement_id, unit_cost, total_cost)
    VALUES (p_company_id, v_mov_id, COALESCE(v_item.unit_cost, 0.00), ROUND(COALESCE(v_item.unit_cost, 0.00) * v_item.quantity, 2));

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.import_initial_stock(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_initial_stock(UUID, JSONB) TO authenticated;
```

### 6.4. `import_products()`
```sql
CREATE OR REPLACE FUNCTION public.import_products(
  p_company_id UUID,
  p_products JSONB,
  p_on_duplicate TEXT DEFAULT 'error' -- 'error', 'update', 'skip'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_prod RECORD;
  v_count INTEGER := 0;
  v_existing_id UUID;
BEGIN
  PERFORM private.assert_company_role(p_company_id, 'master_admin');

  IF p_on_duplicate NOT IN ('error', 'update', 'skip') THEN
    RAISE EXCEPTION 'Opción p_on_duplicate inválida: %', p_on_duplicate;
  END IF;

  FOR v_prod IN SELECT * FROM jsonb_to_recordset(p_products) AS x(
    sku TEXT, barcode TEXT, name TEXT, description TEXT,
    category_id UUID, supplier_id UUID, unit TEXT,
    selling_price NUMERIC, min_stock NUMERIC
  ) LOOP
    IF v_prod.sku IS NULL OR pg_catalog.trim(v_prod.sku) = '' OR v_prod.name IS NULL OR pg_catalog.trim(v_prod.name) = '' THEN
      RAISE EXCEPTION 'SKU y Nombre son campos obligatorios';
    END IF;

    SELECT id INTO v_existing_id
    FROM public.products
    WHERE sku = v_prod.sku AND company_id = p_company_id
    FOR UPDATE;

    IF v_existing_id IS NOT NULL THEN
      IF p_on_duplicate = 'error' THEN
        RAISE EXCEPTION 'El SKU % ya existe en el catálogo de esta empresa', v_prod.sku;
      ELSIF p_on_duplicate = 'update' THEN
        UPDATE public.products
        SET
          barcode = COALESCE(v_prod.barcode, barcode),
          name = v_prod.name,
          description = COALESCE(v_prod.description, description),
          category_id = COALESCE(v_prod.category_id, category_id),
          supplier_id = COALESCE(v_prod.supplier_id, supplier_id),
          unit = COALESCE(v_prod.unit, unit),
          selling_price = COALESCE(v_prod.selling_price, selling_price),
          min_stock = COALESCE(v_prod.min_stock, min_stock),
          updated_at = pg_catalog.now()
        WHERE id = v_existing_id AND company_id = p_company_id;
        v_count := v_count + 1;
      ELSIF p_on_duplicate = 'skip' THEN
        CONTINUE;
      END IF;
    ELSE
      INSERT INTO public.products (
        company_id, sku, barcode, name, description, category_id, supplier_id,
        unit, selling_price, min_stock, current_stock, is_active
      ) VALUES (
        p_company_id, v_prod.sku, v_prod.barcode, v_prod.name, v_prod.description,
        v_prod.category_id, v_prod.supplier_id,
        COALESCE(v_prod.unit, 'unidad'),
        COALESCE(v_prod.selling_price, 0.00),
        COALESCE(v_prod.min_stock, 0.00),
        0.00,
        true
      );
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.import_products(UUID, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_products(UUID, JSONB, TEXT) TO authenticated;
```

---

## 7. Gestión de Liquidaciones de Haberes Multiempresa

```sql
CREATE OR REPLACE FUNCTION public.create_settlement(
  p_company_id UUID,
  p_employee_id UUID,
  p_period TEXT,
  p_amount NUMERIC,
  p_notes TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id UUID;
BEGIN
  PERFORM private.assert_company_role(p_company_id, 'master_admin');

  -- Validar empleado en la misma empresa
  PERFORM 1 FROM public.employees WHERE id = p_employee_id AND company_id = p_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Empleado no encontrado en esta empresa';
  END IF;

  INSERT INTO public.employee_settlements (
    company_id, employee_id, period, amount, status, notes, created_by
  ) VALUES (
    p_company_id, p_employee_id, p_period, p_amount, 'draft', p_notes, auth.uid()
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_settlement(
  p_company_id UUID,
  p_settlement_id UUID,
  p_payment_method TEXT,
  p_paid_date DATE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_settlement RECORD;
BEGIN
  PERFORM private.assert_company_role(p_company_id, 'master_admin');

  PERFORM set_config('stockapp.allow_settlement_update', 'true', true);

  SELECT * INTO v_settlement
  FROM public.employee_settlements
  WHERE id = p_settlement_id AND company_id = p_company_id AND status = 'draft'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Liquidación no encontrada o ya confirmada/anulada';
  END IF;

  UPDATE public.employee_settlements
  SET status = 'confirmed', paid_date = COALESCE(p_paid_date, public.local_today(p_company_id))
  WHERE id = p_settlement_id AND company_id = p_company_id;

  INSERT INTO public.transactions (
    company_id, type, category, amount, payment_method, status, reference_settlement_id, description, transaction_date, created_by
  ) VALUES (
    p_company_id, 'expense', 'salary_payment', v_settlement.amount, p_payment_method, 'completed', p_settlement_id, 'Pago haberes período ' || v_settlement.period, COALESCE(p_paid_date, public.local_today(p_company_id)), auth.uid()
  );

  PERFORM set_config('stockapp.allow_settlement_update', 'false', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_settlement(
  p_company_id UUID,
  p_settlement_id UUID,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.assert_company_role(p_company_id, 'master_admin');

  IF p_reason IS NULL OR pg_catalog.trim(p_reason) = '' THEN
    RAISE EXCEPTION 'El motivo de anulación es obligatorio';
  END IF;

  PERFORM set_config('stockapp.allow_settlement_update', 'true', true);

  PERFORM 1 FROM public.employee_settlements
  WHERE id = p_settlement_id AND company_id = p_company_id AND status = 'confirmed'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Liquidación no encontrada o no confirmada';
  END IF;

  UPDATE public.employee_settlements
  SET status = 'cancelled', cancelled_at = pg_catalog.now(), cancelled_by = auth.uid(), cancel_reason = p_reason
  WHERE id = p_settlement_id AND company_id = p_company_id;

  UPDATE public.transactions
  SET status = 'cancelled'
  WHERE reference_settlement_id = p_settlement_id AND company_id = p_company_id;

  PERFORM set_config('stockapp.allow_settlement_update', 'false', true);
END;
$$;
```

---

## 8. Finanzas Directas Multiempresa

```sql
CREATE OR REPLACE FUNCTION public.register_expense(
  p_company_id UUID,
  p_category TEXT,
  p_amount NUMERIC,
  p_payment_method TEXT,
  p_description TEXT,
  p_reference_doc TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id UUID;
BEGIN
  PERFORM private.assert_company_role(p_company_id, 'master_admin');

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'El monto del gasto debe ser mayor a 0';
  END IF;

  INSERT INTO public.transactions (
    company_id, type, category, amount, payment_method, status, description, transaction_date, created_by
  ) VALUES (
    p_company_id, 'expense', p_category, p_amount, p_payment_method, 'completed', p_description, public.local_today(p_company_id), auth.uid()
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.register_cash_adjustment(
  p_company_id UUID,
  p_type TEXT,
  p_amount NUMERIC,
  p_description TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id UUID;
BEGIN
  PERFORM private.assert_company_role(p_company_id, 'master_admin');

  IF p_type NOT IN ('income', 'expense') THEN
    RAISE EXCEPTION 'Tipo de ajuste inválido (income o expense)';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser mayor a 0';
  END IF;

  INSERT INTO public.transactions (
    company_id, type, category, amount, payment_method, status, description, transaction_date, created_by
  ) VALUES (
    p_company_id, p_type, 'cash_adjustment', p_amount, 'cash', 'completed', p_description, public.local_today(p_company_id), auth.uid()
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
```

---

## 9. Feed Unificado Paginado por Cursor: `get_activity_feed()`

Paginación por cursor compuesto `(company_id, created_at, id)` estrictamente aislada por tenant:

```sql
CREATE OR REPLACE FUNCTION public.get_activity_feed(
  p_company_id UUID,
  p_limit INT DEFAULT 20,
  p_cursor_created_at TIMESTAMPTZ DEFAULT NULL,
  p_cursor_id UUID DEFAULT NULL
)
RETURNS TABLE (
  event_type TEXT,
  event_id UUID,
  created_at TIMESTAMPTZ,
  user_name TEXT,
  action_title TEXT,
  event_details JSONB
)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
BEGIN
  -- Validar pertenencia activa a la empresa
  PERFORM private.assert_company_role(p_company_id, NULL);

  IF (p_cursor_created_at IS NULL AND p_cursor_id IS NOT NULL) OR
     (p_cursor_created_at IS NOT NULL AND p_cursor_id IS NULL) THEN
    RAISE EXCEPTION 'El cursor de paginación debe suministrar ambos valores (created_at e id) o ambos nulos';
  END IF;

  RETURN QUERY
  WITH combined_events AS (
    (
      SELECT 
        'stock'::TEXT AS event_type,
        sm.id AS event_id,
        sm.created_at,
        pp.full_name AS user_name,
        sm.reason AS action_title,
        jsonb_build_object(
          'product_id', sm.product_id,
          'direction', sm.direction,
          'quantity', sm.quantity,
          'reference_doc', sm.reference_doc
        ) AS event_details
      FROM public.stock_movements sm
      LEFT JOIN public.profiles_public pp ON pp.id = sm.created_by
      WHERE sm.company_id = p_company_id
        AND (p_cursor_created_at IS NULL OR (sm.created_at, sm.id) < (p_cursor_created_at, p_cursor_id))
      ORDER BY sm.created_at DESC, sm.id DESC
      LIMIT v_limit
    )

    UNION ALL

    (
      SELECT 
        'finance'::TEXT AS event_type,
        t.id AS event_id,
        t.created_at,
        pp.full_name AS user_name,
        t.category AS action_title,
        jsonb_build_object(
          'type', t.type,
          'amount', t.amount,
          'payment_method', t.payment_method,
          'description', t.description
        ) AS event_details
      FROM public.transactions t
      LEFT JOIN public.profiles_public pp ON pp.id = t.created_by
      WHERE t.company_id = p_company_id
        AND (p_cursor_created_at IS NULL OR (t.created_at, t.id) < (p_cursor_created_at, p_cursor_id))
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT v_limit
    )

    UNION ALL

    (
      SELECT 
        'audit'::TEXT AS event_type,
        a.id AS event_id,
        a.created_at,
        COALESCE(pp.full_name, 'Sistema') AS user_name,
        a.action || ' ' || a.table_name AS action_title,
        jsonb_build_object(
          'table_name', a.table_name,
          'record_id', a.record_id,
          'actor_role', a.actor_role
        ) AS event_details
      FROM public.audit_log a
      LEFT JOIN public.profiles_public pp ON pp.id = a.performed_by
      WHERE a.company_id = p_company_id
        AND (p_cursor_created_at IS NULL OR (a.created_at, a.id) < (p_cursor_created_at, p_cursor_id))
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT v_limit
    )
  )
  SELECT *
  FROM combined_events
  ORDER BY combined_events.created_at DESC, combined_events.event_id DESC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.get_activity_feed(UUID, INT, TIMESTAMPTZ, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_activity_feed(UUID, INT, TIMESTAMPTZ, UUID) TO authenticated;
```
