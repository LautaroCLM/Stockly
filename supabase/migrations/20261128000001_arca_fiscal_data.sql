-- ============================================================================
-- MIGRACIÓN: FACTURA ELECTRÓNICA ARCA — TANDA 1: DATOS FISCALES
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
--
-- Prepara los datos que va a necesitar la factura electrónica (WSFEv1):
--   * arca_settings            por empresa: punto de venta electrónico, inicio de
--                              actividades e ingresos brutos (salen impresos en la factura)
--   * products.vat_rate        alícuota de IVA del producto (el precio de venta ya la incluye)
--   * customers.vat_condition  condición del cliente frente al IVA (obligatoria en ARCA desde la RG 5616)
-- La condición de IVA del emisor sigue en document_settings.tax_condition (una sola fuente).
-- No emite nada todavía: no hay conexión con ARCA en esta tanda.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. DATOS DE ARCA POR EMPRESA
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.arca_settings (
  company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE RESTRICT,
  -- Punto de venta "Web Services" dado de alta en ARCA (distinto al de los comprobantes internos)
  point_of_sale INTEGER CHECK (point_of_sale IS NULL OR point_of_sale BETWEEN 1 AND 99998),
  activity_start_date DATE CHECK (activity_start_date IS NULL OR activity_start_date >= DATE '1900-01-01'),
  gross_income_number TEXT CHECK (
    gross_income_number IS NULL OR (pg_catalog.btrim(gross_income_number) <> '' AND pg_catalog.length(gross_income_number) <= 30)
  ),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

DROP TRIGGER IF EXISTS tr_audit_arca_settings ON public.arca_settings;
CREATE TRIGGER tr_audit_arca_settings
  AFTER INSERT OR UPDATE OR DELETE ON public.arca_settings
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger('company_id');

ALTER TABLE public.arca_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arca_settings FORCE ROW LEVEL SECURITY;

-- Cualquier miembro que emita una factura necesita leerlos; solo el Master Admin los cambia
DROP POLICY IF EXISTS "arca_settings_select" ON public.arca_settings;
CREATE POLICY "arca_settings_select"
  ON public.arca_settings FOR SELECT TO authenticated
  USING (company_id IN (SELECT private.my_accessible_company_ids()));

REVOKE ALL ON public.arca_settings FROM PUBLIC, anon;
GRANT SELECT ON public.arca_settings TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.arca_settings FROM authenticated;

CREATE OR REPLACE FUNCTION public.save_arca_settings(
  p_company_id UUID,
  p_point_of_sale INTEGER,
  p_activity_start_date DATE,
  p_gross_income_number TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gross_income TEXT := NULLIF(pg_catalog.btrim(COALESCE(p_gross_income_number, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;
  PERFORM private.assert_company_role(p_company_id, 'master_admin');

  IF p_point_of_sale IS NOT NULL AND p_point_of_sale NOT BETWEEN 1 AND 99998 THEN
    RAISE EXCEPTION 'El punto de venta de ARCA debe estar entre 1 y 99998.';
  END IF;
  IF p_activity_start_date IS NOT NULL AND (p_activity_start_date < DATE '1900-01-01' OR p_activity_start_date > CURRENT_DATE) THEN
    RAISE EXCEPTION 'La fecha de inicio de actividades no es válida.';
  END IF;
  IF v_gross_income IS NOT NULL AND pg_catalog.length(v_gross_income) > 30 THEN
    RAISE EXCEPTION 'El número de ingresos brutos no puede superar 30 caracteres.';
  END IF;

  INSERT INTO public.arca_settings (company_id, point_of_sale, activity_start_date, gross_income_number, updated_by)
  VALUES (p_company_id, p_point_of_sale, p_activity_start_date, v_gross_income, auth.uid())
  ON CONFLICT (company_id) DO UPDATE SET
    point_of_sale = EXCLUDED.point_of_sale,
    activity_start_date = EXCLUDED.activity_start_date,
    gross_income_number = EXCLUDED.gross_income_number,
    updated_at = now(),
    updated_by = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.save_arca_settings(UUID, INTEGER, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_arca_settings(UUID, INTEGER, DATE, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. ALÍCUOTA DE IVA DEL PRODUCTO
--    Valores que acepta ARCA. Por defecto 21 %: es la alícuota general.
-- ----------------------------------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5, 2) NOT NULL DEFAULT 21.00;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS chk_products_vat_rate;
ALTER TABLE public.products ADD CONSTRAINT chk_products_vat_rate
  CHECK (vat_rate IN (0.00, 2.50, 5.00, 10.50, 21.00, 27.00));

CREATE OR REPLACE FUNCTION public.set_product_vat_rate(
  p_company_id UUID,
  p_product_id UUID,
  p_vat_rate NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_company_id IS NULL OR p_product_id IS NULL THEN
    RAISE EXCEPTION 'Los identificadores de empresa y producto son obligatorios.';
  END IF;
  PERFORM private.assert_module_access(p_company_id, ARRAY['productos'], 'operate');

  IF p_vat_rate IS NULL OR p_vat_rate NOT IN (0.00, 2.50, 5.00, 10.50, 21.00, 27.00) THEN
    RAISE EXCEPTION 'Alícuota de IVA inválida. Valores permitidos: 0 %%, 2,5 %%, 5 %%, 10,5 %%, 21 %% y 27 %%.';
  END IF;

  UPDATE public.products
  SET vat_rate = p_vat_rate, updated_at = pg_catalog.now()
  WHERE id = p_product_id AND company_id = p_company_id AND vat_rate IS DISTINCT FROM p_vat_rate;

  IF NOT FOUND AND NOT EXISTS (
    SELECT 1 FROM public.products WHERE id = p_product_id AND company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Producto no encontrado en la empresa especificada.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_product_vat_rate(UUID, UUID, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_product_vat_rate(UUID, UUID, NUMERIC) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. CONDICIÓN DEL CLIENTE FRENTE AL IVA
--    Los clientes existentes quedan como consumidor final (lo más común en mostrador).
-- ----------------------------------------------------------------------------
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS vat_condition TEXT NOT NULL DEFAULT 'consumidor_final';

ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS chk_customers_vat_condition;
ALTER TABLE public.customers ADD CONSTRAINT chk_customers_vat_condition CHECK (vat_condition IN (
  'consumidor_final', 'responsable_inscripto', 'monotributo', 'exento', 'no_alcanzado'
));

CREATE OR REPLACE FUNCTION public.set_customer_vat_condition(
  p_company_id UUID,
  p_customer_id UUID,
  p_vat_condition TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_customer RECORD;
BEGIN
  IF p_company_id IS NULL OR p_customer_id IS NULL THEN
    RAISE EXCEPTION 'Los identificadores de empresa y cliente son obligatorios.';
  END IF;
  PERFORM private.assert_module_access(p_company_id, ARRAY['clientes'], 'operate');

  IF p_vat_condition IS NULL OR p_vat_condition NOT IN (
    'consumidor_final', 'responsable_inscripto', 'monotributo', 'exento', 'no_alcanzado'
  ) THEN
    RAISE EXCEPTION 'Condición frente al IVA inválida.';
  END IF;

  SELECT identification_type, tax_id INTO v_customer
  FROM public.customers
  WHERE id = p_customer_id AND company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente no encontrado en la empresa especificada.';
  END IF;

  -- La Factura A exige el CUIT del comprador
  IF p_vat_condition = 'responsable_inscripto'
     AND (v_customer.identification_type <> 'CUIT' OR v_customer.tax_id IS NULL) THEN
    RAISE EXCEPTION 'Un cliente Responsable Inscripto necesita un CUIT cargado.';
  END IF;

  UPDATE public.customers
  SET vat_condition = p_vat_condition, updated_at = pg_catalog.now()
  WHERE id = p_customer_id AND company_id = p_company_id AND vat_condition IS DISTINCT FROM p_vat_condition;
END;
$$;

REVOKE ALL ON FUNCTION public.set_customer_vat_condition(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_customer_vat_condition(UUID, UUID, TEXT) TO authenticated;
