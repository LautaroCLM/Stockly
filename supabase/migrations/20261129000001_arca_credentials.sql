-- ============================================================================
-- MIGRACIÓN: FACTURA ELECTRÓNICA ARCA — TANDA 2: CERTIFICADO Y CONEXIÓN
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
--
--   * arca_settings.environment  ambiente activo: homologación (prueba) o producción
--   * arca_credentials           pedido de certificado (CSR), certificado y resultado de la
--                                última prueba, por empresa y ambiente. La clave privada vive
--                                cifrada en Supabase Vault; acá solo queda el id del secreto.
--   * arca_tokens                acceso de WSAA (dura 12 h). ARCA rechaza un login nuevo
--                                mientras el anterior sigue vigente, así que se guarda.
-- Nada de esto es legible desde el navegador: la Edge Function `arca` (service_role) es la
-- única que lee claves y tokens. El navegador ve el estado con get_arca_status.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. AMBIENTE ACTIVO (el paso a producción es la tanda 6)
-- ----------------------------------------------------------------------------
ALTER TABLE public.arca_settings
  ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'homologacion';

ALTER TABLE public.arca_settings DROP CONSTRAINT IF EXISTS chk_arca_settings_environment;
ALTER TABLE public.arca_settings ADD CONSTRAINT chk_arca_settings_environment
  CHECK (environment IN ('homologacion', 'produccion'));

-- ----------------------------------------------------------------------------
-- 2. CREDENCIALES Y TOKENS (solo service_role)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.arca_credentials (
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  environment TEXT NOT NULL CHECK (environment IN ('homologacion', 'produccion')),
  key_secret_id UUID NOT NULL,
  csr_pem TEXT NOT NULL CHECK (csr_pem LIKE '-----BEGIN CERTIFICATE REQUEST-----%'),
  certificate_pem TEXT CHECK (certificate_pem IS NULL OR certificate_pem LIKE '-----BEGIN CERTIFICATE-----%'),
  certificate_expires_at TIMESTAMPTZ,
  certificate_subject TEXT CHECK (certificate_subject IS NULL OR pg_catalog.length(certificate_subject) <= 300),
  last_test_at TIMESTAMPTZ,
  last_test_ok BOOLEAN,
  last_test_message TEXT CHECK (last_test_message IS NULL OR pg_catalog.length(last_test_message) <= 1000),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id),
  PRIMARY KEY (company_id, environment),
  CONSTRAINT chk_arca_credentials_cert CHECK ((certificate_pem IS NULL) = (certificate_expires_at IS NULL))
);

CREATE TABLE IF NOT EXISTS public.arca_tokens (
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  environment TEXT NOT NULL CHECK (environment IN ('homologacion', 'produccion')),
  service TEXT NOT NULL CHECK (service IN ('wsfe')),
  token TEXT NOT NULL,
  sign TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (company_id, environment, service)
);

-- El audit_trigger guardaría el registro completo: en credenciales se omite a propósito.
-- Los cambios quedan con updated_at / updated_by.

