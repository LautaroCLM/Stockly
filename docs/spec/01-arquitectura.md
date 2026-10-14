# 01. Arquitectura del Sistema y Multiempresa (SaaS Pooled)
**Módulo:** Especificación Arquitectónica, Límites de Confianza y Organización del Repositorio  
**Versión:** 2.0 (Arquitectura SaaS Multiempresa Compartida / Modelo Pooled)  
**Fecha:** Octubre 2026  

---

## 1. Principios Rectores del Sistema

1. **Online-First y Única Fuente de Verdad:**  
   Supabase (PostgreSQL 17+, Auth, RLS, Realtime) es la única fuente de datos centralizada. No existe base de datos local SQLite ni sincronización bidireccional personalizada. Si se interrumpe la conexión, la aplicación web/escritorio bloquea acciones de mutación y alerta al usuario mediante banners de desconexión sin generar divergencias de estado.
2. **Cero Errores y Tipado Estricto:**  
   TypeScript estricto (`strict: true`) en todo el frontend y funciones Edge. Validación obligatoria en tiempo de ejecución en todas las entradas y salidas de datos mediante esquemas Zod. Prohibido el uso de `any` y `@ts-ignore` sin justificación documentada.
3. **Consistencia Visual con Tema Oscuro:**  
   Adherencia estricta a la skill de diseño (`diseno-stock-app`): tokens CSS semánticos (`--bg: #060A13`, `--surface: #0B1220`, `--surface-2: #101A2E`, `--border: #1C2742`, `--primary: #2F6BFF`, `--accent: #27D3F5`, `--danger: #F2576B`), tipografía serif en títulos (Newsreader/Fraunces) y sans en cuerpo (Inter/Geist), cifras con `tabular-nums`, y formateo de moneda y fechas según la configuración regional de la empresa (`es-AR`).
4. **Operaciones Estrictamente al Contado:**  
   Operaciones comerciales exclusivamente al contado (efectivo, transferencia bancaria inmediata, tarjeta de débito/crédito y cheque entregado o cobrado en el acto). No incluye cuentas corrientes de clientes (fiados) ni cuentas por pagar a proveedores. Cualquier esquema de crédito diferido requerirá confirmación explícita para una fase posterior.
5. **Comprobantes Internos y Numeración Transaccional Aislada:**  
   El sistema emite comprobantes de control interno (remitos, notas de venta, tickets). **No es un facturador fiscal electrónico ni se conecta en esta fase con los Web Services de ARCA (ex-AFIP)**. Los números correlativos (`sale_number`, `purchase_number`) se generan mediante la tabla `company_counters` con bloqueo pesimista por fila y aislamiento por empresa, erradicando secuencias globales que filtrarían volumen comercial inter-tenant.
6. **Modelo SaaS Pooled con Frontera Estricta en Base de Datos:**  
   Todas las empresas comparten la misma aplicación física y base de datos relacional. El aislamiento se garantiza en PostgreSQL mediante Row Level Security (RLS) basado en membresías activas, funciones de servidor (`private.assert_company_role`) y claves foráneas compuestas obligatorias `(company_id, id)`.
7. **Principio de Zero-Trust hacia el Cliente y Frontend:**  
   La empresa seleccionada en la interfaz de usuario nunca constituye una prueba de autorización. El frontend aplica filtros de visualización (`.eq('company_id', activeId)`), pero el motor de base de datos valida en cada sentencia y RPC la identidad autenticada, la membresía vigente, el rol necesario y el estado activo de la organización.
8. **Stock Negativo Permitido y Valuación Histórica Congelada:**  
   El inventario admite existencias negativas (`current_stock < 0`) para operaciones comerciales autorizadas, señalizadas en la interfaz con indicadores `--danger`. La valuación de salida se congela al último costo de reposición conocido (`product_costs.cost_price`), sin recálculos retroactivos automáticos en comprobantes cerrados.
9. **Desactivación Lógica de Empresas sin Borrado Físico:**  
   Las empresas dadas de baja se desactivan (`companies.is_active = false`), preservando intacto el historial comercial y de auditoría para fines contables y legales. Las mutaciones se bloquean en su totalidad, mientras que el titular y administradores vigentes al cese conservan acceso de solo lectura para reportes y exportaciones permitidas.
