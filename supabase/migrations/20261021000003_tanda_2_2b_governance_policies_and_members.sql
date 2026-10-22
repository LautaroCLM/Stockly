-- ============================================================================
-- MIGRACIÓN OFICIAL: TANDA 2.2B (MIGRACIÓN 2) - POLÍTICAS DE GOBERNANZA Y BAJA DE MIEMBROS
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
-- Base de datos: PostgreSQL 17 / Supabase
-- Alcance:
--   1. Cambio de DEFAULT en public.companies.allow_negative_stock a true
--      (afecta únicamente a futuras inserciones; NO modifica los valores
--      almacenados en empresas existentes).
--   2. RPC public.set_company_negative_stock_policy(UUID, BOOLEAN, TEXT):
--      actualización auditada exclusiva para master_admin con re-verificación
--      de autorización post-bloqueo.
--   3. RPC public.deactivate_member(UUID, UUID, TEXT):
--      baja lógica auditada de membresías con jerarquía de titular (owner_id),
--      protección del último master_admin activo, orden canónico de bloqueos y
--      re-verificación de autorización post-bloqueo.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. POLÍTICA POR DEFECTO DE STOCK NEGATIVO PARA NUEVAS EMPRESAS
-- ----------------------------------------------------------------------------
-- Nota: ALTER COLUMN ... SET DEFAULT solo modifica el metadato en pg_attrdef
-- para nuevas filas insertadas en public.companies. Las empresas ya existentes
-- conservan intacto su valor actual de allow_negative_stock.
ALTER TABLE public.companies
  ALTER COLUMN allow_negative_stock SET DEFAULT true;

COMMENT ON COLUMN public.companies.allow_negative_stock IS
  'Define si la empresa admite saldos de existencias negativas ante salidas de stock. Por omisión es true para nuevas empresas; configurable por master_admin vía set_company_negative_stock_policy.';

