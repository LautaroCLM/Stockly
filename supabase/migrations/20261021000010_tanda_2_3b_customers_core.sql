-- ============================================================================
-- MIGRACIÓN OFICIAL: TANDA 2.3B - NÚCLEO DE CLIENTES Y GOBERNANZA MULTIEMPRESA
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
-- Base de datos: PostgreSQL 17 / Supabase
-- Tablas: customers
-- Relaciones: sales.customer_id (FK compuesta anti-cruce de tenants)
-- Funciones / RPCs: public.upsert_customer(...)
-- Triggers: tr_customers_updated_at, tr_customers_prevent_delete,
--           tr_sales_validate_customer_active
-- Seguridad: RLS forzado, Privilegios mínimos (REVOKE directo a PostgREST),
--            RPC SECURITY DEFINER con search_path = '' y validación en private.*
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TABLA: public.customers
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  identification_type TEXT NOT NULL DEFAULT 'DNI',
  tax_id TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),

  -- Clave compuesta obligatoria para FKs multi-tenant
  CONSTRAINT uq_customers_company_id UNIQUE (company_id, id),

  -- Validaciones de integridad y formato
  CONSTRAINT chk_customers_name_clean CHECK (name = pg_catalog.btrim(name) AND name <> '' AND pg_catalog.length(name) <= 200),
  CONSTRAINT chk_customers_id_type CHECK (identification_type IN ('DNI', 'CUIT', 'CUIL', 'PASAPORTE', 'OTRO', 'EXTRANJERO')),
  CONSTRAINT chk_customers_tax_id_clean CHECK (tax_id IS NULL OR (tax_id = pg_catalog.btrim(tax_id) AND tax_id <> '' AND pg_catalog.length(tax_id) <= 30)),
  CONSTRAINT chk_customers_tax_id_cuit CHECK (
    tax_id IS NULL OR identification_type NOT IN ('CUIT', 'CUIL') OR public.validate_cuit(tax_id)
  ),
  CONSTRAINT chk_customers_email CHECK (email IS NULL OR email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  CONSTRAINT chk_customers_phone CHECK (phone IS NULL OR (phone = pg_catalog.btrim(phone) AND phone <> '' AND pg_catalog.length(phone) <= 50)),
  CONSTRAINT chk_customers_address CHECK (address IS NULL OR (address = pg_catalog.btrim(address) AND address <> '' AND pg_catalog.length(address) <= 300)),
  CONSTRAINT chk_customers_notes CHECK (notes IS NULL OR (notes = pg_catalog.btrim(notes) AND pg_catalog.length(notes) <= 1000))
);

COMMENT ON TABLE public.customers IS 'Directorio de clientes comerciales aislado por tenant con soporte de consumidor final y validación CUIT/CUIL.';

-- Unicidad parcial: En una misma empresa no pueden existir dos clientes con el mismo tax_id (CUIT/CUIL/DNI)
CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_company_tax_id
  ON public.customers (company_id, tax_id)
  WHERE tax_id IS NOT NULL;

-- Índices de consulta y filtrado
CREATE INDEX IF NOT EXISTS idx_customers_company_clean_name
  ON public.customers (company_id, lower(pg_catalog.btrim(name)));

CREATE INDEX IF NOT EXISTS idx_customers_company_active
  ON public.customers (company_id, is_active);

-- ----------------------------------------------------------------------------
-- 2. TRIGGERS DEL CICLO DE VIDA DE CLIENTES
-- ----------------------------------------------------------------------------

-- 2.1. Actualización automática de updated_at
CREATE TRIGGER tr_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2.2. Blindaje contra eliminación física (inmutabilidad del historial)
CREATE OR REPLACE FUNCTION public.prevent_customer_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'No se permite la eliminación física de clientes para preservar el historial comercial. Utilice la desactivación lógica (is_active = false).';
END;
$$;

COMMENT ON FUNCTION public.prevent_customer_deletion() IS
  'Impide el borrado físico de clientes garantizando integridad referencial con ventas históricas.';

REVOKE ALL ON FUNCTION public.prevent_customer_deletion() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER tr_customers_prevent_delete
  BEFORE DELETE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.prevent_customer_deletion();

-- ----------------------------------------------------------------------------
-- 3. INTEGRACIÓN CON VENTAS (FOREIGN KEY COMPUESTA Y VALIDACIONES)
-- ----------------------------------------------------------------------------

