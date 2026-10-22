-- ============================================================================
-- PROPUESTA TANDA 2.1: NÚCLEO MULTIEMPRESA, IDENTIDAD Y GOBERNANZA
-- Módulo: SaaS Pooled, Membresías, Invitaciones, Contadores y Políticas RLS
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
-- Estado: PROPUESTA TÉCNICA AISLADA (No desplegada en producción)
-- ============================================================================

-- ============================================================================
-- 1. TABLAS BASE DEL NÚCLEO MULTIEMPRESA
-- ============================================================================

-- 1.1. profiles: Identidad universal del usuario (Desacoplada de empresas y roles)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT 'Usuario',
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

COMMENT ON TABLE public.profiles IS 'Identidad de usuario universal del sistema. No almacena roles ni membresías de empresa.';

-- 1.1.1. validate_cuit: Validador de CUIT argentino (Módulo 11)
CREATE OR REPLACE FUNCTION public.validate_cuit(p_cuit TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_clean_cuit TEXT;
  v_digits INT[];
  v_multipliers INT[] := ARRAY[5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  v_sum INT := 0;
  v_calc_verifier INT;
  i INT;
BEGIN
  IF p_cuit IS NULL THEN
    RETURN TRUE; -- CUIT opcional sin unicidad global obligatoria
  END IF;

  -- Formato estricto: exactamente 11 dígitos numéricos o formato estándar XX-XXXXXXXX-X
  IF p_cuit !~ '^[0-9]{11}$' AND p_cuit !~ '^[0-9]{2}-[0-9]{8}-[0-9]$' THEN
    RETURN FALSE;
  END IF;

  v_clean_cuit := pg_catalog.regexp_replace(p_cuit, '-', '', 'g');

  IF pg_catalog.length(v_clean_cuit) != 11 THEN
    RETURN FALSE;
  END IF;

  FOR i IN 1..11 LOOP
    v_digits[i] := pg_catalog.substr(v_clean_cuit, i, 1)::INT;
  END LOOP;

  FOR i IN 1..10 LOOP
    v_sum := v_sum + (v_digits[i] * v_multipliers[i]);
  END LOOP;

  v_calc_verifier := 11 - (v_sum % 11);
  IF v_calc_verifier = 11 THEN
    v_calc_verifier := 0;
  ELSIF v_calc_verifier = 10 THEN
    v_calc_verifier := 9;
  END IF;

  RETURN v_calc_verifier = v_digits[11];
END;
$$;

COMMENT ON FUNCTION public.validate_cuit(TEXT) IS 'Validador algorítmico de CUIT argentino (Módulo 11). Comprueba integridad numérica y formato, pero no garantiza la existencia legal o fiscal del contribuyente ante el organismo tributario.';

-- 1.2. companies: Entidades corporativas / Tenants
CREATE TABLE IF NOT EXISTS public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  tax_id TEXT,
  currency TEXT NOT NULL DEFAULT 'ARS',
  timezone TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT chk_company_name_non_empty CHECK (pg_catalog.btrim(name) <> ''),
  CONSTRAINT chk_company_tax_id_cuit CHECK (tax_id IS NULL OR public.validate_cuit(tax_id))
);

COMMENT ON TABLE public.companies IS 'Empresas registradas (tenants). owner_id identifica al titular vigente con máxima autoridad.';

-- 1.3. company_members: Membresía y roles por empresa (Fuente de verdad de permisos)
CREATE TABLE IF NOT EXISTS public.company_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  role TEXT NOT NULL CHECK (role IN ('master_admin', 'employee')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT uq_company_member_user UNIQUE (company_id, user_id),
  CONSTRAINT uq_company_member_composite UNIQUE (company_id, id)
);

COMMENT ON TABLE public.company_members IS 'Membresías activas e históricas por empresa y rol de acceso.';

-- 1.4. company_invitations: Invitaciones corporativas por token criptográfico con estado explícito
CREATE TABLE IF NOT EXISTS public.company_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('master_admin', 'employee')),
  token_hash TEXT NOT NULL UNIQUE,
  invited_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT uq_company_invitation_composite UNIQUE (company_id, id)
);

COMMENT ON TABLE public.company_invitations IS 'Registro seguro de invitaciones con estado explícito e historial de ciclo de vida.';

