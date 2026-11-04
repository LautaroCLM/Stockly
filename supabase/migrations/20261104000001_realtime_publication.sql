-- Publica en Supabase Realtime las tablas que la app muestra, para que cada
-- usuario vea al instante los cambios hechos por otros usuarios de su empresa.
--
-- Realtime respeta RLS: cada suscriptor solo recibe filas que puede leer con
-- SELECT, así que esto no expone datos entre empresas.
-- Idempotente: solo agrega las tablas que todavía no están publicadas.

DO $$
DECLARE
  target_table text;
  target_tables text[] := ARRAY[
    'companies',
    'company_members',
    'company_invitations',
    'categories',
    'products',
    'product_costs',
    'stock_movements',
    'sales',
    'purchases',
    'suppliers',
    'customers'
  ];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  FOREACH target_table IN ARRAY target_tables LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = target_table
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', target_table);
    END IF;
  END LOOP;
END
$$;