10. **Desacoplamiento de Identidad, Membresía y Legajo Laboral:**  
    La cuenta de usuario (`profiles`) representa la identidad humana universal sin roles corporativos. El acceso y rol se determinan por empresa en `company_members`. La nómina laboral (`employees`) es un registro de personal independiente que puede o no estar vinculado a una cuenta de acceso.

---

## 2. Arquitectura Multiempresa (Modelo Pooled Tenancy)

Para satisfacer los requerimientos de modularidad, mantenibilidad y escala, Stockly adopta un modelo **SaaS multiempresa compartido (pooled tenancy)** sobre una única base de datos PostgreSQL:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               CLIENTE (Web / PWA / Desktop)                           │
│              JWT de Supabase Auth (auth.uid()) + Filtro UI (.eq('company_id', id))     │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ HTTPS / WSS
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                       POSTGREST                                        │
│               Expone esquema público 'public' (Esquema 'private' oculto)               │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
               ┌────────────────────────────┴────────────────────────────┐
               ▼                                                         ▼
┌──────────────────────────────────────────────┐ ┌───────────────────────────────────────┐
│        ROW LEVEL SECURITY (RLS)              │ │        PROCEDIMIENTOS RPC             │
│  USING (company_id IN (                      │ │  p_company_id UUID explícito         │
│    SELECT private.my_active_company_ids()    │ │  PERFORM private.assert_company_role( │
│  ))                                          │ │    p_company_id, 'required_role'      │
│  Filtro transparente por membresía en BD     │ │  )                                    │
└──────────────────────────────────────────────┘ └───────────────────────────────────────┘
                                            │
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              MOTOR POSTGRESQL (PUBLIC)                                 │
│  Tablas de Dominio con company_id NOT NULL + Claves Foráneas Compuestas               │
│  (company_id, fk_id) REFERENCES tabla_padre (company_id, id) ON DELETE RESTRICT        │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.1. Fronteras de Seguridad y Límites de Confianza
1. **El Cliente es Hostil:** Ni la cabecera HTTP `x-company-id` ni los parámetros enviados en el cuerpo JSON son confiables por sí mismos. Ninguna política RLS utiliza `current_setting('request.headers')` como frontera de seguridad.
2. **Autorización basada en Membresías Reales:**  
   La función `private.my_active_company_ids()` (declarada `STABLE SECURITY DEFINER` con `search_path = ''` y perteneciente a `postgres`) consulta directamente la tabla `company_members` evaluando:
   - `cm.user_id = auth.uid()`
   - `cm.is_active = true`
   - `c.is_active = true` (la empresa debe estar activa)
3. **Aislamiento en Supabase Realtime y Storage:**
   - **Realtime (`postgres_changes`):** Evalúa RLS utilizando exclusivamente los claims del JWT (`auth.uid()`). Al basarse RLS en membresías de fila, Realtime entrega eventos únicamente de las empresas donde el usuario es miembro activo. La interfaz suscribe canales filtrados (`filter: 'company_id=eq.' + activeId`) para aislar eventos por pantalla sin riesgos de fuga.
   - **Storage:** Las políticas sobre `storage.objects` validan que el primer segmento de la ruta del archivo corresponda a una empresa autorizada: `(storage.foldername(name))[1]::uuid IN (SELECT private.my_active_company_ids())`.

---

## 3. Modelo de Titularidad, Jerarquía y Ciclo de Vida Corporativo

### 3.1. Separación Conceptual: Creador Histórico vs. Titular Vigente
Para garantizar trazabilidad inmutable y flexibilidad operativa sin inconsistencias:
1. **Creador Original Histórico (`companies.created_by`):**  
   Almacena el `UUID` del usuario que registró inicialmente la empresa. Este campo es **estrictamente inmutable** tras el `INSERT` inicial (protegido por triggers). Sirve como registro de procedencia fundacional.
2. **Titularidad Operativa Vigente (`companies.owner_id`):**  
   Es la **única fuente de verdad** de la titularidad de la empresa. Identifica al usuario que posee la máxima autoridad jerárquica en la organización.
   - Restricción relacional: `FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE RESTRICT`.
   - Invariante de coherencia: El usuario identificado en `companies.owner_id` debe poseer forzosamente una membresía activa en `company_members` con `role = 'master_admin'` y `is_active = true`.