-- Índice único parcial insensible a mayúsculas para impedir más de una invitación pendiente por empresa y correo
CREATE UNIQUE INDEX IF NOT EXISTS uq_company_invitations_pending_email
  ON public.company_invitations (company_id, pg_catalog.lower(email))
  WHERE status = 'pending';

-- 1.5. company_counters: Numeración correlativa transaccional por empresa
CREATE TABLE IF NOT EXISTS public.company_counters (
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('sale', 'purchase')),
  last_value BIGINT NOT NULL DEFAULT 0 CHECK (last_value >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  PRIMARY KEY (company_id, kind)
);

COMMENT ON TABLE public.company_counters IS 'Contadores transaccionales aislados por empresa con bloqueo pesimista.';

-- 1.6. audit_log: Registro histórico inmutable de auditoría multiempresa
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE RESTRICT,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_data JSONB,
  new_data JSONB,
  performed_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  actor_role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

COMMENT ON TABLE public.audit_log IS 'Libro inmutable de auditoría para operaciones críticas del sistema.';

-- 1.7. profiles_public: Vista segura para resolución de nombres (security_invoker)
CREATE OR REPLACE VIEW public.profiles_public
WITH (security_invoker = true)
AS
SELECT id, full_name
FROM public.profiles;

COMMENT ON VIEW public.profiles_public IS 'Vista pública con security_invoker para resolver nombres de auditores y colaboradores.';

-- ============================================================================
-- 2. FUNCIONES DE AUTORIZACIÓN EN ESQUEMA PRIVATE (Aisladas de PostgREST)
-- ============================================================================

-- 2.1. private.my_active_company_ids(): Retorna IDs de empresas activas del usuario
CREATE OR REPLACE FUNCTION private.my_active_company_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT cm.company_id
  FROM public.company_members cm
  JOIN public.companies c ON c.id = cm.company_id
  WHERE cm.user_id = auth.uid()
    AND cm.is_active = true
    AND c.is_active = true;
$$;

COMMENT ON FUNCTION private.my_active_company_ids() IS 'Retorna las empresas activas para las que auth.uid() es miembro activo.';

-- 2.2. private.my_accessible_company_ids(): Retorna IDs de empresas accesibles
-- Incluye empresas activas (miembros) y empresas inactivas (solo para sus master_admin vigentes)
CREATE OR REPLACE FUNCTION private.my_accessible_company_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  -- Empresas activas donde el usuario es miembro activo
  SELECT cm.company_id
  FROM public.company_members cm
  JOIN public.companies c ON c.id = cm.company_id
  WHERE cm.user_id = auth.uid()
    AND cm.is_active = true
    AND c.is_active = true
  UNION
  -- Empresas inactivas (histórico): Solo para master_admin activos al cese
  SELECT cm.company_id
  FROM public.company_members cm
  JOIN public.companies c ON c.id = cm.company_id
  WHERE cm.user_id = auth.uid()
    AND cm.is_active = true
    AND cm.role = 'master_admin'
    AND c.is_active = false;
$$;

COMMENT ON FUNCTION private.my_accessible_company_ids() IS 'Retorna empresas activas y empresas inactivas con acceso de lectura histórico para master_admin.';

-- 2.3. private.has_company_role(): Evalúa si auth.uid() tiene un rol en la empresa
CREATE OR REPLACE FUNCTION private.has_company_role(
  p_company_id UUID,
  p_role TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_members cm
    JOIN public.companies c ON c.id = cm.company_id
    WHERE cm.company_id = p_company_id
      AND cm.user_id = auth.uid()
      AND cm.is_active = true
      AND c.is_active = true
      AND (p_role IS NULL OR cm.role = p_role)
  );
$$;

-- 2.4. private.assert_company_role(): Validación estricta con aborto por excepción
CREATE OR REPLACE FUNCTION private.assert_company_role(
  p_company_id UUID,
  p_role TEXT
)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company_active BOOLEAN;
  v_member_active BOOLEAN;
  v_member_role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Acceso denegado: usuario no autenticado.';
  END IF;

  SELECT is_active INTO v_company_active
  FROM public.companies
  WHERE id = p_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Empresa con ID % no encontrada.', p_company_id;
  END IF;

  IF NOT v_company_active THEN
    RAISE EXCEPTION 'La empresa se encuentra inactiva. No se admiten operaciones.';
  END IF;

  SELECT is_active, role INTO v_member_active, v_member_role
  FROM public.company_members
  WHERE company_id = p_company_id AND user_id = auth.uid();

  IF NOT FOUND OR NOT v_member_active THEN
    RAISE EXCEPTION 'El usuario no es un miembro activo de esta empresa.';
  END IF;

  IF p_role IS NOT NULL AND v_member_role != p_role THEN
    RAISE EXCEPTION 'Operación restringida a usuarios con rol % en esta empresa (rol actual: %).', p_role, v_member_role;
  END IF;
