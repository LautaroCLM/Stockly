# 04. Seguridad, Roles y Políticas RLS
**Módulo:** Control de Accesos, Políticas Row Level Security, Esquema Privado y Aislamiento Multiempresa  
**Versión:** 2.0  
**Fecha:** Octubre 2026  

---

## 1. Principio de Mínimo Privilegio y Blindaje Base

Para contrarrestar la configuración por defecto de Supabase (que otorga privilegios amplios `arwdDxtm` al rol `authenticated`) y garantizar que ninguna consulta no autenticada tenga acceso a la base de datos:

```sql
-- 1. Crear esquema privado no expuesto a la API REST de PostgREST
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

-- 2. Revocar todos los permisos a anon en public
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- 3. Configurar privilegios por defecto para nuevos objetos
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON ROUTINES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;

-- Revocar privilegios por defecto otorgados a authenticated en tablas creadas a futuro
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated;
```

---

## 2. Funciones de Autorización en Esquema `private`

Para evitar redundancia y maximizar el rendimiento mediante evaluación en caché de consulta, las reglas de membresía y rol residen en el esquema `private`:

```sql
-- Retorna el conjunto de IDs de empresas activas a las que pertenece el usuario autenticado
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

-- Verifica si el usuario autenticado ostenta un rol determinado en la empresa activa
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

-- Valida el rol y aborta inmediatamente con excepción si no se cumplen las condiciones
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
    RAISE EXCEPTION 'Acceso denegado: usuario no autenticado';
  END IF;

  SELECT is_active INTO v_company_active
  FROM public.companies
  WHERE id = p_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Empresa no encontrada';
  END IF;

  IF NOT v_company_active THEN
    RAISE EXCEPTION 'La empresa se encuentra inactiva. No se admiten operaciones';
  END IF;

  SELECT is_active, role INTO v_member_active, v_member_role
  FROM public.company_members
  WHERE company_id = p_company_id AND user_id = auth.uid();

  IF NOT FOUND OR NOT v_member_active THEN
    RAISE EXCEPTION 'El usuario no es un miembro activo de esta empresa';
  END IF;

  IF p_role IS NOT NULL AND v_member_role != p_role THEN
    RAISE EXCEPTION 'Operación restringida a usuarios con rol % en esta empresa', p_role;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.my_active_company_ids() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.has_company_role(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.assert_company_role(UUID, TEXT) FROM PUBLIC, anon, authenticated;
```

---

## 3. Matriz Completa de Permisos y RLS Multiempresa

Todas las vistas de la base de datos se crean obligatoriamente con `WITH (security_invoker = true)` para garantizar que PostgREST evalúe el RLS con la identidad del llamador y no del creador de la vista.