-- 3.1. Saneamiento defensivo previo de registros huérfanos antes de la FK
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.sales s
    WHERE s.customer_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.customers c
        WHERE c.id = s.customer_id AND c.company_id = s.company_id
      )
  ) THEN
    UPDATE public.sales
    SET customer_id = NULL
    WHERE customer_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.customers c
        WHERE c.id = sales.customer_id AND c.company_id = sales.company_id
      );
  END IF;
END $$;

-- 3.2. Clave foránea compuesta anti-cruce de tenants hacia customers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_sales_customer'
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT fk_sales_customer FOREIGN KEY (company_id, customer_id)
      REFERENCES public.customers(company_id, id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sales_company_customer
  ON public.sales(company_id, customer_id)
  WHERE customer_id IS NOT NULL;

-- 3.3. Trigger para impedir asociar ventas a clientes inactivos
CREATE OR REPLACE FUNCTION public.validate_sale_customer_active()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_customer_active BOOLEAN;
BEGIN
  IF NEW.customer_id IS NOT NULL THEN
    SELECT is_active INTO v_customer_active
    FROM public.customers
    WHERE id = NEW.customer_id
      AND company_id = NEW.company_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'El cliente especificado no existe en la empresa.';
    END IF;

    IF NOT v_customer_active THEN
      RAISE EXCEPTION 'No se pueden registrar ventas asociadas a un cliente inactivo.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.validate_sale_customer_active() IS
  'Valida que el cliente asociado a una venta pertenezca al tenant y se encuentre activo.';

REVOKE ALL ON FUNCTION public.validate_sale_customer_active() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tr_sales_validate_customer_active ON public.sales;
CREATE TRIGGER tr_sales_validate_customer_active
  BEFORE INSERT OR UPDATE OF customer_id, company_id ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.validate_sale_customer_active();

-- ----------------------------------------------------------------------------
-- 4. SEGURIDAD Y ROW LEVEL SECURITY (RLS)
-- ----------------------------------------------------------------------------
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customers_select_member" ON public.customers;
CREATE POLICY "customers_select_member"
  ON public.customers
  FOR SELECT
  TO authenticated
  USING (company_id IN (SELECT private.my_accessible_company_ids()));

-- Revocación de mutaciones directas desde el cliente web
REVOKE ALL ON public.customers FROM PUBLIC, anon;
GRANT SELECT ON public.customers TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.customers FROM authenticated, anon;

-- ----------------------------------------------------------------------------
-- 5. FUNCIÓN RPC: public.upsert_customer
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_customer(
  p_company_id UUID,
  p_name TEXT,
  p_identification_type TEXT DEFAULT 'DNI',
  p_tax_id TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_address TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_customer_id UUID DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT true
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_clean_name TEXT;
  v_clean_id_type TEXT;
  v_clean_tax_id TEXT;
  v_clean_email TEXT;
  v_clean_phone TEXT;
  v_clean_address TEXT;
  v_clean_notes TEXT;
  v_customer_id UUID;
  v_old_customer RECORD;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Acceso denegado: usuario no autenticado.';
  END IF;

  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'El identificador de empresa (p_company_id) es obligatorio.';
  END IF;

  -- 1. Autorización estricta: Exclusivo para master_admin activo de la empresa
  PERFORM private.assert_company_role(p_company_id, 'master_admin');

  -- Bloqueo anti-TOCTOU
  PERFORM 1 FROM public.companies WHERE id = p_company_id FOR NO KEY UPDATE;
  PERFORM private.assert_company_role(p_company_id, 'master_admin');

  -- 2. Limpieza y normalización
  v_clean_name    := pg_catalog.btrim(COALESCE(p_name, ''));
  v_clean_id_type := pg_catalog.upper(pg_catalog.btrim(COALESCE(p_identification_type, 'DNI')));
  v_clean_tax_id  := NULLIF(pg_catalog.btrim(COALESCE(p_tax_id, '')), '');
  v_clean_email   := NULLIF(pg_catalog.lower(pg_catalog.btrim(COALESCE(p_email, ''))), '');
  v_clean_phone   := NULLIF(pg_catalog.btrim(COALESCE(p_phone, '')), '');
  v_clean_address := NULLIF(pg_catalog.btrim(COALESCE(p_address, '')), '');
  v_clean_notes   := NULLIF(pg_catalog.btrim(COALESCE(p_notes, '')), '');

  -- 3. Validaciones
  IF v_clean_name = '' OR pg_catalog.length(v_clean_name) > 200 THEN
    RAISE EXCEPTION 'El nombre del cliente es obligatorio y no puede superar 200 caracteres.';
  END IF;

  IF v_clean_id_type NOT IN ('DNI', 'CUIT', 'CUIL', 'PASAPORTE', 'OTRO', 'EXTRANJERO') THEN
    RAISE EXCEPTION 'Tipo de identificación inválido: %. Solo se permiten DNI, CUIT, CUIL, PASAPORTE, OTRO o EXTRANJERO.', v_clean_id_type;
  END IF;

  IF v_clean_tax_id IS NOT NULL THEN
    IF pg_catalog.length(v_clean_tax_id) > 30 THEN
      RAISE EXCEPTION 'El número de identificación no puede superar 30 caracteres.';
    END IF;

    IF v_clean_id_type IN ('CUIT', 'CUIL') AND NOT public.validate_cuit(v_clean_tax_id) THEN
      RAISE EXCEPTION 'El CUIT/CUIL ingresado no es válido según el algoritmo oficial.';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.customers
      WHERE company_id = p_company_id
        AND tax_id = v_clean_tax_id
        AND (p_customer_id IS NULL OR id != p_customer_id)
    ) THEN
      RAISE EXCEPTION 'Ya existe un cliente registrado con la identificación % en esta empresa.', v_clean_tax_id;
    END IF;
  END IF;

  IF v_clean_email IS NOT NULL AND v_clean_email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
    RAISE EXCEPTION 'El correo electrónico del cliente no tiene un formato válido.';
  END IF;

  -- 4. Operación atómica de inserción o actualización
  IF p_customer_id IS NULL THEN
    INSERT INTO public.customers (
      company_id,
      name,
      identification_type,
      tax_id,
      email,
      phone,
      address,
      notes,
      is_active,
      created_by
    ) VALUES (
      p_company_id,
      v_clean_name,
      v_clean_id_type,
      v_clean_tax_id,
      v_clean_email,
      v_clean_phone,
      v_clean_address,
      v_clean_notes,
      COALESCE(p_is_active, true),
      v_caller_id
    )
    RETURNING id INTO v_customer_id;

    -- Auditoría atómica de alta
    INSERT INTO public.audit_log (
      company_id,
      table_name,
      record_id,
      action,
      new_data,
      performed_by,
      actor_role
    ) VALUES (
      p_company_id,
      'customers',
      v_customer_id::TEXT,
      'INSERT',
      pg_catalog.jsonb_build_object(
        'name', v_clean_name,
        'identification_type', v_clean_id_type,
        'tax_id', v_clean_tax_id,
        'is_active', COALESCE(p_is_active, true)
      ),
      v_caller_id,
      'master_admin'
    );
  ELSE
    SELECT * INTO v_old_customer
    FROM public.customers
    WHERE id = p_customer_id
      AND company_id = p_company_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cliente no encontrado en la empresa especificada.';
    END IF;

    UPDATE public.customers
    SET name = v_clean_name,
        identification_type = v_clean_id_type,
        tax_id = v_clean_tax_id,
        email = v_clean_email,
        phone = v_clean_phone,
        address = v_clean_address,
        notes = v_clean_notes,
        is_active = COALESCE(p_is_active, true),
        updated_at = pg_catalog.now()
    WHERE id = p_customer_id
      AND company_id = p_company_id
    RETURNING id INTO v_customer_id;

    -- Auditoría atómica de actualización
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
      'customers',
      v_customer_id::TEXT,
      'UPDATE',
      pg_catalog.jsonb_build_object(
        'name', v_old_customer.name,
        'identification_type', v_old_customer.identification_type,
        'tax_id', v_old_customer.tax_id,
        'is_active', v_old_customer.is_active
      ),
      pg_catalog.jsonb_build_object(
        'name', v_clean_name,
        'identification_type', v_clean_id_type,
        'tax_id', v_clean_tax_id,
        'is_active', COALESCE(p_is_active, true)
      ),
      v_caller_id,
      'master_admin'
    );
  END IF;

  RETURN v_customer_id;
END;
$$;

COMMENT ON FUNCTION public.upsert_customer(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, BOOLEAN) IS
  'Crea o actualiza un cliente de la empresa con validaciones fiscales y auditoría. Exclusivo para master_admin activo.';

REVOKE ALL ON FUNCTION public.upsert_customer(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_customer(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, BOOLEAN) TO authenticated;