END;
$$;

-- Revocación de funciones del esquema private a anon y PUBLIC
REVOKE ALL ON FUNCTION private.my_active_company_ids() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.my_accessible_company_ids() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.has_company_role(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.assert_company_role(UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- Concesión de uso y ejecución a authenticated para evaluación de políticas RLS
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.my_active_company_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION private.my_accessible_company_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_company_role(UUID, TEXT) TO authenticated;

-- ============================================================================
-- 3. TRIGGERS DE INTEGRIDAD Y CICLO DE VIDA
-- ============================================================================

-- 3.1. set_updated_at: Actualiza automáticamente updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = pg_catalog.now();
  RETURN NEW;
END;
$$;

-- 3.2. prevent_immutable_modification: Blinda inmutabilidad en audit_log
CREATE OR REPLACE FUNCTION public.prevent_immutable_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'La tabla % es inmutable: no se permiten modificaciones ni eliminaciones.', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER tr_audit_log_immutable
BEFORE UPDATE OR DELETE ON public.audit_log
FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_modification();

-- 3.3. handle_new_user: Crea perfil neutro al registrarse en auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    pg_catalog.lower(pg_catalog.btrim(NEW.email)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Usuario')
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = CASE WHEN EXCLUDED.full_name <> 'Usuario' THEN EXCLUDED.full_name ELSE public.profiles.full_name END,
      updated_at = pg_catalog.now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3.4. check_last_active_master_admin: Salvaguarda anti-acéfala con bloqueo pesimista
CREATE OR REPLACE FUNCTION public.check_last_active_master_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_other_admins INT;
BEGIN
  -- Bloqueo pesimista de fila en companies para serializar cambios administrativos de la empresa
  PERFORM 1 FROM public.companies WHERE id = OLD.company_id FOR NO KEY UPDATE;

  IF (OLD.role = 'master_admin' AND OLD.is_active = true) THEN
    IF (TG_OP = 'DELETE' OR NEW.role != 'master_admin' OR NEW.is_active = false) THEN
      SELECT count(*) INTO v_other_admins
      FROM public.company_members
      WHERE company_id = OLD.company_id
        AND role = 'master_admin'
        AND is_active = true
        AND user_id != OLD.user_id;

      IF v_other_admins = 0 THEN
        RAISE EXCEPTION 'No se puede desactivar, degradar ni remover el único master_admin activo de la empresa.';
      END IF;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER tr_protect_last_company_admin
BEFORE UPDATE OR DELETE ON public.company_members
FOR EACH ROW EXECUTE FUNCTION public.check_last_active_master_admin();

-- 3.5. protect_company_created_by: Inmutabilidad estricta de created_by (HN-02)
CREATE OR REPLACE FUNCTION public.protect_company_created_by()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'El campo created_by es estrictamente inmutable tras la creación de la empresa.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_protect_company_created_by
BEFORE UPDATE ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.protect_company_created_by();

-- 3.6. validate_company_timezone: Validación de identificadores de huso horario IANA admitidos por PostgreSQL
CREATE OR REPLACE FUNCTION public.validate_company_timezone()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = NEW.timezone
  ) THEN
    RAISE EXCEPTION 'Zona horaria no válida: %. Debe ser un identificador IANA admitido por PostgreSQL (ej. America/Argentina/Buenos_Aires).', NEW.timezone;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.validate_company_timezone() IS 'Disparador que valida que la zona horaria sea un identificador oficial IANA existente en pg_timezone_names.';

CREATE TRIGGER tr_validate_company_timezone
BEFORE INSERT OR UPDATE OF timezone ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.validate_company_timezone();

-- Triggers de actualización de fecha
CREATE TRIGGER tr_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER tr_companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER tr_company_members_updated_at BEFORE UPDATE ON public.company_members FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 4. PROCEDIMIENTOS RPC DE GOBERNANZA MULTIEMPRESA (Exclusivos para authenticated)
-- ============================================================================

-- 4.1. local_today: Fecha local para una empresa determinada
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

-- 4.2. create_company: Creación atómica de un nuevo tenant con su titular y contadores
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
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;

  IF p_name IS NULL OR pg_catalog.btrim(p_name) = '' THEN
    RAISE EXCEPTION 'El nombre de la empresa es obligatorio.';
  END IF;

  -- 1. Crear empresa asignando al creador como created_by y owner_id
  INSERT INTO public.companies (
    name, tax_id, currency, timezone, is_active, created_by, owner_id
  ) VALUES (
    pg_catalog.btrim(p_name),
    NULLIF(pg_catalog.btrim(p_tax_id), ''),
    COALESCE(p_currency, 'ARS'),
    COALESCE(p_timezone, 'America/Argentina/Buenos_Aires'),
    true,
    v_user_id,
    v_user_id
  ) RETURNING id INTO v_company_id;

  -- 2. Asignar membresía inicial como master_admin al creador
  INSERT INTO public.company_members (
    company_id, user_id, role, is_active
  ) VALUES (
    v_company_id, v_user_id, 'master_admin', true
  );

  -- 3. Inicializar contadores transaccionales aislados para ventas y compras
  INSERT INTO public.company_counters (company_id, kind, last_value)
  VALUES 
    (v_company_id, 'sale', 0),
    (v_company_id, 'purchase', 0);

  -- 4. Registrar evento en auditoría
  INSERT INTO public.audit_log (
    company_id, table_name, record_id, action, new_data, performed_by, actor_role
  ) VALUES (
    v_company_id, 'companies', v_company_id::text, 'INSERT',
    jsonb_build_object('name', p_name, 'owner_id', v_user_id),
    v_user_id, 'master_admin'
  );

  RETURN v_company_id;
END;
$$;

-- 4.3. invite_user_to_company: Emisión de invitación con validación estricta de jerarquía y estado previo
CREATE OR REPLACE FUNCTION public.invite_user_to_company(
  p_company_id UUID,
  p_email TEXT,
  p_role TEXT
)
RETURNS TEXT -- Retorna el token en claro para que el frontend lo envíe por correo
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_owner_id UUID;
  v_clean_email TEXT;
  v_token_raw TEXT;
  v_token_hash TEXT;
  v_existing_active BOOLEAN;
  v_invitation_id UUID;
BEGIN
  -- Validar que el llamador sea un master_admin activo de la empresa
  PERFORM private.assert_company_role(p_company_id, 'master_admin');

  IF p_role NOT IN ('master_admin', 'employee') THEN
    RAISE EXCEPTION 'Rol no válido: %. Solo se permiten master_admin o employee.', p_role;
  END IF;

  v_clean_email := pg_catalog.lower(pg_catalog.btrim(p_email));
  IF v_clean_email = '' OR v_clean_email IS NULL THEN
    RAISE EXCEPTION 'El correo electrónico es obligatorio.';
  END IF;

  -- Jerarquía estricta: Solo el titular (owner_id) puede invitar a un master_admin
  SELECT owner_id INTO v_owner_id
  FROM public.companies
  WHERE id = p_company_id;

  IF p_role = 'master_admin' AND v_caller_id != v_owner_id THEN
    RAISE EXCEPTION 'Operación restringida: Solo el titular (owner_id) de la empresa puede invitar a un nuevo master_admin.';
  END IF;

  -- Comprobar si ya existe membresía previa (activa o inactiva)
  SELECT cm.is_active INTO v_existing_active
  FROM public.company_members cm
  JOIN public.profiles p ON p.id = cm.user_id
  WHERE cm.company_id = p_company_id
    AND pg_catalog.lower(p.email) = v_clean_email;

  IF FOUND THEN
    IF v_existing_active = true THEN
      RAISE EXCEPTION 'El usuario % ya es miembro activo de esta empresa.', v_clean_email;
    ELSE
      -- H-03: Impedir reactivación encubierta mediante invitación
      RAISE EXCEPTION 'El usuario % posee una membresía inactiva previa en esta empresa. Debe ser reactivado mediante reactivate_member indicando el motivo.', v_clean_email;
    END IF;
  END IF;

  -- A-01: Marcar como 'expired' cualquier invitación previa en 'pending' cuya vigencia haya caducado,
  -- liberando la restricción del índice único parcial uq_company_invitations_pending_email
  UPDATE public.company_invitations
  SET status = 'expired'
  WHERE company_id = p_company_id
    AND pg_catalog.lower(email) = v_clean_email
    AND status = 'pending'
    AND expires_at <= pg_catalog.now();

  -- Comprobar si ya existe una invitación vigente sin consumir
  IF EXISTS (
    SELECT 1 FROM public.company_invitations
    WHERE company_id = p_company_id
      AND pg_catalog.lower(email) = v_clean_email
      AND status = 'pending'
      AND expires_at > pg_catalog.now()
  ) THEN
    RAISE EXCEPTION 'Ya existe una invitación pendiente y vigente para % en esta empresa.', v_clean_email;
  END IF;

  -- Generar token criptográfico de 32 bytes (64 caracteres hexadecimales)
  v_token_raw := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');
  v_token_hash := pg_catalog.encode(extensions.digest(v_token_raw, 'sha256'), 'hex');

  -- Registrar invitación con vigencia de 7 días y estado pending
  INSERT INTO public.company_invitations (
    company_id, email, role, token_hash, invited_by, status, expires_at
  ) VALUES (
    p_company_id,
    v_clean_email,
    p_role,
    v_token_hash,
    v_caller_id,
    'pending',
    pg_catalog.now() + interval '7 days'
  ) RETURNING id INTO v_invitation_id;

  -- M-06: Auditoría atómica de la emisión de invitación
  INSERT INTO public.audit_log (
    company_id, table_name, record_id, action, new_data, performed_by, actor_role
  ) VALUES (
    p_company_id, 'company_invitations', v_invitation_id::text, 'INSERT',
    jsonb_build_object('email', v_clean_email, 'role', p_role, 'status', 'pending'),
    v_caller_id, 'master_admin'
  );

  RETURN v_token_raw;
END;
$$;

-- 4.4. accept_company_invitation: Aceptación de invitación mediante token seguro
CREATE OR REPLACE FUNCTION public.accept_company_invitation(
  p_token TEXT
)
RETURNS UUID -- Retorna el company_id asignado
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_user_email TEXT;
  v_token_hash TEXT;
  v_target_company_id UUID;
  v_invitation RECORD;
  v_existing_active BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;

  SELECT lower(email) INTO v_user_email
  FROM public.profiles
  WHERE id = v_user_id;

  -- Calcular hash SHA-256 del token provisto
  v_token_hash := pg_catalog.encode(extensions.digest(pg_catalog.btrim(p_token), 'sha256'), 'hex');

  -- 1. Identificar la empresa receptora asociada al token sin retener bloqueos aún
  SELECT company_id INTO v_target_company_id
  FROM public.company_invitations
  WHERE token_hash = v_token_hash;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La invitación es inválida, ha expirado o ya ha sido utilizada.';
  END IF;

  -- 2. ORDEN CANÓNICO DE BLOQUEOS (Paso 1: companies -> Paso 2: company_invitations)
  -- Bloquear fila de la empresa en primer término para evitar interbloqueos (deadlocks) con deactivate_company (A-02)
  PERFORM 1
  FROM public.companies
  WHERE id = v_target_company_id
    AND is_active = true
  FOR NO KEY UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La empresa receptora se encuentra inactiva o deshabilitada.';
  END IF;

  -- 3. Bloquear la invitación en segundo término bajo bloqueo pesimista FOR UPDATE (HN-01)
  SELECT * INTO v_invitation
  FROM public.company_invitations
  WHERE token_hash = v_token_hash
    AND status = 'pending'
    AND expires_at > pg_catalog.now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La invitación es inválida, ha expirado o ya ha sido utilizada.';
  END IF;

  -- Validar coincidencia de identidad de correo (normalizada)
  IF lower(v_invitation.email) != v_user_email THEN
    RAISE EXCEPTION 'Esta invitación fue emitida para % y tu cuenta corresponde a %.', v_invitation.email, v_user_email;
  END IF;

  -- H-03: Validar que no exista registro previo con is_active = false
  SELECT is_active INTO v_existing_active
  FROM public.company_members
  WHERE company_id = v_invitation.company_id AND user_id = v_user_id;

  IF FOUND THEN
    IF v_existing_active = false THEN
      RAISE EXCEPTION 'El usuario posee una membresía inactiva previa en esta empresa. Debe ser reactivado por un administrador mediante reactivate_member.';
    ELSE
      RAISE EXCEPTION 'El usuario ya es miembro activo de esta empresa.';
    END IF;
  END IF;

  -- Insertar membresía nueva
  INSERT INTO public.company_members (
    company_id, user_id, role, is_active
  ) VALUES (
    v_invitation.company_id, v_user_id, v_invitation.role, true
  );

  -- Marcar invitación como aceptada
  UPDATE public.company_invitations
  SET status = 'accepted',
      accepted_at = pg_catalog.now()
  WHERE id = v_invitation.id;

  -- Registrar en auditoría la membresía
  INSERT INTO public.audit_log (
    company_id, table_name, record_id, action, new_data, performed_by, actor_role
  ) VALUES (
    v_invitation.company_id, 'company_members', v_user_id::text, 'INSERT',
    jsonb_build_object('user_id', v_user_id, 'role', v_invitation.role),
    v_user_id, v_invitation.role
  );

  -- M-06: Registrar en auditoría el canje de la invitación
  INSERT INTO public.audit_log (
    company_id, table_name, record_id, action, old_data, new_data, performed_by, actor_role
  ) VALUES (
    v_invitation.company_id, 'company_invitations', v_invitation.id::text, 'UPDATE',
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'accepted', 'accepted_by', v_user_id),
    v_user_id, v_invitation.role
  );

  RETURN v_invitation.company_id;
END;
$$;

-- 4.5. transfer_company_ownership: Transferencia de titularidad vigente (Exclusivo de owner_id)
CREATE OR REPLACE FUNCTION public.transfer_company_ownership(
  p_company_id UUID,
  p_new_owner_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_current_owner_id UUID;
  v_target_role TEXT;
  v_target_active BOOLEAN;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;

  -- Bloqueo pesimista de fila en companies
  SELECT owner_id INTO v_current_owner_id
  FROM public.companies
  WHERE id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Empresa no encontrada.';
  END IF;

  IF v_current_owner_id != v_caller_id THEN
    RAISE EXCEPTION 'Operación denegada: Solo el titular vigente de la empresa puede transferir la titularidad.';
  END IF;

  IF p_new_owner_id = v_caller_id THEN
    RAISE EXCEPTION 'El usuario indicado ya es el titular actual de la empresa.';
  END IF;

  -- Validar que el destinatario sea un master_admin activo de la misma empresa
  SELECT role, is_active INTO v_target_role, v_target_active
  FROM public.company_members
  WHERE company_id = p_company_id AND user_id = p_new_owner_id;

  IF NOT FOUND OR NOT v_target_active OR v_target_role != 'master_admin' THEN
    RAISE EXCEPTION 'El nuevo titular debe ser un master_admin activo de la empresa.';
  END IF;

  -- Actualizar titularidad
  UPDATE public.companies
  SET owner_id = p_new_owner_id,
      updated_at = pg_catalog.now()
  WHERE id = p_company_id;

  -- Auditoría de traspaso de mando
  INSERT INTO public.audit_log (
    company_id, table_name, record_id, action, old_data, new_data, performed_by, actor_role
  ) VALUES (
    p_company_id, 'companies', p_company_id::text, 'UPDATE',
    jsonb_build_object('owner_id', v_caller_id),
    jsonb_build_object('owner_id', p_new_owner_id),
    v_caller_id, 'master_admin'
  );
END;
$$;

-- 4.6. deactivate_company: Desactivación lógica de una empresa (Exclusivo de owner_id)
CREATE OR REPLACE FUNCTION public.deactivate_company(
  p_company_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_current_owner_id UUID;
  v_is_active BOOLEAN;
  v_revoked_invitation RECORD;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;

  SELECT owner_id, is_active INTO v_current_owner_id, v_is_active
  FROM public.companies
  WHERE id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Empresa no encontrada.';
  END IF;

  IF NOT v_is_active THEN
    RAISE EXCEPTION 'La empresa ya se encuentra inactiva.';
  END IF;

  IF v_current_owner_id != v_caller_id THEN
    RAISE EXCEPTION 'Operación denegada: Solo el titular de la empresa puede desactivarla.';
  END IF;

  UPDATE public.companies
  SET is_active = false,
      updated_at = pg_catalog.now()
  WHERE id = p_company_id;

  -- M-06: Revocar invitaciones pendientes al desactivar la empresa y auditar individualmente
  FOR v_revoked_invitation IN
    UPDATE public.company_invitations
    SET status = 'revoked'
    WHERE company_id = p_company_id
      AND status = 'pending'
    RETURNING id
  LOOP
    INSERT INTO public.audit_log (
      company_id, table_name, record_id, action, old_data, new_data, performed_by, actor_role
    ) VALUES (
      p_company_id, 'company_invitations', v_revoked_invitation.id::text, 'UPDATE',
      jsonb_build_object('status', 'pending'),
      jsonb_build_object('status', 'revoked', 'reason', 'company_deactivation'),
      v_caller_id, 'master_admin'
    );
  END LOOP;

  INSERT INTO public.audit_log (
    company_id, table_name, record_id, action, old_data, new_data, performed_by, actor_role
  ) VALUES (
    p_company_id, 'companies', p_company_id::text, 'UPDATE',
    jsonb_build_object('is_active', true),
    jsonb_build_object('is_active', false, 'revoked_pending_invitations', true),
    v_caller_id, 'master_admin'
  );
END;
$$;

-- 4.7. reactivate_member: Reactivación explícita auditada de una membresía con jerarquía de titular
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
  v_caller_id UUID := auth.uid();
  v_owner_id UUID;
  v_old_is_active BOOLEAN;
  v_old_role TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;

  PERFORM private.assert_company_role(p_company_id, 'master_admin');

  SELECT owner_id INTO v_owner_id
  FROM public.companies
  WHERE id = p_company_id
  FOR NO KEY UPDATE;

  IF p_new_role NOT IN ('master_admin', 'employee') THEN
    RAISE EXCEPTION 'Rol no válido: %. Permitidos: master_admin, employee.', p_new_role;
  END IF;

  -- A-04: Jerarquía estricta: Solo el titular vigente (owner_id) puede reactivar o promover con rol master_admin
  IF p_new_role = 'master_admin' AND v_caller_id != v_owner_id THEN
    RAISE EXCEPTION 'Operación restringida: Solo el titular vigente de la empresa puede reactivar a un usuario con rol master_admin.';
  END IF;

  IF p_reason IS NULL OR pg_catalog.btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Se requiere especificar un motivo justificatorio para la reactivación.';
  END IF;

  SELECT is_active, role INTO v_old_is_active, v_old_role
  FROM public.company_members
  WHERE company_id = p_company_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membresía no encontrada para el usuario en esta empresa.';
  END IF;

  IF v_old_is_active = true THEN
    RAISE EXCEPTION 'El usuario ya es un miembro activo de esta empresa.';
  END IF;

  UPDATE public.company_members
  SET is_active = true,
      role = p_new_role,
      updated_at = pg_catalog.now()
  WHERE company_id = p_company_id AND user_id = p_user_id;

  INSERT INTO public.audit_log (
    company_id, table_name, record_id, action, old_data, new_data, performed_by, actor_role
  ) VALUES (
    p_company_id, 'company_members', p_user_id::text, 'UPDATE',
    jsonb_build_object('is_active', false, 'role', v_old_role),
    jsonb_build_object('is_active', true, 'role', p_new_role, 'reason', p_reason),
    v_caller_id, 'master_admin'
  );
END;
$$;

-- 4.8. revoke_company_invitation: Revocación explícita auditada de una invitación pendiente
CREATE OR REPLACE FUNCTION public.revoke_company_invitation(
  p_company_id UUID,
  p_invitation_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_invitation RECORD;
BEGIN
  PERFORM private.assert_company_role(p_company_id, 'master_admin');

  SELECT * INTO v_invitation
  FROM public.company_invitations
  WHERE id = p_invitation_id
    AND company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitación no encontrada en esta empresa.';
  END IF;

  IF v_invitation.status != 'pending' THEN
    RAISE EXCEPTION 'Solo se pueden revocar invitaciones en estado pendiente (estado actual: %).', v_invitation.status;
  END IF;

  UPDATE public.company_invitations
  SET status = 'revoked'
  WHERE id = p_invitation_id;

  INSERT INTO public.audit_log (
    company_id, table_name, record_id, action, old_data, new_data, performed_by, actor_role
  ) VALUES (
    p_company_id, 'company_invitations', p_invitation_id::text, 'UPDATE',
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'revoked'),
    v_caller_id, 'master_admin'
  );
END;
$$;

COMMENT ON FUNCTION public.revoke_company_invitation(UUID, UUID) IS 'Revocación explícita auditada de una invitación pendiente por parte de un master_admin de la empresa.';

-- ============================================================================
-- 5. SEGURIDAD, POLÍTICAS RLS Y PERMISOS DE TABLA
-- ============================================================================

-- Habilitar RLS en todas las tablas
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- 5.1. Políticas en profiles (Solo lectura y edición de perfil propio)
CREATE POLICY "profiles_select_own"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- 5.2. Políticas en companies (H-04: Miembros activos + acceso histórico a admins en inactivas)
CREATE POLICY "companies_select_member"
  ON public.companies
  FOR SELECT
  TO authenticated
  USING (id IN (SELECT private.my_accessible_company_ids()));

-- 5.3. Políticas en company_members (Visibilidad para colegas de empresas accesibles)
CREATE POLICY "company_members_select_colleagues"
  ON public.company_members
  FOR SELECT
  TO authenticated
  USING (company_id IN (SELECT private.my_accessible_company_ids()));

-- 5.4. Políticas en company_invitations (H-06: Normalización insensible a mayúsculas)
CREATE POLICY "company_invitations_select"
  ON public.company_invitations
  FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.company_members
      WHERE user_id = auth.uid() AND role = 'master_admin' AND is_active = true
    )
    OR pg_catalog.lower(email) = (SELECT pg_catalog.lower(email) FROM public.profiles WHERE id = auth.uid())
  );

-- 5.5. Políticas en audit_log (Solo lectura para master_admin de su empresa)
CREATE POLICY "audit_log_select_admin"
  ON public.audit_log
  FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.company_members
      WHERE user_id = auth.uid() AND role = 'master_admin' AND is_active = true
    )
  );