### 3.2. Jerarquía de Privilegios Administrativos
- **Titular Vigente (`auth.uid() = companies.owner_id`):**
  - Puede invitar a nuevos miembros con rol `master_admin` o `employee`.
  - Puede promover miembros existentes a `master_admin`.
  - Puede transferir formalmente la titularidad a otro administrador activo.
  - Puede desactivar la empresa (`deactivate_company`) o solicitar su reactivación.
- **Administrador Común (`master_admin` donde `auth.uid() != companies.owner_id`):**
  - Posee permisos operativos completos (compras, catálogo, costos, inventario, ventas, finanzas, nómina y liquidaciones).
  - Puede invitar y administrar a miembros con rol `employee`.
  - **Prohibición estricta:** No puede invitar, promover ni degradar a otros administradores (`master_admin`), ni alterar al titular.

### 3.3. Transferencia de Titularidad y Situaciones Excepcionales
- **Procedimiento Ordinario Transaccional:**  
  Invocado exclusivamente por el titular actual mediante la RPC `transfer_company_ownership(p_company_id UUID, p_new_owner_id UUID)`.
  1. Adquiere bloqueo pesimista sobre la fila de la empresa (`SELECT 1 FROM public.companies WHERE id = p_company_id FOR NO KEY UPDATE`).
  2. Valida que el llamador sea `companies.owner_id`.
  3. Valida que `p_new_owner_id` sea un miembro activo con rol `master_admin` en esa misma empresa.
  4. Actualiza atómicamente `companies.owner_id = p_new_owner_id`.
  5. Asienta el evento con criticidad máxima en `public.audit_log`.
  6. `companies.created_by` permanece inalterado.
- **Situaciones Excepcionales (Abandono, Fallecimiento, Pérdida Irreversible de Acceso):**  
  **No se implementan puertas traseras ni superadministradores en el código SQL.** Cualquier transferencia extraordinaria ante imposibilidad material del titular debe canalizarse mediante soporte técnico de infraestructura del operador de la plataforma (`service_role`), tras verificación jurídica fehaciente de personería legal fuera de banda, ejecutando un script de migración auditado.

### 3.4. Ciclo de Vida: Desactivación Lógica y Acceso Histórico
- **Desactivación de Empresa:** Realizada mediante `deactivate_company(p_company_id UUID, p_reason TEXT)` por el titular vigente.
  - Asienta `companies.is_active = false`, `deactivated_at = now()`, `deactivated_by = auth.uid()`.
- **Efectos Operativos:**
  - **Mutaciones (Escrituras):** El 100% de las operaciones de negocio (`process_sale`, `register_purchase`, `register_adjustment`, etc.) quedan inmediatamente bloqueadas con excepción `42501`.
  - **Acceso Ordinario de Empleados:** Los empleados regulares reciben 0 filas en consultas operativas (bloqueo total).
  - **Acceso Histórico de Archivo (Titular y Administradores):** El titular y los administradores activos al momento del cese conservan acceso de solo lectura mediante vistas de reporte e informes de auditoría para satisfacer obligaciones de conservación de libros de comercio y balances fiscales.
  - **Reactivación:** Operación administrativa explícita invocable únicamente por el titular mediante `reactivate_company(p_company_id, p_reason)`.

### 3.5. Ciclo de Vida de Identidades Globales (`profiles`)
Se delimitan cuatro niveles de revocación y baja:
1. **Baja de Membresía:** Se marca `company_members.is_active = false` en una empresa particular. La cuenta global permanece intacta y operativa para otras empresas.
2. **Cierre de Sesión:** Destrucción de tokens locales en el dispositivo cliente.
3. **Revocación Global de Sesiones:** Invocación a `auth.admin.signOut(uid)` para invalidar tokens de refresco activos.
4. **Baja Definitiva de Cuenta en Supabase Auth (Anonimización):**
   - Las tablas comerciales e históricas (`sales.created_by`, `stock_movements.created_by`, `audit_log.performed_by`) mantienen restricciones `ON DELETE RESTRICT` hacia `profiles(id)` para resguardar la validez jurídica de los balances.
   - El procedimiento formal de baja desactiva las membresías del usuario en todas sus organizaciones y ejecuta la anonimización de datos personales en `profiles` (`email = 'anonimizado_' || id || '@deleted.local'`, `full_name = 'Usuario Anonimizado'`). La fila física en `profiles` se conserva para satisfacer la integridad referencial.
   - *Aclaración Legal:* La anonimización técnica resuelve la integridad de la base de datos; el cumplimiento normativo específico (RGPD, Ley 25.326) requiere análisis jurídico corporativo aplicable.

