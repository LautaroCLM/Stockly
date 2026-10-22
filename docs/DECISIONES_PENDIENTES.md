# STOCKLY — DECISIONES DE ARQUITECTURA Y DISEÑO PENDIENTES

**Fecha:** 20 de octubre de 2026<br>
**Propósito:** Consolidar las definiciones arquitectónicas y de seguridad detectadas durante la auditoría de las Tandas 2.0, 2.1 y 2.2A que requieren resolución formal para la **Tanda 2.2B** (luego de establecer la línea base de ejecución local actual).

---

## 1. Política de Stock Negativo (`companies.allow_negative_stock`) y Gobernanza Auditada

### Contexto y Discrepancia
- En [`docs/spec/01-arquitectura.md:24-25`](file:///c:/Users/herna/Desktop/Stockly/docs/spec/01-arquitectura.md#L24-L25) y [`02-modelo-datos.md:646-649`](file:///c:/Users/herna/Desktop/Stockly/docs/spec/02-modelo-datos.md#L646-L649) se especifica que el stock negativo está permitido para no frenar la operatoria comercial (mostrando alerta `--danger` en la UI).
- En la migración [`20261021000001:15-16`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L15-L16) se agregó `companies.allow_negative_stock BOOLEAN NOT NULL DEFAULT false` y el trigger `sync_product_stock()` aborta si `new_stock < 0` cuando el flag es `false` ([`L290-293`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L290-L293)).
- Además, `companies` tiene `REVOKE UPDATE` para `authenticated` ([`20261016000002:1080`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L1080)) y **no existe ninguna función RPC** para modificar esa configuración ni para auditar quién la cambia.

### Opciones
- **Opción A (Recomendada):** Mantener `companies.allow_negative_stock` como configuración por empresa pero con **`DEFAULT true`** (alineado con la necesidad operativa de las pymes de no bloquear ventas por desfasajes de carga de compras), y crear en Tanda 2.2B una función RPC `public.set_company_negative_stock_policy(p_company_id UUID, p_allow_negative_stock BOOLEAN, p_reason TEXT)` restringida a `master_admin` (o `owner_id`) que actualice el flag con bloqueo `FOR UPDATE` y registre el cambio (`old_data`, `new_data`, `reason`, `performed_by`) en `public.audit_log`.
- **Opción B:** Mantener `DEFAULT false` (estricto por omisión) y agregar la misma RPC auditada `set_company_negative_stock_policy` para que cada empresa pueda habilitarlo explícitamente.
- **Opción C:** Eliminar la columna `allow_negative_stock` y permitir siempre saldos negativos en todas las empresas sin excepción.

---

## 2. Verificación Estricta de Revocación de Acceso a Miembro Desactivado (`company_members.is_active = false`)

### Contexto y Brecha Detectada
- Cuando a un miembro se le da de baja en una empresa (`company_members.is_active = false`), debe perder de inmediato **todo acceso de lectura y escritura** a los datos de esa empresa sin necesidad de que expire su JWT de Supabase Auth.
- Actualmente `01_tanda_2_0_and_2_1.test.sql` solo prueba que un miembro inactivo no puede recibir una invitación ordinaria (`TEST 31`), pero **ninguna suite verifica** que un usuario con `company_members.is_active = false` obtiene `0 filas` en `products`, `categories`, `suppliers`, `stock_movements` y recibe excepción `P0001` al invocar `register_stock_adjustment` o `import_initial_stock`.

### Opciones
- **Opción A (Recomendada):** Incorporar de forma obligatoria una función RPC auditada `public.deactivate_member(p_company_id UUID, p_user_id UUID, p_reason TEXT)` (respetando la salvaguarda del último `master_admin` y jerarquía de `owner_id`) y agregar pruebas pgTAP dedicadas que comprueben que, inmediatamente después de pasar `is_active = false`:
  1. `SELECT` sobre `companies`, `categories`, `suppliers`, `products` y `stock_movements` devuelve `0 filas`.
  2. `SELECT` sobre `product_costs`, `movement_costs` y `audit_log` (incluso si su rol era `master_admin`) devuelve `0 filas`.
  3. Cualquier invocación a RPCs operativas (`register_stock_adjustment`, `import_initial_stock`, etc.) falla con excepción de autorización.
- **Opción B:** Agregar únicamente el test en pgTAP simulando el `UPDATE company_members SET is_active = false` con `RESET ROLE`, dejando la RPC `deactivate_member` para la Tanda 2.4 (Empleados/RRHH).

---

## 3. Alcance de la Clave de Idempotencia y Política de Expiración (`operation_idempotency`)

### Contexto y Riesgo Actual
- En [`20261021000001:221-233`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L221-L233), la tabla `public.operation_idempotency` define la restricción:
  `CONSTRAINT uq_operation_idempotency UNIQUE (company_id, operation_type, idempotency_key)`
- No acota la clave por el usuario que ejecuta la acción (`created_by`) y **no posee columna `expires_at` ni mecanismo de vencimiento de 24 horas**.

### Opciones
- **Opción A (Recomendada):** En Tanda 2.2B:
  1. Acotar la restricción única incluyendo al usuario: **`UNIQUE (company_id, created_by, operation_type, idempotency_key)`** e incluir `created_by` en el `WHERE` del `SELECT ... FOR UPDATE` y `UPDATE` de las RPCs.
  2. Agregar la columna `expires_at TIMESTAMPTZ NOT NULL DEFAULT (pg_catalog.now() + interval '24 hours')` con índice sobre `expires_at`.
  3. En el bucle de adquisición de idempotencia, si existe un registro previo con la misma clave pero con `expires_at <= pg_catalog.now()`, eliminarlo (o reciclarlo) para que el vencimiento de **24 horas** sea efectivo transaccionalmente sin depender solo de un cron externo.
- **Opción B:** Mantener la unicidad solo por `(company_id, operation_type, idempotency_key)` y agregar únicamente la columna `expires_at` de 24 horas.

---

## 4. Arquitectura de Base Compartida (Pooled SaaS), Riesgos y Suite de Aislamiento Entre Empresas

### Contexto y Análisis de Riesgos
- El código actual implementa una única base de datos compartida (Pooled Tenancy) donde todas las funciones reciben `p_company_id UUID` enviado por el cliente.
- **Riesgos inherentes al modelo Pooled:**
  1. Cualquier olvido de `PERFORM private.assert_company_role(p_company_id, ...)` en una función `SECURITY DEFINER` abre una fuga entre empresas. **Evidencia real:** hoy `public.local_today(p_company_id UUID)` ([`20261016000002:444-455`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L444-L455)) es `SECURITY DEFINER`, ejecutable por `authenticated` y no valida membresía.
  2. Si una función valida `p_company_id` pero olvida filtrar por `company_id` al consultar o actualizar una tabla hija por `id`, un usuario de la Empresa A podría operar sobre un registro de la Empresa B pasando su propio `p_company_id` y el `product_id` ajeno (mitigado cuando se usan FKs compuestas `(company_id, product_id)` y cláusulas `WHERE company_id = p_company_id AND id = p_product_id`).
  3. `public.create_company` está concedida a cualquier `authenticated` sin límite de creación de tenants.

### Recomendación y Batería Obligatoria de Tests de Aislamiento
- **Recomendación:** **No cambiar de arquitectura antes de tener la línea base de tests ejecutada y verificada.** Mantener el esquema actual para completar la primera ejecución local y exigir en Tanda 2.2B la corrección de `local_today()` y la siguiente **matriz obligatoria de pruebas de aislamiento cruzado (Empresa A vs. Empresa B)**:
  1. **Lectura directa (RLS):** `admin_a` y `employee_a` consultan `categories`, `suppliers`, `products`, `product_costs`, `stock_movements`, `movement_costs`, `operation_idempotency` y `audit_log` de `company_b` -> debe devolver `0 filas`.
  2. **Ataque de Tenant directo en RPCs:** `admin_a` invoca `register_stock_adjustment` e `import_initial_stock` pasando `p_company_id = company_b` y `p_product_id = prod_b1` -> debe abortar en `private.assert_company_role` (`P0001`).
  3. **Ataque de Cruce de Entidad (Cross-Tenant ID Injection):** `admin_a` invoca `register_stock_adjustment` e `import_initial_stock` pasando su propia empresa `p_company_id = company_a`, pero inyectando `p_product_id = prod_b1` (de la Empresa B) -> debe abortar con `Producto ... no encontrado en la empresa` (`P0001`) sin tocar el stock de B.
  4. **Integridad Relacional Compuesta (FK Cross-Tenant):** Intento (incluso bajo rol propietario/`RESET ROLE`) de insertar un producto en `company_a` apuntando a `category_id` o `supplier_id` de `company_b`, o un movimiento en `company_a` apuntando a `prod_b1` -> debe abortar con violación de clave foránea `23503`.
  5. **Colisión legítima de SKU / Código de barras e Idempotencia entre empresas:** `company_a` y `company_b` registran el mismo `sku = 'TALADRO-01'` y usan exactamente el mismo UUID de `idempotency_key` -> ambas operaciones deben tener éxito de forma independiente sin interferir entre sí.
  6. **Aislamiento en utilidades y feeds:** `admin_a` invoca `local_today(company_b)` (tras agregarle `assert_company_role`) y `get_activity_feed(company_b, ...)` -> debe abortar por falta de membresía en B.

---

## 5. Estrategia para el CRUD del Catálogo y Auditoría Universal (`audit_trigger`) en Tanda 2.2B

### Contexto y Discrepancia
- Hoy en `20261021000001` todas las tablas del catálogo (`categories`, `suppliers`, `products`, `product_costs`) tienen `REVOKE ALL` salvo `SELECT` para `authenticated` ([`L833-848`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L833-L848)). No hay forma de crear ni editar productos, categorías, proveedores ni costos desde la aplicación.
- Al mismo tiempo, `public.audit_trigger()` no fue creado en ninguna migración.

### Opciones
- **Opción A (Recomendada — Funciones `SECURITY DEFINER` + `audit_trigger` como red de seguridad):**
  1. **Cero escritura directa por RLS desde el cliente:** Mantener `REVOKE INSERT, UPDATE, DELETE` para `authenticated` en todas las tablas de catálogo y costos.
  2. **Escritura exclusivamente vía funciones RPC `SECURITY DEFINER`** (`upsert_category`, `upsert_supplier`, `create_product`, `update_product`, `update_product_cost`, `bulk_update_prices`, `import_products`), todas con `SET search_path = ''`, validación `private.assert_company_role(p_company_id, 'master_admin')`, creación atómica de `product_costs` al crear el producto y validaciones de negocio en el servidor.
  3. **Implementar además `public.audit_trigger()` como red de seguridad universal** en todas las tablas (`companies`, `company_members`, `company_invitations`, `categories`, `suppliers`, `products`, `product_costs`), soportando PK variable (`TG_ARGV[0]`), `record_id TEXT`, `performed_by` anulable y omisión de ruido cuando en `products` solo cambian `current_stock` y `updated_at`.
- **Opción B:** Habilitar `GRANT INSERT, UPDATE, DELETE` a `authenticated` en `categories`, `suppliers`, `products` y `product_costs` gobernado por políticas RLS de `master_admin` y auditado únicamente por `audit_trigger()`.


---

## 6. Endurecimiento de `FORCE ROW LEVEL SECURITY` y Subconsultas `(SELECT ...)` en Políticas RLS de Tanda 2.1 (Diferido)

### Contexto y Motivo de Diferimiento
- En [`20261016000002:1001-1060`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L1001-L1060) las 6 tablas del núcleo (`profiles`, `companies`, `company_members`, `company_invitations`, `company_counters`, `audit_log`) tienen `ENABLE ROW LEVEL SECURITY` (sin `FORCE ROW LEVEL SECURITY`) y algunas políticas invocan `auth.uid()` directo sin subconsulta `(SELECT auth.uid())`.
- En PostgreSQL, `FORCE ROW LEVEL SECURITY` sujeta al rol propietario de la tabla a las políticas RLS, pero **no** hace que un superusuario ni un rol con el atributo `BYPASSRLS` quede sujeto a dichas políticas.
- Por lo tanto, cualquier análisis de impacto debe evaluarse según los roles propietarios efectivos (`OWNER`) de las tablas y de las funciones `SECURITY DEFINER` involucradas en cada entorno (y si dichos roles poseen o no `BYPASSRLS`), en lugar de asumir a priori que las funciones actuales quedarían bloqueadas.

### Decisión Adoptada
- **Diferido por alcance como trabajo de endurecimiento futuro con evaluación y suite de regresión propias:** En la Tanda 2.2B **no** se agregará `FORCE ROW LEVEL SECURITY` ni se reescribirán las políticas RLS de las tablas de Tanda 2.1, preservando intacto el alcance ya verificado por las 58 aserciones de `01_tanda_2_0_and_2_1.test.sql`.
- Cualquier cambio futuro sobre `FORCE ROW LEVEL SECURITY` o sobre las expresiones RLS de Tanda 2.1 deberá contar con su propio análisis de roles propietarios efectivos y una suite de pruebas de regresión específica.