-- ----------------------------------------------------------------------------
-- 2. RPC: public.set_company_negative_stock_policy
-- ----------------------------------------------------------------------------
-- Orden de bloqueos:
--   Paso 1: public.companies (FOR UPDATE)
--   Paso 2: public.company_members del invocante (FOR KEY SHARE)
CREATE OR REPLACE FUNCTION public.set_company_negative_stock_policy(
  p_company_id UUID,
  p_allow_negative_stock BOOLEAN,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_clean_reason TEXT := pg_catalog.btrim(p_reason);
  v_company_active BOOLEAN;
  v_old_allow_negative BOOLEAN;
  v_caller_active BOOLEAN;
  v_caller_role TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Acceso denegado: usuario no autenticado.';
  END IF;

  -- Validación preliminar de membresía y rol con mensajes canónicos
  PERFORM private.assert_company_role(p_company_id, 'master_admin');

  IF p_allow_negative_stock IS NULL THEN
    RAISE EXCEPTION 'Debe especificar un valor booleano (true o false) para la política de stock negativo.';
  END IF;

  IF v_clean_reason IS NULL OR v_clean_reason = '' THEN
    RAISE EXCEPTION 'Se requiere especificar un motivo justificatorio para cambiar la política de stock negativo.';
  END IF;

  -- Paso 1 de bloqueo: Bloquear la fila de la empresa en public.companies (FOR UPDATE)
  SELECT c.is_active, c.allow_negative_stock
    INTO v_company_active, v_old_allow_negative
  FROM public.companies c
  WHERE c.id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Empresa con ID % no encontrada.', p_company_id;
  END IF;

  IF NOT v_company_active THEN
    RAISE EXCEPTION 'La empresa se encuentra inactiva. No se admiten operaciones.';
  END IF;

  -- Paso 2 de bloqueo y prevención de carrera de autorización:
  -- Re-verificar bajo bloqueo que el usuario invocante sigue siendo miembro activo con rol master_admin
  SELECT cm.is_active, cm.role
    INTO v_caller_active, v_caller_role
  FROM public.company_members cm
  WHERE cm.company_id = p_company_id
    AND cm.user_id = v_caller_id
  FOR KEY SHARE;

  IF NOT FOUND OR NOT v_caller_active THEN
    RAISE EXCEPTION 'El usuario no es un miembro activo de esta empresa.';
  END IF;

  IF v_caller_role != 'master_admin' THEN
    RAISE EXCEPTION 'Operación restringida a usuarios con rol master_admin en esta empresa (rol actual: %).', v_caller_role;
  END IF;

  UPDATE public.companies
  SET allow_negative_stock = p_allow_negative_stock,
      updated_at = pg_catalog.now()
  WHERE id = p_company_id;

  -- Registro atómico en audit_log (public.companies no posee audit_trigger automático para evitar duplicados)
  INSERT INTO public.audit_log (
    company_id,
    table_name,
    record_id,
    action,
    old_data,
    new_data,
    performed_by,
    actor_role
  ) VALUES (
    p_company_id,
    'companies',
    p_company_id::TEXT,
    'UPDATE',
    pg_catalog.jsonb_build_object('allow_negative_stock', v_old_allow_negative),
    pg_catalog.jsonb_build_object('allow_negative_stock', p_allow_negative_stock, 'reason', v_clean_reason),
    v_caller_id,
    'master_admin'
  );
END;
$$;

COMMENT ON FUNCTION public.set_company_negative_stock_policy(UUID, BOOLEAN, TEXT) IS
  'Actualiza de forma auditada la política allow_negative_stock de la empresa. Exclusivo para master_admin activo.';

REVOKE ALL ON FUNCTION public.set_company_negative_stock_policy(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_company_negative_stock_policy(UUID, BOOLEAN, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. RPC: public.deactivate_member
-- ----------------------------------------------------------------------------
-- Orden canónico de bloqueos (consistente con transfer_company_ownership,
-- deactivate_company, reactivate_member y check_last_active_master_admin):
--   Paso 1: public.companies (FOR UPDATE) -> serializa operaciones de gobernanza del mismo tenant
--   Paso 2: public.company_members (FOR UPDATE en orden ascendente de user_id para invocante y objetivo)
CREATE OR REPLACE FUNCTION public.deactivate_member(
  p_company_id UUID,
  p_user_id UUID,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_clean_reason TEXT := pg_catalog.btrim(p_reason);
  v_owner_id UUID;
  v_company_active BOOLEAN;
  v_caller_active BOOLEAN;
  v_caller_role TEXT;
  v_target_member_id UUID;
  v_target_active BOOLEAN;
  v_target_role TEXT;
  v_other_admins INT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Acceso denegado: usuario no autenticado.';
  END IF;

  -- Validación preliminar de membresía y rol con mensajes canónicos
  PERFORM private.assert_company_role(p_company_id, 'master_admin');

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Debe especificar el identificador del usuario a desactivar.';
  END IF;

  IF v_clean_reason IS NULL OR v_clean_reason = '' THEN
    RAISE EXCEPTION 'Se requiere especificar un motivo justificatorio para la desactivación.';
  END IF;

  -- Paso 1 de bloqueo: Bloquear la fila de la empresa en public.companies (FOR UPDATE)
  -- Esto serializa contra transfer_company_ownership, deactivate_company, reactivate_member y otra deactivate_member
  SELECT c.owner_id, c.is_active
    INTO v_owner_id, v_company_active
  FROM public.companies c
  WHERE c.id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Empresa con ID % no encontrada.', p_company_id;
  END IF;

  IF NOT v_company_active THEN
    RAISE EXCEPTION 'La empresa se encuentra inactiva. No se admiten operaciones.';
  END IF;

  -- Paso 2 de bloqueo: Adquirir FOR UPDATE en public.company_members sobre invocante y objetivo
  -- en orden determinista (ORDER BY user_id ASC) para descartar interbloqueos entre filas de miembros
  PERFORM 1
  FROM public.company_members cm
  WHERE cm.company_id = p_company_id
    AND cm.user_id IN (v_caller_id, p_user_id)
  ORDER BY cm.user_id ASC
  FOR UPDATE;

  -- Re-verificación post-bloqueo de la membresía y rol del usuario invocante
  SELECT cm.is_active, cm.role
    INTO v_caller_active, v_caller_role
  FROM public.company_members cm
  WHERE cm.company_id = p_company_id
    AND cm.user_id = v_caller_id;

  IF NOT FOUND OR NOT v_caller_active THEN
    RAISE EXCEPTION 'El usuario no es un miembro activo de esta empresa.';
  END IF;

  IF v_caller_role != 'master_admin' THEN
    RAISE EXCEPTION 'Operación restringida a usuarios con rol master_admin en esta empresa (rol actual: %).', v_caller_role;
  END IF;

  -- Lectura bajo bloqueo de la membresía objetivo
  SELECT cm.id, cm.is_active, cm.role
    INTO v_target_member_id, v_target_active, v_target_role
  FROM public.company_members cm
  WHERE cm.company_id = p_company_id
    AND cm.user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membresía no encontrada para el usuario en esta empresa.';
  END IF;

  IF NOT v_target_active THEN
    RAISE EXCEPTION 'El usuario ya se encuentra inactivo en esta empresa.';
  END IF;

  -- Jerarquía estricta: Solo el titular vigente (owner_id) puede desactivar a un master_admin
  IF v_target_role = 'master_admin' AND v_caller_id != v_owner_id THEN
    RAISE EXCEPTION 'Operación restringida: Solo el titular vigente de la empresa puede desactivar a un usuario con rol master_admin.';
  END IF;

  -- El titular vigente (owner_id) no puede ser desactivado sin transferir antes la titularidad
  IF p_user_id = v_owner_id THEN
    RAISE EXCEPTION 'El titular vigente de la empresa no puede ser desactivado. Transfiera la titularidad previamente.';
  END IF;

  -- Defensa explícita (además del trigger tr_protect_last_company_admin) para garantizar al menos un master_admin activo
  IF v_target_role = 'master_admin' THEN
    SELECT count(*)::INT INTO v_other_admins
    FROM public.company_members cm
    WHERE cm.company_id = p_company_id
      AND cm.role = 'master_admin'
      AND cm.is_active = true
      AND cm.user_id != p_user_id;

    IF v_other_admins = 0 THEN
      RAISE EXCEPTION 'No se puede desactivar, degradar ni remover el único master_admin activo de la empresa.';
    END IF;
  END IF;

  UPDATE public.company_members
  SET is_active = false,
      updated_at = pg_catalog.now()
  WHERE id = v_target_member_id;

  -- Registro atómico en audit_log (public.company_members no posee audit_trigger automático)
  INSERT INTO public.audit_log (
    company_id,
    table_name,
    record_id,
    action,
    old_data,
    new_data,
    performed_by,
    actor_role
  ) VALUES (
    p_company_id,
    'company_members',
    v_target_member_id::TEXT,
    'UPDATE',
    pg_catalog.jsonb_build_object(
      'user_id', p_user_id,
      'role', v_target_role,
      'is_active', true
    ),
    pg_catalog.jsonb_build_object(
      'user_id', p_user_id,
      'role', v_target_role,
      'is_active', false,
      'reason', v_clean_reason
    ),
    v_caller_id,
    'master_admin'
  );
END;
$$;

COMMENT ON FUNCTION public.deactivate_member(UUID, UUID, TEXT) IS
  'Desactiva lógicamente una membresía activa respetando la jerarquía de owner_id y la invariante de master_admin activo, con registro en audit_log.';

REVOKE ALL ON FUNCTION public.deactivate_member(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deactivate_member(UUID, UUID, TEXT) TO authenticated;
