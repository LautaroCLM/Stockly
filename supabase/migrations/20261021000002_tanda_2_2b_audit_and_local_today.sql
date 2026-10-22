-- ============================================================================
-- MIGRACIÓN OFICIAL: TANDA 2.2B (MIGRACIÓN 1) - AUDITORÍA UNIVERSAL Y LOCAL_TODAY
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
-- Base de datos: PostgreSQL 17 / Supabase
-- Alcance:
--   1. Función de disparador universal public.audit_trigger() (PK parametrizable
--      vía TG_ARGV[0], record_id TEXT, performed_by anulable y filtro anti-ruido
--      en products cuando solo cambian current_stock y updated_at).
--   2. Disparadores de auditoría sobre tablas de catálogo y costos de Tanda 2.2:
--      categories, suppliers, products y product_costs('product_id').
--   3. Endurecimiento de public.local_today(p_company_id UUID) exigiendo
--      membresía activa mediante private.assert_company_role(p_company_id, NULL).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. FUNCIÓN DE DISPARADOR UNIVERSAL DE AUDITORÍA (public.audit_trigger)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pk_col TEXT := COALESCE(NULLIF(TG_ARGV[0], ''), 'id');
  v_old_json JSONB;
  v_new_json JSONB;
  v_ref_json JSONB;
  v_record_id TEXT;
  v_company_id UUID;
  v_user_id UUID := auth.uid();
  v_actor_role TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_new_json := pg_catalog.to_jsonb(NEW);
    v_ref_json := v_new_json;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old_json := pg_catalog.to_jsonb(OLD);
    v_new_json := pg_catalog.to_jsonb(NEW);
    v_ref_json := v_new_json;

    -- Filtro anti-ruido: en public.products, omitir cuando el UPDATE solo modifica current_stock y updated_at
    -- (los movimientos físicos ya quedan registrados de forma inmutable en stock_movements y movement_costs).
    IF TG_TABLE_SCHEMA = 'public' AND TG_TABLE_NAME = 'products' THEN
      IF (v_new_json - 'current_stock' - 'updated_at') IS NOT DISTINCT FROM (v_old_json - 'current_stock' - 'updated_at') THEN
        RETURN NEW;
      END IF;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    v_old_json := pg_catalog.to_jsonb(OLD);
    v_ref_json := v_old_json;
  ELSE
    RAISE EXCEPTION 'Operación de trigger no soportada en audit_trigger: %', TG_OP;
  END IF;

  -- Extraer identificador del registro como TEXT según columna indicada en TG_ARGV[0] (por omisión 'id')
  v_record_id := v_ref_json ->> v_pk_col;
  IF v_record_id IS NULL OR v_record_id = '' THEN
    RAISE EXCEPTION 'audit_trigger: no se pudo extraer la clave primaria (%) en la tabla %.%',
      v_pk_col, TG_TABLE_SCHEMA, TG_TABLE_NAME;
  END IF;

  -- Extraer company_id del registro (o id si la tabla auditada fuera companies)
  IF v_ref_json ? 'company_id' AND (v_ref_json ->> 'company_id') IS NOT NULL THEN
    v_company_id := (v_ref_json ->> 'company_id')::UUID;
  ELSIF TG_TABLE_SCHEMA = 'public' AND TG_TABLE_NAME = 'companies' THEN
    v_company_id := (v_ref_json ->> 'id')::UUID;
  END IF;

  -- Resolver actor_role solo cuando existe usuario autenticado y company_id
  IF v_user_id IS NOT NULL AND v_company_id IS NOT NULL THEN
    SELECT cm.role INTO v_actor_role
    FROM public.company_members cm
    WHERE cm.company_id = v_company_id
      AND cm.user_id = v_user_id
      AND cm.is_active = true;
  END IF;

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
    v_company_id,
    TG_TABLE_NAME,
    v_record_id,
    TG_OP,
    v_old_json,
    v_new_json,
    v_user_id,
    v_actor_role
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.audit_trigger() IS
  'Disparador universal AFTER INSERT OR UPDATE OR DELETE. Soporta PK vía TG_ARGV[0], record_id TEXT, performed_by anulable y filtro anti-ruido en products.';

-- Endurecimiento de permisos de ejecución sobre la función de disparador
REVOKE ALL ON FUNCTION public.audit_trigger() FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. CONEXIÓN DE DISPARADORES DE AUDITORÍA EN CATÁLOGO Y COSTOS (TANDA 2.2)
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS tr_audit_categories ON public.categories;
CREATE TRIGGER tr_audit_categories
  AFTER INSERT OR UPDATE OR DELETE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger('id');

DROP TRIGGER IF EXISTS tr_audit_suppliers ON public.suppliers;
CREATE TRIGGER tr_audit_suppliers
  AFTER INSERT OR UPDATE OR DELETE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger('id');

DROP TRIGGER IF EXISTS tr_audit_products ON public.products;
CREATE TRIGGER tr_audit_products
  AFTER INSERT OR UPDATE OR DELETE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger('id');

DROP TRIGGER IF EXISTS tr_audit_product_costs ON public.product_costs;
CREATE TRIGGER tr_audit_product_costs
  AFTER INSERT OR UPDATE OR DELETE ON public.product_costs
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger('product_id');

-- ----------------------------------------------------------------------------
-- 3. ENDURECIMIENTO DE public.local_today(p_company_id UUID)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.local_today(p_company_id UUID)
RETURNS DATE
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_timezone TEXT;
BEGIN
  -- Validar que la empresa exista, esté activa y que el usuario sea miembro activo (cualquier rol)
  PERFORM private.assert_company_role(p_company_id, NULL);

  SELECT c.timezone INTO v_timezone
  FROM public.companies c
  WHERE c.id = p_company_id;

  RETURN (pg_catalog.now() AT TIME ZONE COALESCE(v_timezone, 'America/Argentina/Buenos_Aires'))::DATE;
END;
$$;

COMMENT ON FUNCTION public.local_today(UUID) IS
  'Retorna la fecha actual en el huso horario de la empresa tras verificar membresía activa del usuario.';

GRANT EXECUTE ON FUNCTION public.local_today(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.local_today(UUID) FROM PUBLIC, anon;
