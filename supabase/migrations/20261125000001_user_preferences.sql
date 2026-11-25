-- ============================================================================
-- MIGRACIÓN: PREFERENCIAS PERSONALES DE CADA USUARIO
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
--
-- Ajustes que cada persona elige para su propia vista de la app. Hoy:
--   * hidden_routes: módulos que la persona ocultó de su menú lateral.
--
-- Ocultar un módulo es solo visual: NO quita acceso. Los permisos siguen
-- definidos por company_module_permissions y aplicados en la base.
-- Cada persona lee y cambia solo su propia fila (RLS).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  hidden_routes TEXT[] NOT NULL DEFAULT '{}'
    CHECK (pg_catalog.cardinality(hidden_routes) <= 50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

COMMENT ON TABLE public.user_preferences IS
  'Preferencias personales de vista (módulos ocultos del menú). Solo visual: no reemplaza permisos.';

DROP TRIGGER IF EXISTS tr_user_preferences_updated_at ON public.user_preferences;
CREATE TRIGGER tr_user_preferences_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_preferences_select_own" ON public.user_preferences;
CREATE POLICY "user_preferences_select_own"
  ON public.user_preferences FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "user_preferences_insert_own" ON public.user_preferences;
CREATE POLICY "user_preferences_insert_own"
  ON public.user_preferences FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "user_preferences_update_own" ON public.user_preferences;
CREATE POLICY "user_preferences_update_own"
  ON public.user_preferences FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

REVOKE ALL ON public.user_preferences FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.user_preferences TO authenticated;
