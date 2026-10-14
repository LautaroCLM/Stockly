# 05. Estrategia de Tests y Plan de Ejecución (Fase 2)
**Módulo:** Suite de Pruebas de Base de Datos y Desglose de Tandas de Implementación Multiempresa (Pooled SaaS)  
**Versión:** 2.0  
**Fecha:** Octubre 2026  

---

## 1. Estrategia de Pruebas de Base de Datos

Siguiendo la regla de "cero errores" de [AGENTS.md](file:///c:/Users/herna/Desktop/Stockly/AGENTS.md), la arquitectura multiempresa compartida (pooled) exige una verificación exhaustiva en capas para asegurar que ningún dato ni operación cruce los límites de una empresa.

### 1.1. Matriz Categórica de Pruebas

```
┌────────────────────────────────────────────────────────────────────────┐
│                   SUITE DE VERIFICACIÓN MULTIEMPRESA                   │
├───────────────────┬───────────────────┬──────────────────┬─────────────┤
│  Capa 1: Modelo   │   Capa 2: RLS     │  Capa 3: RPCs    │   Capa 4:   │
│  e Integridad     │   Aislamiento     │  Concurrencia y  │ Concurrencia│
│  Compuesta        │   Autenticado     │  Transacciones   │ Multi-Sesión│
└───────────────────┴───────────────────┴──────────────────┴─────────────┘
```

#### 1. Integridad Relacional y Claves Compuestas
- **Aislamiento por Clave Foránea:** Comprobar que es imposible insertar una venta en la Empresa A referenciando un cliente o producto de la Empresa B, arrojando violación de FK compuesta `(company_id, foreign_id)`.
- **Semántica `MATCH SIMPLE`:** Comprobar que en FKs opcionales (`customer_id NULL`), si el ID es nulo la inserción procede, pero si se informa un ID, se exige estricta coincidencia con la misma `company_id`.
- **Unicidad por Empresa:** Verificar que dos empresas distintas pueden registrar el mismo SKU, código de barras o DNI de empleado sin colisión, mientras que dentro de la misma empresa el duplicado es rechazado.

#### 2. Aislamiento RLS con Claims Autenticadas
> [!IMPORTANT]
> Las pruebas de RLS se ejecutan estrictamente bajo el rol `authenticated` configurando las variables de sesión del JWT (`SET LOCAL ROLE authenticated; SET LOCAL "request.jwt.claims" = '{"sub": "...", "role": "authenticated"}';`). Está terminantemente prohibido validar RLS usando el rol superusuario `postgres` o conexiones con atributo `BYPASSRLS`.
- **Hermeticidad entre Tenants:** El usuario de la Empresa A no puede leer ni mutar ninguna fila perteneciente a la Empresa B (todas las consultas retornan 0 filas).
- **Confidencialidad de Costos y Finanzas:** Empleados autenticados de la Empresa A obtienen 0 filas al consultar `product_costs`, `movement_costs`, `purchases`, `purchase_items`, `transactions` y `audit_log`.
- **Empresa Desactivada:** Si `companies.is_active = false`, las consultas ordinarias de empleados quedan bloqueadas; el titular y administradores vigentes conservan acceso de solo lectura para auditoría legal; todas las mutaciones son rechazadas.

#### 3. Autorización y Jerarquía en Funciones Privilegiadas (RPCs)
- **Jerarquía de Administradores:** Un `master_admin` común no puede invitar ni promover a otro `master_admin`, recibiendo excepción controlada. Dicha operación solo procede si `auth.uid() = companies.owner_id`.
- **Reactivación Explícita:** Comprobar que una invitación nueva no reactiva a un usuario con membresía previa revocada. La reactivación requiere invocar `reactivate_member` auditando el motivo.
- **Protección del Último Admin:** Intentos concurrentes o individuales de degradar, desactivar o eliminar al único `master_admin` activo de una empresa son abortados mediante el trigger con bloqueo pesimista `FOR NO KEY UPDATE` en `companies`.
- **Traspaso de Titularidad:** `transfer_company_ownership` solo puede ser ejecutado por el `owner_id` vigente y transfiere la titularidad exclusivamente a otro `master_admin` activo.

#### 4. Concurrencia Pesimista Multi-Sesión TCP Real
- **Prueba de Carrera en Productos:** 10 transacciones paralelas en conexiones TCP independientes ejecutando `process_sale` sobre los mismos productos. Validación de que el ordenamiento `ORDER BY id FOR UPDATE` previene deadlocks y `current_stock` coincide con el delta total.
- **Prueba de Carrera en Numeración:** Concurrencia pesimista en `company_counters` ejecutando ventas simultáneas. Validación de correlatividad perfecta (`VTA-00000001`, `VTA-00000002`...) sin huecos no revertidos ni colisiones de clave única.
- **Stock Negativo:** Verificación de que una venta autorizada con saldo insuficiente decrementa el stock dejando `current_stock < 0` sin fallar la transacción, congelando el costo al último valor de reposición.

---

## 2. Plan de Ejecución de la Fase 2 en 5 Tandas

Para resolver ordenadamente las dependencias cruzadas y garantizar estabilidad en cada entrega, la Fase 2 se organiza en 5 tandas secuenciales:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              FASE 2: ROADMAP MULTIEMPRESA                              │
├──────────────┬──────────────┬──────────────┬───────────────────────────┬───────────────┤
│  Tanda 2.0   │  Tanda 2.1   │  Tanda 2.2   │         Tanda 2.3         │   Tanda 2.4   │
│ Endurecim.   │ Núcleo SaaS, │ Catálogo e   │ Operaciones Comerciales,  │ RRHH, Haberes │
│ Base, Esquema│ Membresías y │ Inventario   │ Numeración de Empresa     │ y Feed por    │
│ Privado      │ Gobernanza   │ Físico       │ y Tesorería               │ Cursor        │
└──────────────┴──────────────┴──────────────┴───────────────────────────┴───────────────┘
```

---

### Tanda 2.0: Endurecimiento Base, Esquema Privado y Extensiones
- **Objetivos y Migraciones:**
  - Habilitar extensión `pgcrypto`.
  - Crear esquema `private` (aislado de PostgREST) y revocar permisos a `PUBLIC`, `anon` y `authenticated`.
  - Configurar `ALTER DEFAULT PRIVILEGES` para revocar permisos de tablas y rutinas a `anon`, `public` y neutralizar el default de Supabase en `authenticated`.
- **Criterios de Aceptación:**
  - Ningún usuario anónimo tiene privilegios sobre la base de datos.
  - El esquema `private` es completamente inaccesible desde clientes PostgREST.

---

### Tanda 2.1: Núcleo Multiempresa, Identidad Global, Membresías y Gobernanza
- **Objetivos y Migraciones:**
  - Tablas: `profiles` (desacoplada: `id, email, full_name`), `companies` (`created_by`, `owner_id`, `tax_id` con algoritmo CUIT opcional, `timezone`, `currency`, `is_active`), `company_members` (`company_id, user_id, role, is_active`), `company_invitations` (token hash SHA-256), `company_counters` (`company_id, kind, last_value`), `audit_log` (`company_id NULL`, `record_id TEXT`, `actor_role`).
  - Rutinas de autorización en esquema `private`: `private.my_active_company_ids()`, `private.has_company_role()`, `private.assert_company_role()`.
  - Funciones RPC de gobernanza: `create_company()`, `invite_user_to_company()`, `accept_company_invitation()`, `transfer_company_ownership()`, `reactivate_member()`, `deactivate_company()`.
  - Triggers: `handle_new_user` sobre `auth.users`, salvaguarda del último `master_admin` (`check_last_active_master_admin` con bloqueo pesimista en `companies`), trigger universal de auditoría multiempresa.
  - Políticas RLS y revocación de mutaciones directas.
- **Criterios de Aceptación:**
  - Creación atómica de empresas con membresía del titular e inicialización de contadores.
  - Verificación de jerarquía: solo el titular invita administradores.
  - Salvaguarda anti-acéfala verificada ante intentos de degradación.

---

### Tanda 2.2: Catálogo e Inventario Físico Multiempresa
- **Objetivos y Migraciones:**
  - Tablas: `categories`, `suppliers`, `products` (con `company_id`, FKs compuestas, `UNIQUE (company_id, id)`, `UNIQUE (company_id, sku)`, barcode único parcial), `product_costs` (PK `(company_id, product_id)`), `stock_movements` (creado con `company_id`, `reference_sale_id UUID NULL` y `reference_purchase_id UUID NULL` sin FK hacia ventas/compras todavía), `movement_costs` (PK `(company_id, movement_id)`).
  - Triggers: `reject_direct_stock_update` (bloqueo de edición directa en `current_stock`), `create_initial_product_cost`, `sync_product_stock` (bloqueo pesimista `ORDER BY id FOR UPDATE`, actualización transaccional de stock, soporte de saldo negativo y congelamiento de costos), `prevent_immutable_modification` sobre `stock_movements` y `movement_costs`.
  - Funciones: `register_adjustment()`, `bulk_update_prices()`, `import_initial_stock()`, `import_products()`.
  - Políticas RLS en catálogo y movimientos (costos 100% ocultos a empleados).
- **Criterios de Aceptación:**
  - Inmutabilidad estricta de movimientos y costos.
  - Protección absoluta de `current_stock` contra updates directos.
  - Aislamiento de stock y catálogo por tenant.

---

### Tanda 2.3: Operaciones Comerciales, Numeración por Empresa y Tesorería
- **Objetivos y Migraciones:**
  - Tablas: `customers`, `purchases`, `purchase_items`, `sales`, `sale_items`, `transactions` (con `reference_settlement_id UUID NULL` sin FK todavía).
  - Incorporación de Claves Foráneas Compuestas Diferidas vía `ALTER TABLE`:
    - `stock_movements (company_id, reference_sale_id) -> sales(company_id, id)`
    - `stock_movements (company_id, reference_purchase_id) -> purchases(company_id, id)`
  - Funciones: `process_sale()`, `cancel_sale()`, `register_purchase()`, `cancel_purchase()`, `register_expense()`, `register_cash_adjustment()`.
  - Eliminación total de secuencias globales: numeración serializada mediante `company_counters` con bloqueo `FOR UPDATE`.
  - Triggers de inmutabilidad y anulación controlada (`check_sale_cancellation`).
  - Políticas RLS y revocación de mutaciones directas.
- **Criterios de Aceptación:**
  - Correlatividad independiente por empresa en ventas y compras.
  - Cobros divididos validados contra el total del servidor.
  - Reversión física y financiera atómica en anulaciones.

---

### Tanda 2.4: Recursos Humanos, Liquidaciones y Feed de Actividad
- **Objetivos y Migraciones:**
  - Tablas: `employees` (`company_id`, `user_id NULL`, unicidad compuesta de DNI y legajo), `employee_settlements` (`company_id`, `employee_id`, FK compuesta hacia `employees`).
  - Incorporación de Clave Foránea Diferida vía `ALTER TABLE`:
    - `transactions (company_id, reference_settlement_id) -> employee_settlements(company_id, id)`
  - Funciones: `create_settlement()`, `update_settlement_draft()`, `discard_settlement_draft()`, `confirm_settlement()`, `cancel_settlement()`, `get_activity_feed()` (feed unificado paginado por cursor compuesto `(company_id, created_at, id)` limitado a 100 registros).
  - Triggers de auditoría en liquidaciones e índices compuestos para cursores.
  - Políticas RLS para haberes (100% confidenciales de admin).
- **Criterios de Aceptación:**
  - Ciclo de vida completo de liquidaciones (borrador -> confirmada -> egreso automático en tesorería -> anulada).
  - Feed determinístico sin fugas de información entre empresas.
