-- ============================================================================
-- MIGRACIÓN: LOGO DE LA EMPRESA
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
--
-- Cada empresa puede tener un logo. La app lo reduce a 512 px y lo comprime antes de
-- subirlo, así que ocupa unas decenas de KB: se guarda como imagen en base64 dentro de
-- esta tabla (aparte de companies, para no cargarlo en cada consulta de la empresa).
--   * Lo ven todos los miembros de la empresa; solo el Master Admin lo cambia o lo quita.
--   * No lleva trigger de auditoría: el contenido de la imagen inflaría el registro.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.company_logos (
  company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  image TEXT NOT NULL
    CHECK (pg_catalog.length(image) <= 200000)
    CHECK (image ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.company_logos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_logos FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_logos_select" ON public.company_logos;
CREATE POLICY "company_logos_select"
  ON public.company_logos FOR SELECT TO authenticated
  USING (company_id IN (SELECT private.my_accessible_company_ids()));

REVOKE ALL ON public.company_logos FROM PUBLIC, anon;
GRANT SELECT ON public.company_logos TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.company_logos FROM authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'company_logos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.company_logos;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.set_company_logo(p_company_id UUID, p_image TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  PERFORM private.assert_company_role(p_company_id, 'master_admin');

  IF p_image IS NULL OR p_image !~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$' THEN
    RAISE EXCEPTION 'El logo debe ser una imagen PNG, JPG o WebP.';
  END IF;
  IF pg_catalog.length(p_image) > 200000 THEN
    RAISE EXCEPTION 'El logo es demasiado pesado (máximo unos 150 KB).';
  END IF;

  INSERT INTO public.company_logos (company_id, image, updated_by)
  VALUES (p_company_id, p_image, auth.uid())
  ON CONFLICT (company_id) DO UPDATE
    SET image = EXCLUDED.image, updated_at = now(), updated_by = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_company_logo(p_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  PERFORM private.assert_company_role(p_company_id, 'master_admin');
  DELETE FROM public.company_logos WHERE company_id = p_company_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_company_logo(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_company_logo(UUID, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.remove_company_logo(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_company_logo(UUID) TO authenticated;