-- 5.6. company_counters no tiene políticas RLS de acceso: se bloquea totalmente de PostgREST
-- (Al tener RLS habilitado y ninguna política otorgada a authenticated, PostgREST retorna siempre 0 filas)

-- ============================================================================
-- 6. CONCESIÓN Y REVOCACIÓN DE PERMISOS
-- ============================================================================

GRANT USAGE ON SCHEMA public TO authenticated;

-- Permisos de lectura en tablas habilitadas
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE(full_name) ON public.profiles TO authenticated;
GRANT SELECT ON public.companies TO authenticated;
GRANT SELECT ON public.company_members TO authenticated;
GRANT SELECT ON public.company_invitations TO authenticated;
GRANT SELECT ON public.audit_log TO authenticated;
GRANT SELECT ON public.profiles_public TO authenticated;

-- Revocación de mutaciones directas (Cero escrituras directas desde el cliente web)
REVOKE INSERT, UPDATE, DELETE ON public.companies FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.company_members FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.company_invitations FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.company_counters FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.audit_log FROM authenticated, anon;

-- Permisos de ejecución de procedimientos RPC autorizados
GRANT EXECUTE ON FUNCTION public.local_today(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_company(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_user_to_company(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_company_invitation(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_company_ownership(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deactivate_company(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reactivate_member(UUID, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_company_invitation(UUID, UUID) TO authenticated;

-- M-08: Validador algorítmico concedido a authenticated y revocado de anon/PUBLIC
GRANT EXECUTE ON FUNCTION public.validate_cuit(TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.validate_cuit(TEXT) FROM PUBLIC, anon;

-- Revocar permisos a anon y PUBLIC sobre todas las funciones de negocio
REVOKE ALL ON FUNCTION public.local_today(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_company(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.invite_user_to_company(UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_company_invitation(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.transfer_company_ownership(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.deactivate_company(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reactivate_member(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_company_invitation(UUID, UUID) FROM PUBLIC, anon;

-- Funciones de triggers revocadas de todo rol web
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_immutable_modification() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_last_active_master_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_company_created_by() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_company_timezone() FROM PUBLIC, anon, authenticated;
