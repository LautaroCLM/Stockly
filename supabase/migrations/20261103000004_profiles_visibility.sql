-- ============================================================================
-- MIGRACIÓN INCREMENTAL: VISIBILIDAD DE PERFILES ENTRE COMPAÑEROS (Hallazgo H-08)
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
-- Problema: la política profiles_select_own solo deja ver el perfil propio y la vista
--           profiles_public (security_invoker) heredaba esa restricción. Resultado:
--           Miembros sin nombres ni emails y el Historial con "Personal autorizado".
-- Solución:
--   1. Nombres: profiles_public muestra id y full_name del propio usuario y de quienes
--      tienen o tuvieron membresía en sus empresas accesibles (los ex miembros siguen
--      apareciendo como autores en el historial). No expone emails.
--   2. Emails: nueva política sobre profiles para que un master_admin activo lea los
--      perfiles completos de los miembros de sus empresas. Un empleado sigue viendo solo
--      su propio perfil en la tabla base.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. FUNCIONES DE AUTORIZACIÓN (esquema private, evaluadas por RLS)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.my_colleague_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT DISTINCT cm.user_id
  FROM public.company_members cm
  WHERE cm.company_id IN (SELECT private.my_accessible_company_ids());
$$;

COMMENT ON FUNCTION private.my_colleague_ids() IS
  'Usuarios con membresía (activa o histórica) en las empresas accesibles de auth.uid().';

CREATE OR REPLACE FUNCTION private.my_managed_member_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT DISTINCT cm.user_id
  FROM public.company_members cm
  JOIN public.company_members me ON me.company_id = cm.company_id
  WHERE me.user_id = auth.uid()
    AND me.is_active = true
    AND me.role = 'master_admin'
    AND cm.company_id IN (SELECT private.my_accessible_company_ids());
$$;

COMMENT ON FUNCTION private.my_managed_member_ids() IS
  'Usuarios con membresía en las empresas accesibles donde auth.uid() es master_admin activo.';

REVOKE ALL ON FUNCTION private.my_colleague_ids() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.my_managed_member_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.my_colleague_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION private.my_managed_member_ids() TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. EMAILS: LECTURA DE PERFILES COMPLETOS PARA MASTER_ADMIN DE LA EMPRESA
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_select_managed_members" ON public.profiles;
CREATE POLICY "profiles_select_managed_members"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id IN (SELECT private.my_managed_member_ids()));

-- ----------------------------------------------------------------------------
-- 3. NOMBRES: VISTA FILTRADA DE COMPAÑEROS
-- ----------------------------------------------------------------------------
-- La vista corre con los permisos de su dueño (no security_invoker) para poder leer los
-- nombres sin abrir la tabla base; el filtro explícito por auth.uid() la acota a los
-- compañeros del usuario y solo expone id y full_name.
CREATE OR REPLACE VIEW public.profiles_public
WITH (security_invoker = false)
AS
SELECT p.id, p.full_name
FROM public.profiles p
WHERE p.id = auth.uid()
   OR p.id IN (SELECT private.my_colleague_ids());

COMMENT ON VIEW public.profiles_public IS
  'Nombres (sin email) del usuario y de quienes comparten o compartieron empresa con él. Filtrada por auth.uid().';

REVOKE ALL ON public.profiles_public FROM PUBLIC, anon;
GRANT SELECT ON public.profiles_public TO authenticated;