ALTER TABLE public.arca_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arca_credentials FORCE ROW LEVEL SECURITY;
ALTER TABLE public.arca_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arca_tokens FORCE ROW LEVEL SECURITY;
-- Sin políticas: ningún usuario las lee ni las escribe
REVOKE ALL ON public.arca_credentials, public.arca_tokens FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. ESTADO VISIBLE PARA EL EQUIPO (sin secretos)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_arca_status(p_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_env TEXT;
  v_is_admin BOOLEAN;
  c RECORD;
BEGIN
  IF auth.uid() IS NULL OR p_company_id IS NULL
     OR p_company_id NOT IN (SELECT private.my_accessible_company_ids()) THEN
    RAISE EXCEPTION 'Acceso denegado a la empresa.';
  END IF;

  SELECT COALESCE((SELECT environment FROM public.arca_settings WHERE company_id = p_company_id), 'homologacion')
  INTO v_env;
  v_is_admin := EXISTS (
    SELECT 1 FROM public.company_members
    WHERE company_id = p_company_id AND user_id = auth.uid() AND role = 'master_admin' AND is_active
  );

  SELECT * INTO c FROM public.arca_credentials WHERE company_id = p_company_id AND environment = v_env;

  RETURN jsonb_build_object(
    'environment', v_env,
    'hasCsr', c.company_id IS NOT NULL,
    -- El pedido de certificado no es secreto, pero solo el admin lo necesita para subirlo a ARCA
    'csrPem', CASE WHEN v_is_admin THEN c.csr_pem END,
    'hasCertificate', c.certificate_pem IS NOT NULL,
    'certificateExpiresAt', c.certificate_expires_at,
    'certificateSubject', c.certificate_subject,
    'lastTestAt', c.last_test_at,
    'lastTestOk', c.last_test_ok,
    'lastTestMessage', c.last_test_message
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_arca_status(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_arca_status(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. CONTEXTO DEL ADMIN: la Edge Function lo llama con el token del usuario
--    para confirmar que es Master Admin antes de tocar las credenciales.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.arca_admin_context(p_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company RECORD;
  s RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  PERFORM private.assert_company_role(p_company_id, 'master_admin');

  SELECT name, tax_id INTO v_company FROM public.companies WHERE id = p_company_id;
  SELECT environment, point_of_sale INTO s FROM public.arca_settings WHERE company_id = p_company_id;

  RETURN jsonb_build_object(
    'userId', auth.uid(),
    'companyName', v_company.name,
    'cuit', v_company.tax_id,
    'environment', COALESCE(s.environment, 'homologacion'),
    'pointOfSale', s.point_of_sale,
    'taxCondition', COALESCE(
      (SELECT tax_condition FROM public.document_settings WHERE company_id = p_company_id), 'responsable_inscripto'
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.arca_admin_context(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.arca_admin_context(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. OPERACIONES DE LA EDGE FUNCTION (solo service_role)
-- ----------------------------------------------------------------------------
-- Clave y pedido nuevos: reemplazan los anteriores y anulan el certificado viejo
-- (un certificado solo sirve con la clave con la que se pidió).
CREATE OR REPLACE FUNCTION public.arca_store_csr(
  p_company_id UUID, p_environment TEXT, p_private_key_pem TEXT, p_csr_pem TEXT, p_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old_secret UUID;
  v_secret UUID;
BEGIN
  IF p_private_key_pem NOT LIKE '-----BEGIN PRIVATE KEY-----%' THEN
    RAISE EXCEPTION 'Clave privada con formato inválido.';
  END IF;

  SELECT key_secret_id INTO v_old_secret
  FROM public.arca_credentials WHERE company_id = p_company_id AND environment = p_environment FOR UPDATE;

  v_secret := vault.create_secret(
    p_private_key_pem, NULL, pg_catalog.format('Clave ARCA %s (%s)', p_company_id, p_environment)
  );

  INSERT INTO public.arca_credentials (company_id, environment, key_secret_id, csr_pem, updated_by)
  VALUES (p_company_id, p_environment, v_secret, p_csr_pem, p_user_id)
  ON CONFLICT (company_id, environment) DO UPDATE SET
    key_secret_id = EXCLUDED.key_secret_id, csr_pem = EXCLUDED.csr_pem,
    certificate_pem = NULL, certificate_expires_at = NULL, certificate_subject = NULL,
    last_test_at = NULL, last_test_ok = NULL, last_test_message = NULL,
    updated_at = now(), updated_by = EXCLUDED.updated_by;

  DELETE FROM public.arca_tokens WHERE company_id = p_company_id AND environment = p_environment;
  IF v_old_secret IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = v_old_secret;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.arca_store_certificate(
  p_company_id UUID, p_environment TEXT, p_certificate_pem TEXT, p_expires_at TIMESTAMPTZ, p_subject TEXT, p_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.arca_credentials SET
    certificate_pem = p_certificate_pem, certificate_expires_at = p_expires_at, certificate_subject = p_subject,
    last_test_at = NULL, last_test_ok = NULL, last_test_message = NULL,
    updated_at = now(), updated_by = p_user_id
  WHERE company_id = p_company_id AND environment = p_environment;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Primero hay que generar el pedido de certificado.';
  END IF;
  DELETE FROM public.arca_tokens WHERE company_id = p_company_id AND environment = p_environment;
END;
$$;

CREATE OR REPLACE FUNCTION public.arca_get_credentials(p_company_id UUID, p_environment TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'privateKeyPem', d.decrypted_secret,
    'csrPem', c.csr_pem,
    'certificatePem', c.certificate_pem,
    'certificateExpiresAt', c.certificate_expires_at
  )
  FROM public.arca_credentials c
  JOIN vault.decrypted_secrets d ON d.id = c.key_secret_id
  WHERE c.company_id = p_company_id AND c.environment = p_environment;
$$;

CREATE OR REPLACE FUNCTION public.arca_store_test_result(
  p_company_id UUID, p_environment TEXT, p_ok BOOLEAN, p_message TEXT
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.arca_credentials
  SET last_test_at = now(), last_test_ok = p_ok, last_test_message = pg_catalog.left(p_message, 1000)
  WHERE company_id = p_company_id AND environment = p_environment;
$$;

-- Token vigente con al menos 5 minutos de margen
CREATE OR REPLACE FUNCTION public.arca_get_token(p_company_id UUID, p_environment TEXT, p_service TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object('token', token, 'sign', sign, 'expiresAt', expires_at)
  FROM public.arca_tokens
  WHERE company_id = p_company_id AND environment = p_environment AND service = p_service
    AND expires_at > now() + interval '5 minutes';
$$;

CREATE OR REPLACE FUNCTION public.arca_store_token(
  p_company_id UUID, p_environment TEXT, p_service TEXT, p_token TEXT, p_sign TEXT, p_expires_at TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.arca_tokens (company_id, environment, service, token, sign, expires_at)
  VALUES (p_company_id, p_environment, p_service, p_token, p_sign, p_expires_at)
  ON CONFLICT (company_id, environment, service) DO UPDATE SET
    token = EXCLUDED.token, sign = EXCLUDED.sign, expires_at = EXCLUDED.expires_at;
$$;

DO $$
DECLARE
  v_fn TEXT;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.arca_store_csr(UUID, TEXT, TEXT, TEXT, UUID)',
    'public.arca_store_certificate(UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT, UUID)',
    'public.arca_get_credentials(UUID, TEXT)',
    'public.arca_store_test_result(UUID, TEXT, BOOLEAN, TEXT)',
    'public.arca_get_token(UUID, TEXT, TEXT)',
    'public.arca_store_token(UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ)'
  ] LOOP
    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_fn);
    EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_fn);
  END LOOP;
END;
$$;
