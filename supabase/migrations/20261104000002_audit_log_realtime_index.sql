-- Pantalla de Auditoría:
-- 1) índice para listar el registro de una empresa del más reciente al más antiguo;
-- 2) publica audit_log en Realtime para que la pantalla se actualice sola.
--
-- Realtime respeta RLS: audit_log solo es legible por los master_admin activos
-- de la empresa (política audit_log_select_admin), así que nadie más recibe avisos.

CREATE INDEX IF NOT EXISTS audit_log_company_created_idx
  ON public.audit_log (company_id, created_at DESC, id DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'audit_log'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_log;
  END IF;
END
$$;