| Tabla | Operación | Rol `master_admin` | Rol `employee` | Detalle de la Política RLS |
|---|---|:---:|:---:|---|
| **`companies`** | SELECT | ✅ | ✅ | `id IN (SELECT private.my_active_company_ids())`. En empresas inactivas, solo admins vigentes conservan SELECT histórico. |
| | MUTACIONES | ❌ | ❌ | **Revocado para todos.** Altas y bajas se administran vía `create_company` y `deactivate_company`. |
| **`company_members`** | SELECT | ✅ Toda la empresa | 👤 Solo miembros de su empresa | `company_id IN (SELECT private.my_active_company_ids())`. |
| | MUTACIONES | ❌ | ❌ | **Revocado.** Se administran vía `invite_user_to_company`, `accept_company_invitation`, etc. |
| **`company_invitations`**| SELECT | ✅ | ❌ | `company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid() AND role = 'master_admin' AND is_active = true) OR email = (SELECT email FROM public.profiles WHERE id = auth.uid())`. |
| | MUTACIONES | ❌ | ❌ | **Revocado.** Gestionado exclusivamente por RPC. |
| **`company_counters`** | ALL | ❌ | ❌ | **Acceso revocado a PostgREST.** Solo administrado por funciones RPC en transacciones comerciales. |
| **`profiles`** | SELECT | 👤 Solo propio | 👤 Solo propio | `id = auth.uid()`. |
| | UPDATE | 👤 Solo propio | 👤 Solo propio | Modificación de nombre propio (`id = auth.uid()`). |
| **`profiles_public`** | SELECT | ✅ | ✅ | Vista `WITH (security_invoker = true)` para resolver nombres de auditores y vendedores. |
| **`categories`** | SELECT | ✅ | ✅ | `company_id IN (SELECT private.my_active_company_ids())`. |
| | INSERT / UPDATE / DELETE | ✅ | ❌ | Solo Admin de la empresa. |
| **`suppliers`** | SELECT | ✅ | ✅ | `company_id IN (SELECT private.my_active_company_ids())`. |
| | INSERT / UPDATE / DELETE | ✅ | ❌ | Solo Admin de la empresa. |
| **`customers`** | SELECT / INSERT / UPDATE | ✅ | ✅ | `company_id IN (SELECT private.my_active_company_ids())`. |
| | DELETE | ✅ | ❌ | Empleados no pueden eliminar clientes. |
| **`products`** | SELECT | ✅ | ✅ | `company_id IN (SELECT private.my_active_company_ids())`. |
| | INSERT / UPDATE (público) / DELETE | ✅ | ❌ | Solo Admin de la empresa. |
| | UPDATE `current_stock` | ❌ | ❌ | **Revocado para todos.** Exclusivo del trigger `sync_product_stock`. |
| **`product_costs`** | SELECT / ALL | ✅ | ❌ **(Bloqueado)** | `company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid() AND role = 'master_admin' AND is_active = true)`. Empleados tienen 0 visibilidad. |
| **`sales`** | SELECT | ✅ | ✅ | `company_id IN (SELECT private.my_active_company_ids())`. |
| | INSERT / UPDATE / DELETE | ❌ | ❌ | **100% Inmutable directo.** Gestionado por `process_sale` y `cancel_sale`. |
| **`sale_items`** | SELECT | ✅ | ✅ | `company_id IN (SELECT private.my_active_company_ids())`. |
| | INSERT / UPDATE / DELETE | ❌ | ❌ | **100% Inmutable.** |
| **`purchases`** | SELECT | ✅ | ❌ **(Bloqueado)** | Confidencial de Master Admin de la empresa. |
| | INSERT / UPDATE / DELETE | ❌ | ❌ | **Inmutable directo.** Gestionado por `register_purchase` y `cancel_purchase`. |
| **`purchase_items`** | SELECT | ✅ | ❌ **(Bloqueado)** | Confidencial de Master Admin de la empresa. |
| | INSERT / UPDATE / DELETE | ❌ | ❌ | **100% Inmutable.** |
| **`stock_movements`** | SELECT | ✅ | ✅ | `company_id IN (SELECT private.my_active_company_ids())`. |
| | INSERT / UPDATE / DELETE | ❌ | ❌ | **100% Inmutable directo.** Solo vía RPCs autorizadas. |
| **`movement_costs`** | SELECT / ALL | ✅ | ❌ **(Bloqueado)** | Costos confidenciales de Master Admin. |
| **`employees`** | SELECT / ALL | ✅ | ❌ **(Bloqueado)** | Nómina y sueldos confidenciales de Master Admin. |
| **`employee_settlements`** | SELECT | ✅ | ❌ **(Bloqueado)** | Sueldos confidenciales de Master Admin. |
| | INSERT / UPDATE / DELETE | ❌ | ❌ | **Inmutable directo.** Gestionado por RPCs. |
| **`transactions`** | SELECT | ✅ | ❌ **(Bloqueado)** | Tesorería confidencial de Master Admin. |
| | INSERT / UPDATE / DELETE | ❌ | ❌ | **Inmutable directo.** Gestionado por RPCs. |
| **`audit_log`** | SELECT | ✅ | ❌ **(Bloqueado)** | Auditoría confidencial de Master Admin de su empresa. |
| | INSERT / UPDATE / DELETE | ❌ | ❌ | **100% Inmutable.** Administrado por triggers de auditoría. |

---

## 4. Salvaguarda del Último Master Admin por Empresa

Para evitar que una empresa quede acéfala ante operaciones concurrentes que degraden o eliminen administradores, se bloquea la fila del tenant con `FOR NO KEY UPDATE`:

```sql
CREATE OR REPLACE FUNCTION public.check_last_active_master_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_other_admins INT;
BEGIN
  -- Bloqueo pesimista de fila en companies para la empresa afectada
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
        RAISE EXCEPTION 'No se puede desactivar ni remover el único master_admin activo de la empresa';
      END IF;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER tr_protect_last_company_admin
BEFORE UPDATE OR DELETE ON public.company_members
FOR EACH ROW EXECUTE FUNCTION public.check_last_active_master_admin();
```

---

## 5. Alta Segura de Perfiles Globales

`profiles` no almacena roles ni membresías. Cuando un usuario se registra en la plataforma:

```sql
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
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Usuario')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

El usuario solo adquiere privilegios en el momento en que crea una nueva empresa (convirtiéndose en su titular mediante `create_company()`) o acepta una invitación formal mediante `accept_company_invitation()`.

---

## 6. Seguridad en Storage y Realtime

### 6.1. Supabase Storage Multiempresa
- Los archivos adjuntos (comprobantes de compras, remitos, logos) se almacenan en buckets privados organizados por prefijo de empresa: `/{company_id}/{tipo}/{archivo}`.
- Políticas RLS sobre `storage.objects`:
  ```sql
  CREATE POLICY "Storage Company Member Access" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    (storage.foldername(name))[1]::uuid IN (SELECT private.my_active_company_ids())
  );

  CREATE POLICY "Storage Company Admin Upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    (storage.foldername(name))[1]::uuid IN (
      SELECT company_id FROM public.company_members
      WHERE user_id = auth.uid() AND role = 'master_admin' AND is_active = true
    )
  );
  ```
- No se permite el uso de cabeceras HTTP arbitrarias para inferir el tenant. El acceso se determina exclusivamente por el path del archivo y la pertenencia a la empresa en la base de datos.

### 6.2. Supabase Realtime
- Todas las tablas del esquema `public` añadidas a la publicación `supabase_realtime` tienen RLS habilitado.
- Supabase Realtime evalúa las políticas RLS vigentes en PostgreSQL para cada suscriptor websocket autenticado, impidiendo que clientes de una empresa reciban eventos de otra.