---

## 4. Módulos del Sistema y Alcance Funcional

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                       STOCKLY SAAS                                     │
├───────────┬────────────┬────────┬──────────┬─────────────┬──────────┬────────┬─────────┤
│ Dashboard │ Inventario │ Ventas │ Clientes │ Proveedores │ Finanzas │Informes│Empleados│
└───────────┴────────────┴────────┴──────────┴─────────────┴──────────┴────────┴─────────┘
                                            │
                        ┌──────────────────┴──────────────────┐
                        │      Historial (Cursor Feed RPC)    │
                        └─────────────────────────────────────┘
```

1. **Dashboard:** Métricas comerciales en tiempo real filtradas por la empresa activa (`local_today(p_company_id)`), alertas de stock negativo y crítico, tendencia financiera y accesos rápidos.
2. **Inventario:** Catálogo de productos, categorías, compras/entradas atómicas (`register_purchase`), ajustes manuales (`register_adjustment`), migración inicial de existencias (`import_initial_stock`), actualización masiva de precios (`bulk_update_prices`) e importación/exportación por catálogo.
3. **Ventas (Contado):** Facturación y punto de venta rápido, validación estricta de precios de servidor, cobro inmediato con medios divididos (`cash`, `bank_transfer`, `credit_card`, `debit_card`, `check`), emisión de comprobantes internos correlativos (`company_counters`) y anulación controlada (`cancel_sale`).
4. **Clientes:** Directorio corporativo y particular con soporte de ventas a consumidor final (`customer_id NULL`).
5. **Proveedores:** Fichas de proveedores comerciales, validación optativa de CUIT y recepción de mercadería.
6. **Finanzas (Tesorería al Contado):** Asientos contables automáticos vinculados a ventas, compras y sueldos. Egresos manuales vía `register_expense` y ajustes de caja vía `register_cash_adjustment`.
7. **Informes:** Vistas analíticas de solo lectura filtradas por empresa activa y horario local oficial.
8. **Empleados y Nómina:** Legajos laborales independientes (`employees`) con vinculación optativa a cuentas de usuario, y circuito de liquidaciones salariales (`employee_settlements`).
9. **Historial (Feed Paginado por Cursor):** Consulta unificada mediante `get_activity_feed(p_company_id, p_limit, p_cursor_created_at, p_cursor_id)` que respeta RLS y presenta eventos de stock, finanzas y auditoría.

---

## 5. Estructura del Repositorio

```
c:\Users\herna\Desktop\Stockly\
├── docs/
│   ├── especificacion.md         # Documento ejecutivo consolidado y contratos generales
│   └── spec/                     # Especificación técnica modular y normativa
│       ├── 01-arquitectura.md    # Modelo pooled, límites de confianza y titularidad
│       ├── 02-modelo-datos.md    # Entidades, FKs compuestas, restricciones e índices
│       ├── 03-funciones.md       # Contratos RPC, bloqueos, transaccionalidad e idempotencia
│       ├── 04-seguridad-rls.md   # RLS por membresía, esquema private, ACL y Realtime
│       └── 05-tests-y-tandas.md  # Roadmap de 5 tandas y matriz de calidad clasificada
├── supabase/
│   ├── config.toml               # Configuración local de Supabase CLI
│   ├── functions/                # Supabase Edge Functions (invitaciones y correos)
│   ├── migrations/               # Migraciones SQL versionadas
│   └── tests/                    # Suites de verificación pgTAP
├── src/                          # Aplicación Web / Desktop (React + Vite + TypeScript)
├── AGENTS.md                     # Reglas de desarrollo y directrices operativas
└── SKILL.md                      # Tokens y estándares de diseño visual
```

