# STOCKLY — DIAGNÓSTICO DE ESTADO REAL DE LA BASE DE DATOS (FASE A + EVIDENCIA FASE C)

**Fecha de corte:** 20 de octubre de 2026<br>
**Estado de ejecución verificado al cierre de la sesión:**
- **Estado previo al reset (inspección inicial de `supabase_migrations.schema_migrations`):** `20261016000001` (Tanda 2.0) y `20261016000002` (Tanda 2.1) figuraban aplicadas previamente; `20261021000001` (Tanda 2.2A) nunca se había ejecutado; ninguna suite pgTAP se había corrido en esta sesión.
- **Estado actual verificado tras `npx supabase db reset --yes` y `npx supabase test db`:**
  - **Migraciones aplicadas desde cero en PostgreSQL 17 local:** Las **3 migraciones** (`20261016000001`, `20261016000002`, `20261021000001`) y `supabase/seed.sql` se aplicaron con código de salida `0`. **Ningún archivo de migración fue modificado.**
  - **Pruebas pgTAP ejecutadas y aprobadas:** **84 de 84 aserciones aprobadas (`Files=2, Tests=84, Result: PASS`)** — 58 en `01_tanda_2_0_and_2_1.test.sql` y 26 en `02_tanda_2_2_inventory.test.sql`.
  - **Pruebas de concurrencia multi-sesión TCP y aislamiento cruzado completo en 2.2A:** **NO VERIFICADO** (pendientes de implementación para Tanda 2.2B).

---

## 1. Inventario Real del Repositorio

### 1.1. Archivos de Migración y Suites de Prueba

| Tipo | Archivo | Líneas Totales | Líneas No Vacías | Estado en Git | Tanda | (a) Migración aplicada antes de la sesión | (b) Pruebas pgTAP ejecutadas (Fase C) | (c) Verificado desde cero con `db reset` |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Migración** | [`supabase/migrations/20261016000001_tanda_2_0_base_security.sql`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000001_tanda_2_0_base_security.sql) | **69** | 56 | Untracked (`??`) | Tanda 2.0 | **SÍ** (`20261016000001`) | Cubierta en `01_*.test.sql` | **VERIFICADO (`OK`, sin cambios en archivo)** |
| **Migración** | [`supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql) | **1.116** | 968 | Untracked (`??`) | Tanda 2.1 | **SÍ** (`20261016000002`) | Cubierta en `01_*.test.sql` | **VERIFICADO (`OK`, sin cambios en archivo)** |
| **Migración** | [`supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql) | **858** | 728 | Untracked (`??`) | Tanda 2.2A | **NO** (ausente antes del reset) | Cubierta en `02_*.test.sql` | **VERIFICADO (`OK`, sin cambios en archivo)** |
| **Seed** | [`supabase/seed.sql`](file:///c:/Users/herna/Desktop/Stockly/supabase/seed.sql) | **1** | 1 | Untracked (`??`) | Seed CLI | **NO EXISTÍA** | No aplica | **VERIFICADO (`Seeding data from supabase/seed.sql...`)** |
| **Test pgTAP** | [`supabase/tests/01_tanda_2_0_and_2_1.test.sql`](file:///c:/Users/herna/Desktop/Stockly/supabase/tests/01_tanda_2_0_and_2_1.test.sql) | **789** | 666 | Untracked (`??`) | Tandas 2.0 + 2.1 | No aplica | **VERIFICADO: `58/58 PASS`** | Sin cambios en archivo |
| **Test pgTAP** | [`supabase/tests/02_tanda_2_2_inventory.test.sql`](file:///c:/Users/herna/Desktop/Stockly/supabase/tests/02_tanda_2_2_inventory.test.sql) | **381** | 326 | Untracked (`??`) | Tanda 2.2A | No aplica | **VERIFICADO: `26/26 PASS`** | Editado en Fase B/C (ver Sección 6) |

### 1.2. Conteo Exacto de Aserciones en Suites pgTAP

| Suite de Pruebas | `plan()` Declarado | Aserciones Reales | Desglose por Función pgTAP | Resultado Dinámico (`npx supabase test db`) |
| :--- | :---: | :---: | :--- | :--- |
| [`01_tanda_2_0_and_2_1.test.sql`](file:///c:/Users/herna/Desktop/Stockly/supabase/tests/01_tanda_2_0_and_2_1.test.sql#L13) | `plan(58)` (L13) | **58** | `19 is`, `3 ok`, `8 lives_ok`, `16 throws_ok`, `12 throws_matching` | **`ok` (58/58 PASS)** |
| [`02_tanda_2_2_inventory.test.sql`](file:///c:/Users/herna/Desktop/Stockly/supabase/tests/02_tanda_2_2_inventory.test.sql#L12) | `plan(26)` (L12) | **26** | `13 throws_ok`, `2 throws_like`, `9 is`, `2 lives_ok` | **`ok` (26/26 PASS)** — *Nota: T-14 y T-19 usan `throws_like` (evalúa patrón de mensaje sin `SQLSTATE`).* |

### 1.3. Estado de Tandas respecto al Plan (`docs/spec/05-tests-y-tandas.md`)

| Tanda | Nombre en Especificación | Estado en Código SQL | (a) Migración aplicada antes de la sesión | (b) Pruebas pgTAP ejecutadas hoy | (c) Verificado en `db reset` sin cambios en migración |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Tanda 2.0** | Endurecimiento Base, Esquema Privado y Extensiones | **Escrita completa** (`20261016000001`) | **SÍ** | **SÍ (`PASS`)** | **SÍ (`OK`)** |
| **Tanda 2.1** | Núcleo Multiempresa, Identidad Global, Membresías y Gobernanza | **Escrita parcial** (`20261016000002`, falta `audit_trigger()` universal) | **SÍ** | **SÍ (`PASS`, 58/58)** | **SÍ (`OK`)** |
| **Tanda 2.2A** | Catálogo e Inventario Físico Multiempresa (Sub-tanda A: Tablas, ajuste manual e importación inicial idempotentes) | **Escrita** (`20261021000001`) | **NO** | **SÍ (`PASS`, 26/26)** | **SÍ (`OK`)** |
| **Tanda 2.2B** | Resto de Catálogo e Inventario (CRUD catálogo/costos, `bulk_update_prices`, `import_products`, `audit_trigger`) | **No escrita (Pendiente)** | **NO** | **Ninguna** | No aplica |
| **Tanda 2.3** | Operaciones Comerciales, Numeración por Empresa y Tesorería (`customers`, `sales`, `purchases`, `transactions`) | **No escrita (Pendiente)** | **NO** | **Ninguna** | No aplica |
| **Tanda 2.4** | Recursos Humanos, Liquidaciones y Feed de Actividad (`employees`, `employee_settlements`, `get_activity_feed`) | **No escrita (Pendiente)** | **NO** | **Ninguna** | No aplica |

---

### 1.4. Inventario de Tablas y Vistas Creadas en las Migraciones (13 Tablas + 1 Vista)

| # | Objeto | Esquema | Migración:Línea | PK / Unicidad Compuesta | `company_id` | RLS |
| :---: | :--- | :---: | :--- | :--- | :---: | :---: |
| 1 | `profiles` | `public` | [`20261016000002:13`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L13) | `PRIMARY KEY (id)` | No aplica (Identidad global) | `ENABLE` (L1001) |
| 2 | `companies` | `public` | [`20261016000002:75`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L75) + [`20261021000001:15`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L15) | `PRIMARY KEY (id)` | Es la tabla de empresas (`id`) | `ENABLE` (L1002) |
| 3 | `company_members` | `public` | [`20261016000002:93`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L93) | `PK (id)`, `UNIQUE (company_id, user_id)`, `UNIQUE (company_id, id)` | `UUID NOT NULL` | `ENABLE` (L1003) |
| 4 | `company_invitations` | `public` | [`20261016000002:109`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L109) | `PK (id)`, `UNIQUE (token_hash)`, `UNIQUE (company_id, id)`, idx parcial `(company_id, lower(email)) WHERE status = 'pending'` | `UUID NOT NULL` | `ENABLE` (L1004) |
| 5 | `company_counters` | `public` | [`20261016000002:131`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L131) | `PRIMARY KEY (company_id, kind)` | `UUID NOT NULL` | `ENABLE` (L1005) |
| 6 | `audit_log` | `public` | [`20261016000002:142`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L142) | `PRIMARY KEY (id)` | `UUID NULL` (Nullable) | `ENABLE` (L1006) |
| 7 | `categories` | `public` | [`20261021000001:26`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L26) | `PK (id)`, `UNIQUE (company_id, id)`, idx único `(company_id, lower(btrim(name)))` | `UUID NOT NULL` | `ENABLE` + `FORCE` (L763-764) |
| 8 | `suppliers` | `public` | [`20261021000001:49`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L49) | `PK (id)`, `UNIQUE (company_id, id)`, idx único `(company_id, lower(btrim(name)))` | `UUID NOT NULL` | `ENABLE` + `FORCE` (L766-767) |
| 9 | `products` | `public` | [`20261021000001:77`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L77) | `PK (id)`, `UNIQUE (company_id, id)`, idx único `(company_id, upper(btrim(sku)))`, idx único parcial barcode | `UUID NOT NULL` | `ENABLE` + `FORCE` (L769-770) |
| 10 | `product_costs` | `public` | [`20261021000001:132`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L132) | `PRIMARY KEY (company_id, product_id)` | `UUID NOT NULL` | `ENABLE` + `FORCE` (L772-773) |
| 11 | `stock_movements` | `public` | [`20261021000001:155`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L155) | `PK (id)`, `UNIQUE (company_id, id)` | `UUID NOT NULL` | `ENABLE` + `FORCE` (L775-776) |
| 12 | `movement_costs` | `public` | [`20261021000001:199`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L199) | `PRIMARY KEY (company_id, movement_id)` | `UUID NOT NULL` | `ENABLE` + `FORCE` (L778-779) |
| 13 | `operation_idempotency` | `public` | [`20261021000001:221`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L221) | `PK (id)`, `UNIQUE (company_id, operation_type, idempotency_key)` | `UUID NOT NULL` | `ENABLE` + `FORCE` (L781-782) |
| V1 | `profiles_public` (Vista) | `public` | [`20261016000002:158`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L158) | `WITH (security_invoker = true)` sobre `public.profiles(id, full_name)` | No aplica | Evalúa RLS del invocador |

---

### 1.5. Inventario de Funciones Creadas (22 Funciones: 4 en `private`, 18 en `public`)

| # | Esquema.Función | Tipo | Migración:Línea | `SECURITY` | `search_path` | `EXECUTE` para `authenticated` |
| :---: | :--- | :--- | :--- | :---: | :---: | :---: |
| 1 | `private.my_active_company_ids()` | Helper RLS | [`20261016000002:171`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L171) | `DEFINER` | `''` | `GRANT` (L294) |
| 2 | `private.my_accessible_company_ids()` | Helper RLS | [`20261016000002:190`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L190) | `DEFINER` | `''` | `GRANT` (L295) |
| 3 | `private.has_company_role(UUID, TEXT)` | Helper RLS | [`20261016000002:218`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L218) | `DEFINER` | `''` | `GRANT` (L296) |
| 4 | `private.assert_company_role(UUID, TEXT)` | Guard RPC | [`20261016000002:241`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L241) | `DEFINER` | `''` | `REVOKE` (L290) |
| 5 | `public.validate_cuit(TEXT)` | Validador CHECK | [`20261016000002:24`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L24) | `INVOKER` | `''` | `GRANT` (L1097) |
| 6 | `public.set_updated_at()` | Trigger Fn | [`20261016000002:303`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L303) | `DEFINER` | `''` | `REVOKE` (L1111) |
| 7 | `public.prevent_immutable_modification()` | Trigger Fn | [`20261016000002:316`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L316) | `DEFINER` | `''` | `REVOKE` (L1112) |
| 8 | `public.handle_new_user()` | Trigger Fn | [`20261016000002:332`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L332) | `DEFINER` | `''` | `REVOKE` (L1113) |
| 9 | `public.check_last_active_master_admin()` | Trigger Fn | [`20261016000002:358`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L358) | `DEFINER` | `''` | `REVOKE` (L1114) |
| 10 | `public.protect_company_created_by()` | Trigger Fn | [`20261016000002:394`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L394) | `DEFINER` | `''` | `REVOKE` (L1115) |
| 11 | `public.validate_company_timezone()` | Trigger Fn | [`20261016000002:413`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L413) | `INVOKER` | `''` | `REVOKE` (L1116) |
| 12 | `public.local_today(UUID)` | Utilidad RPC | [`20261016000002:444`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L444) | `DEFINER` | `''` | `GRANT` (L1087) |
| 13 | `public.create_company(TEXT, TEXT, TEXT, TEXT)` | RPC Gobernanza | [`20261016000002:458`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L458) | `DEFINER` | `''` | `GRANT` (L1088) |
| 14 | `public.invite_user_to_company(UUID, TEXT, TEXT)` | RPC Gobernanza | [`20261016000002:521`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L521) | `DEFINER` | `''` | `GRANT` (L1089) |
| 15 | `public.accept_company_invitation(TEXT)` | RPC Gobernanza | [`20261016000002:628`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L628) | `DEFINER` | `''` | `GRANT` (L1090) |
| 16 | `public.transfer_company_ownership(UUID, UUID)` | RPC Gobernanza | [`20261016000002:743`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L743) | `DEFINER` | `''` | `GRANT` (L1091) |
| 17 | `public.deactivate_company(UUID)` | RPC Gobernanza | [`20261016000002:808`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L808) | `DEFINER` | `''` | `GRANT` (L1092) |
| 18 | `public.reactivate_member(UUID, UUID, TEXT, TEXT)` | RPC Gobernanza | [`20261016000002:878`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L878) | `DEFINER` | `''` | `GRANT` (L1093) |
| 19 | `public.revoke_company_invitation(UUID, UUID)` | RPC Gobernanza | [`20261016000002:950`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L950) | `DEFINER` | `''` | `GRANT` (L1094) |
| 20 | `public.sync_product_stock()` | Trigger Fn | [`20261021000001:247`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L247) | `DEFINER` | `''` | `REVOKE` (L858) |
| 21 | `public.register_stock_adjustment(...)` | RPC Inventario | [`20261021000001:317`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L317) | `DEFINER` | `''` | `GRANT` (L851) |
| 22 | `public.import_initial_stock(UUID, UUID, JSONB)` | RPC Inventario | [`20261021000001:500`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L500) | `DEFINER` | `''` | `GRANT` (L852) |

---

### 1.6. Inventario de Triggers (16 Triggers) y Políticas RLS (13 Políticas)

#### Triggers (8 en Tanda 2.1 + 8 en Tanda 2.2A):
1. `tr_audit_log_immutable` (`BEFORE UPDATE OR DELETE ON public.audit_log`) — [`20261016000002:327`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L327)
2. `on_auth_user_created` (`AFTER INSERT ON auth.users`) — [`20261016000002:353`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L353)
3. `tr_protect_last_company_admin` (`BEFORE UPDATE OR DELETE ON public.company_members`) — [`20261016000002:389`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L389)
4. `tr_protect_company_created_by` (`BEFORE UPDATE ON public.companies`) — [`20261016000002:408`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L408)
5. `tr_validate_company_timezone` (`BEFORE INSERT OR UPDATE OF timezone ON public.companies`) — [`20261016000002:430`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L430)
6. `tr_profiles_updated_at` (`BEFORE UPDATE ON public.profiles`) — [`20261016000002:435`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L435)
7. `tr_companies_updated_at` (`BEFORE UPDATE ON public.companies`) — [`20261016000002:436`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L436)
8. `tr_company_members_updated_at` (`BEFORE UPDATE ON public.company_members`) — [`20261016000002:437`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L437)
9. `tr_categories_updated_at` (`BEFORE UPDATE ON public.categories`) — [`20261021000001:44`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L44)
10. `tr_suppliers_updated_at` (`BEFORE UPDATE ON public.suppliers`) — [`20261021000001:72`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L72)
11. `tr_products_updated_at` (`BEFORE UPDATE ON public.products`) — [`20261021000001:127`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L127)
12. `tr_product_costs_updated_at` (`BEFORE UPDATE ON public.product_costs`) — [`20261021000001:146`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L146)
13. `tr_protect_stock_movements_immutable` (`BEFORE UPDATE OR DELETE ON public.stock_movements`) — [`20261021000001:194`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L194)
14. `tr_protect_movement_costs_immutable` (`BEFORE UPDATE OR DELETE ON public.movement_costs`) — [`20261021000001:214`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L214)
15. `tr_operation_idempotency_updated_at` (`BEFORE UPDATE ON public.operation_idempotency`) — [`20261021000001:240`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L240)
16. `tr_sync_stock_movements` (`BEFORE INSERT ON public.stock_movements`) — [`20261021000001:308`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L308)

#### Políticas RLS (6 en Tanda 2.1 + 7 en Tanda 2.2A):
1. `profiles_select_own` (`SELECT ON profiles`) — [`20261016000002:1009`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L1009)
2. `profiles_update_own` (`UPDATE ON profiles`) — [`20261016000002:1015`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L1015)
3. `companies_select_member` (`SELECT ON companies`) — [`20261016000002:1023`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L1023)
4. `company_members_select_colleagues` (`SELECT ON company_members`) — [`20261016000002:1030`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L1030)
5. `company_invitations_select` (`SELECT ON company_invitations`) — [`20261016000002:1037`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L1037)
6. `audit_log_select_admin` (`SELECT ON audit_log`) — [`20261016000002:1050`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L1050)
7. `categories_select_member` (`SELECT ON categories`) — [`20261021000001:785`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L785)
8. `suppliers_select_member` (`SELECT ON suppliers`) — [`20261021000001:790`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L790)
9. `products_select_member` (`SELECT ON products`) — [`20261021000001:795`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L795)
10. `product_costs_select_admin` (`SELECT ON product_costs`) — [`20261021000001:800`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L800)
11. `stock_movements_select_member` (`SELECT ON stock_movements`) — [`20261021000001:808`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L808)
12. `movement_costs_select_admin` (`SELECT ON movement_costs`) — [`20261021000001:813`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L813)
13. `operation_idempotency_select_admin` (`SELECT ON operation_idempotency`) — [`20261021000001:821`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L821)

---

## 2. Arquitectura Efectiva en el Código vs. Documentación (`docs/spec/01` a `05`)

### 2.1. Confirmación del Modelo Arquitectónico
- El código SQL implementa de forma íntegra el modelo **SaaS Multiempresa Compartido (Pooled Tenancy)** con las tablas `companies`, `company_members`, `company_invitations`, `company_counters` y columna `company_id UUID NOT NULL` en las tablas de negocio.
- **No existe** `app_settings` de fila única ni arquitectura de base de datos separada por empresa.
- Los documentos `docs/especificacion.md` y `docs/spec/01` a `05` en el árbol de trabajo ya fueron editados a la **Versión 2.0 (Pooled SaaS)** (`M docs/spec/02-modelo-datos.md`, `03-funciones.md`, `04-seguridad-rls.md`, `05-tests-y-tandas.md`), pero presentan múltiples discrepancias concretas respecto a las migraciones SQL reales.

### 2.2. Tabla de Discrepancias entre Migraciones SQL y `docs/spec/`

| # | Aspecto | Qué dicen `docs/spec/01` a `05` | Qué hacen las Migraciones SQL Reales | Referencia en Código |
| :---: | :--- | :--- | :--- | :--- |
| **D-01** | **Trigger Universal de Auditoría (`audit_trigger`)** | `02-modelo-datos.md:744-811` y `05-tests-y-tandas.md:84` definen `public.audit_trigger()` con clave primaria variable (`TG_ARGV[0]`), `record_id TEXT`, `performed_by` anulable y filtro anti-ruido cuando en `products` solo cambia `current_stock`. | **`audit_trigger()` NO EXISTE en ninguna migración.** Tanda 2.1 inserta manualmente en `audit_log` dentro de las RPCs de gobernanza. Tanda 2.2A **no inserta nada en `audit_log`** (ni por trigger ni manualmente). | Ausente en `20261016000002` y `20261021000001` |
| **D-02** | **Política de Stock Negativo** | `01-arquitectura.md:24-25` y `02-modelo-datos.md:646-649` establecen que el stock negativo siempre se permite (`current_stock < 0` no aborta). | `20261021000001` agrega `companies.allow_negative_stock BOOLEAN NOT NULL DEFAULT false` y `sync_product_stock()` **aborta con excepción** si `new_stock < 0` y el flag es `false`. Además, ninguna RPC permite cambiar ese flag. | [`20261021000001:15-16`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L15-L16), [`L286-293`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L286-L293) |
| **D-03** | **Tabla e Idempotencia Transaccional** | `02-modelo-datos.md` y `03-funciones.md` no incluyen `operation_idempotency` ni `p_idempotency_key` en las firmas de funciones. | `20261021000001` crea la tabla `operation_idempotency` y exige `p_idempotency_key UUID` en `register_stock_adjustment` e `import_initial_stock`. | [`20261021000001:221-243`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L221-L243) |
| **D-04** | **Nombre, Rol y Retorno del Ajuste de Stock** | `03-funciones.md:1040-1094` define `register_adjustment(...) RETURNS UUID`, ejecutable por cualquier miembro (`assert_company_role(p_company_id, NULL)`), con `p_notes` obligatorio. | `20261021000001` define `register_stock_adjustment(...) RETURNS JSONB`, restringido a **`master_admin`**, con `p_notes DEFAULT NULL` y `p_reference_doc DEFAULT NULL`. | [`20261021000001:317-354`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L317-L354) |
| **D-05** | **Mecanismo de `sync_product_stock` y Columnas de Saldo** | `02-modelo-datos.md:471-495` no incluye `previous_stock` ni `new_stock` en `stock_movements`; usa un trigger `AFTER INSERT` con bandera GUC `stockapp.internal_stock_update` y el trigger `reject_direct_stock_update`. | `20261021000001` agrega `previous_stock NUMERIC(12,2) NOT NULL` y `new_stock NUMERIC(12,2) NOT NULL` en `stock_movements`; usa `sync_product_stock` como `BEFORE INSERT` sin bandera GUC, y no crea `reject_direct_stock_update` (bloquea `UPDATE` revocando permisos de tabla en `products`). | [`20261021000001:162-163`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L162-L163), [`L247-310`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L247-L310) |
| **D-06** | **CRUD de Catálogo (`categories`, `suppliers`, `products`)** | `04-seguridad-rls.md:191-199` indica políticas `INSERT / UPDATE / DELETE` para `master_admin` y `GRANT UPDATE (sku, ...)` en `products`. `02-modelo-datos.md:724` define el trigger `create_initial_product_cost`. | `20261021000001` ejecuta `REVOKE ALL` salvo `GRANT SELECT` en las 7 tablas y solo crea políticas `FOR SELECT`. Hoy **ningún usuario autenticado puede crear o editar categorías, proveedores o productos** por PostgREST ni por RPC. | [`20261021000001:784-848`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L784-L848) |
| **D-07** | **Política RLS de Lectura en Empresas Inactivas** | `04-seguridad-rls.md:191-210` especifica que `categories`, `suppliers`, `products` y `stock_movements` usan `private.my_active_company_ids()`. | `20261021000001:785-811` usa `private.my_accessible_company_ids()` en esas 4 tablas (permitiendo que `master_admin` conserve lectura histórica cuando la empresa está inactiva, mientras que `product_costs` y `movement_costs` usan `my_active_company_ids()`, impidiendo al admin ver costos históricos si la empresa se desactiva). | [`20261021000001:785-818`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L785-L818) |
| **D-08** | **`ON DELETE` de `profiles.id` hacia `auth.users`** | `02-modelo-datos.md:124` define `id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT`. | `20261016000002:14` define `id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`. | [`20261016000002:14`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L14) |
| **D-09** | **Firma de `deactivate_company`** | `01-arquitectura.md:115` indica `deactivate_company(p_company_id UUID, p_reason TEXT)` asentando `deactivated_at` y `deactivated_by`. | `20261016000002:808` y `03-funciones.md:481` definen `deactivate_company(p_company_id UUID)` sin `p_reason` ni columnas `deactivated_at`/`deactivated_by` en `companies`. | [`20261016000002:808`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L808) |

---

## 3. Alcance de Tanda 2.2A contra `docs/spec/05-tests-y-tandas.md` y Análisis de Riesgos

### 3.1. Qué se agregó fuera del plan original de `docs/spec/05`
1. **Tabla `public.operation_idempotency` y protocolo de candado pesimista (`INSERT ... ON CONFLICT DO NOTHING` + `SELECT ... FOR UPDATE`):**
   - **Riesgo:** La restricción única es `UNIQUE (company_id, operation_type, idempotency_key)` ([`20261021000001:231`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L231)). No incluye `created_by` (es por empresa y tipo de operación, no por usuario) y **no tiene política de expiración/purga**, por lo que crecerá indefinidamente y un `master_admin` que colisione con la clave de otro `master_admin` de la misma empresa con los mismos parámetros recibirá el `response_payload` previo sin ejecutar la operación.
2. **Columna `companies.allow_negative_stock BOOLEAN NOT NULL DEFAULT false`:**
   - **Riesgo:** Por defecto es `false` (contradiciendo la especificación funcional donde el stock negativo está permitido para no frenar ventas/operaciones), y **no existe ninguna RPC para que el titular o `master_admin` pueda cambiar este valor**, quedando bloqueado en `false` salvo intervención directa con rol `postgres`/`service_role`.
3. **Columnas `previous_stock` y `new_stock` en `stock_movements` y validaciones estrictas de unidades indivisibles (`unidad`, `bulto`, `par`):**
   - **Riesgo:** Positivo para trazabilidad contable, pero el `CHECK` en `products` (`chk_products_integer_stock`, [`20261021000001:108-110`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L108-L110)) impedirá cambiar `unit` de un producto de `'kg'` a `'unidad'` si en ese momento tiene stock o `min_stock` con decimales.
4. **En Tanda 2.1 (previa): Gobernanza SaaS completa (`create_company`, `company_invitations`, `invite_user_to_company`, `accept_company_invitation`, `transfer_company_ownership`, `deactivate_company`, `reactivate_member`, `revoke_company_invitation`):**
   - **Riesgo:** Agrega superficie de ataque multi-tenant (cualquier usuario autenticado puede ejecutar `create_company` ilimitadamente y crear tenants; las funciones reciben `p_company_id` enviado por el cliente y dependen de que ninguna olvide llamar a `private.assert_company_role`).

### 3.2. Qué quedó fuera de Tanda 2.2A (Pendiente obligatorio para Tanda 2.2B)
1. **Trigger universal `public.audit_trigger()`** aplicado a todas las tablas de negocio.
2. **Operaciones de escritura (CRUD o RPCs) para el catálogo:** alta, edición y baja lógica de `categories`, `suppliers`, `products` y actualización manual de `product_costs`.
3. **Funciones masivas de catálogo:** `public.bulk_update_prices()` y `public.import_products()`.
4. **Trigger `create_initial_product_cost()`** al insertar un producto nuevo.

---

## 4. Archivos de Migración de más de 300 Líneas y Propuesta de División

Las reglas de [`AGENTS.md`](file:///c:/Users/herna/Desktop/Stockly/AGENTS.md) establecen archivos pequeños (~200 líneas) con una sola responsabilidad. Actualmente dos migraciones superan ampliamente las 300 líneas:

### 4.1. `20261016000002_tanda_2_1_multi_tenant_core.sql` (1.116 líneas)
**Propuesta de división en 6 archivos cohesivos (< 220 líneas cada uno):**
1. `20261016000002_tanda_2_1a_core_tables.sql` (~170 líneas): Función `validate_cuit`, tablas `profiles`, `companies`, `company_members`, `company_invitations`, `company_counters`, `audit_log` y vista `profiles_public`.
2. `20261016000003_tanda_2_1b_private_auth_helpers.sql` (~140 líneas): Funciones del esquema `private` (`my_active_company_ids`, `my_accessible_company_ids`, `has_company_role`, `assert_company_role`) y sus `GRANT`/`REVOKE`.
3. `20261016000004_tanda_2_1c_core_triggers.sql` (~150 líneas): Funciones de trigger (`set_updated_at`, `prevent_immutable_modification`, `handle_new_user`, `check_last_active_master_admin`, `protect_company_created_by`, `validate_company_timezone`, `audit_trigger`) y asociación de triggers.
4. `20261016000005_tanda_2_1d_rpc_company_lifecycle.sql` (~220 líneas): RPCs de empresa y titularidad (`local_today`, `create_company`, `transfer_company_ownership`, `deactivate_company`).
5. `20261016000006_tanda_2_1e_rpc_invitations_members.sql` (~260 líneas): RPCs de invitaciones y miembros (`invite_user_to_company`, `accept_company_invitation`, `reactivate_member`, `revoke_company_invitation`).
6. `20261016000007_tanda_2_1f_core_rls_and_grants.sql` (~140 líneas): `ENABLE/FORCE ROW LEVEL SECURITY`, políticas RLS de las 6 tablas base y bloque final de `GRANT`/`REVOKE`.

### 4.2. `20261021000001_tanda_2_2_catalogo_inventario.sql` (858 líneas)
**Propuesta de división en 5 archivos cohesivos (< 230 líneas cada uno):**
1. `20261021000001_tanda_2_2a_catalog_tables.sql` (~160 líneas): `ALTER TABLE companies`, tablas `categories`, `suppliers`, `products`, `product_costs`, índices y triggers `updated_at`.
2. `20261021000002_tanda_2_2b_ledger_and_idempotency.sql` (~170 líneas): Tablas `stock_movements`, `movement_costs`, `operation_idempotency`, triggers de inmutabilidad y `sync_product_stock()`.
3. `20261021000003_tanda_2_2c_rpc_stock_adjustment.sql` (~190 líneas): RPC `register_stock_adjustment()`.
4. `20261021000004_tanda_2_2d_rpc_initial_stock.sql` (~230 líneas): RPC `import_initial_stock()`.
5. `20261021000005_tanda_2_2e_inventory_rls_and_grants.sql` (~110 líneas): `ENABLE/FORCE ROW LEVEL SECURITY`, las 7 políticas RLS de inventario y bloque de `GRANT`/`REVOKE`.

---

## 5. Checklist Exhaustivo de Seguridad

| # | Ítem de Seguridad | Estado | Referencia (`archivo:línea`) y Evidencia |
| :---: | :--- | :---: | :--- |
| **1** | **`audit_trigger`:** clave primaria variable, `record_id TEXT`, `performed_by` nulo, sin ruido por cambios solo de `current_stock`. | **FALLA** | La tabla `audit_log` define `record_id TEXT NOT NULL` ([`20261016000002:146`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L146)) y `performed_by UUID NULL` ([`L150`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L150)), pero **la función `audit_trigger()` NO está implementada en ninguna migración**. Solo existe en [`docs/spec/02-modelo-datos.md:744-811`](file:///c:/Users/herna/Desktop/Stockly/docs/spec/02-modelo-datos.md#L744-L811). |
| **2** | **Banderas `set_config`:** vueltas a `'false'` al terminar. | **OK (En migraciones no se usan)** | En las 3 migraciones escritas no se utiliza ninguna bandera `set_config` de bypass (la sincronización de stock se hace en un trigger `BEFORE INSERT` `SECURITY DEFINER`, [`20261021000001:247-310`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L247-L310)). En `docs/spec/03-funciones.md` (Tandas 2.3/2.4 futuras) sí se vuelven a `'false'` ([`03-funciones.md:839, 1026, 1365, 1404`](file:///c:/Users/herna/Desktop/Stockly/docs/spec/03-funciones.md#L839)). |
| **3** | **Todas las `SECURITY DEFINER` con `SET search_path = ''`, `EXECUTE` revocado a `PUBLIC` y `anon`.** | **OK** | Las 20 funciones `SECURITY DEFINER` declaran `SET search_path = ''`: [`20261016000002:176, 195, 226, 249, 307, 320, 336, 362, 398, 449, 467, 529, 634, 750, 814, 887, 957`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L176) y [`20261021000001:251, 330, 508`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L251). Además, `ALTER DEFAULT PRIVILEGES` revoca `EXECUTE` a `PUBLIC` y `anon` ([`20261016000001:54-60`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000001_tanda_2_0_base_security.sql#L54-L60)) y cada función tiene `REVOKE ALL ... FROM PUBLIC, anon` explícito ([`20261016000002:287-290, 1098-1116`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L287-L290), [`20261021000001:854-858`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L854-L858)). |
| **4** | **RLS habilitado en todas las tablas y políticas escritas con `(select f())`.** | **FALLA PARCIAL** | RLS está habilitado en las 13 tablas ([`20261016000002:1001-1006`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L1001-L1006), [`20261021000001:763-782`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L763-L782)). Sin embargo: (a) En Tanda 2.1 falta `FORCE ROW LEVEL SECURITY` en las 6 tablas; (b) `profiles` usa `id = auth.uid()` sin `(SELECT auth.uid())` ([`20261016000002:1013, 1019`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L1013)); (c) `product_costs`, `movement_costs` y `operation_idempotency` llaman a `private.has_company_role(company_id, 'master_admin')` directo sin envolver en `(SELECT ...)` ([`20261021000001:804, 817, 825`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L804)). |
| **5** | **`authenticated` sin `INSERT/UPDATE/DELETE` en tablas que solo se escriben por funciones.** | **OK** | Revocado en `ALTER DEFAULT PRIVILEGES` ([`20261016000001:64`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000001_tanda_2_0_base_security.sql#L64)) y explícitamente en todas las tablas de Tanda 2.1 ([`20261016000002:1080-1084`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L1080-L1084)) y Tanda 2.2A ([`20261021000001:833-848`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L833-L848)). La única columna con `UPDATE` para `authenticated` es `profiles(full_name)` ([`20261016000002:1072`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L1072)). |
| **6** | **Precios y totales calculados en el servidor, nunca recibidos del cliente.** | **OK** | En `register_stock_adjustment` el servidor lee `cost_price` de `product_costs` y calcula `v_total_cost := round(p_quantity * v_unit_cost, 2)` ([`20261021000001:440-445`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L440-L445)). En `import_initial_stock` recibe el costo unitario inicial del lote y calcula `v_total_cost := round(v_qty * v_cost, 2)` en el servidor ([`20261021000001:700`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L700)). |
| **7** | **Los costos no son legibles por empleados.** | **OK** | `product_costs` y `movement_costs` tienen políticas RLS exclusivas para `master_admin` activo ([`20261021000001:800-805, 813-818`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L800-L818)). Además, `register_stock_adjustment` (que devuelve `unit_cost` y `total_cost` en el JSONB) exige `master_admin` ([`20261021000001:354`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L354)). |
| **8a** | **Multiempresa — `company_id NOT NULL` e índice en todas las tablas de negocio.** | **OK** | Todas las tablas de negocio (`company_members`, `company_invitations`, `company_counters`, `categories`, `suppliers`, `products`, `product_costs`, `stock_movements`, `movement_costs`, `operation_idempotency`) tienen `company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT` e índices compuestos encabezados por `company_id`. Solo `audit_log.company_id` es nullable por diseño ([`20261016000002:144`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L144)). |
| **8b** | **Multiempresa — RLS por membresía activa.** | **FALLA PARCIAL** | `private.my_accessible_company_ids()` exige `cm.is_active = true` ([`20261016000002:202, 210`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L202)), pero en `company_invitations_select` ([`L1042-1045`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L1042-L1045)) y `audit_log_select_admin` ([`L1055-1058`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L1055-L1058)) consulta `company_members` sin cruzar con `companies.is_active`, y no existe un test en Tanda 2.2A que verifique que un miembro con `cm.is_active = false` pierde inmediatamente acceso a `products`, `stock_movements` y RPCs de inventario. |
| **8c** | **Multiempresa — Unicidad por empresa (`sku`, nombres, comprobantes).** | **OK** | `uq_categories_company_clean_name` ([`20261021000001:41`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L41)), `uq_suppliers_company_clean_name` ([`L69`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L69)), `uq_products_company_clean_sku` ([`L115`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L115)), `uq_products_company_clean_barcode` ([`L118`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L118)) y `company_counters` con `PRIMARY KEY (company_id, kind)` ([`20261016000002:136`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L136)). |
| **8d** | **Multiempresa — Las funciones derivan la empresa de la membresía del usuario y nunca confían en un `company_id` enviado por el cliente.** | **FALLA / RIESGO DE DISEÑO** | Como un usuario puede pertenecer a múltiples empresas, todas las RPCs reciben `p_company_id UUID` enviado por el cliente y lo validan con `private.assert_company_role(p_company_id, ...)`. **Falla puntual en `local_today(p_company_id UUID)` ([`20261016000002:444-455`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L444-L455)):** es `SECURITY DEFINER`, está concedida a `authenticated` y **NO valida membresía**, permitiendo consultar la zona horaria/fecha de cualquier `company_id`. |
| **8e** | **Multiempresa — Tests de aislamiento (usuario de A no ve ni modifica nada de B, tampoco vía funciones ni feed).** | **FALLA PARCIAL (Incompleto)** | `01_tanda_2_0_and_2_1.test.sql` prueba aislamiento en tablas core y `invite_user_to_company`. `02_tanda_2_2_inventory.test.sql` prueba `SELECT` de productos de B por Admin A (`T-04`, [`L166`](file:///c:/Users/herna/Desktop/Stockly/supabase/tests/02_tanda_2_2_inventory.test.sql#L166)), pero **NO tiene tests donde Admin A intente ejecutar `register_stock_adjustment` o `import_initial_stock` pasando `company_b` o pasando `company_a` con un `prod_b1` de la Empresa B**, ni existe aún `get_activity_feed`. |
| **9** | **Idempotencia:** clave acotada por empresa y usuario, compara hash de parámetros y tiene política de expiración. | **FALLA PARCIAL** | Compara SHA-256 (`request_hash`, [`20261021000001:425, 656`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L425)), pero: (a) La clave `UNIQUE (company_id, operation_type, idempotency_key)` ([`L231`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261021000001_tanda_2_2_catalogo_inventario.sql#L231)) está acotada por empresa y tipo de operación, **NO por usuario (`created_by`)**; (b) **NO tiene columna `expires_at` ni política de expiración/purga**. |
| **10** | **Quién puede cambiar `allow_negative_stock` y si queda auditado.** | **FALLA** | `REVOKE INSERT, UPDATE, DELETE ON public.companies FROM authenticated, anon` ([`20261016000002:1080`](file:///c:/Users/herna/Desktop/Stockly/supabase/migrations/20261016000002_tanda_2_1_multi_tenant_core.sql#L1080)) y **no existe ninguna función RPC** para modificar `companies.allow_negative_stock` ni auditar su cambio. Hoy solo un superusuario (`postgres`) puede cambiarlo fuera de la aplicación. |


---

## 6. Registro de Evidencia Empírica de la Sesión (Fases B y C)

### 6.1. Archivos Creados o Modificados en esta Sesión
1. **Migraciones (`supabase/migrations/*.sql`):** **0 modificaciones.** Ningún archivo de migración fue tocado.
2. **Documentación creada:**
   - [`docs/ESTADO.md`](file:///c:/Users/herna/Desktop/Stockly/docs/ESTADO.md): Diagnóstico completo, inventario, discrepancias, checklist y resultados de ejecución.
   - [`docs/DECISIONES_PENDIENTES.md`](file:///c:/Users/herna/Desktop/Stockly/docs/DECISIONES_PENDIENTES.md): Cinco decisiones arquitectónicas documentadas con opciones y recomendación para Tanda 2.2B.
3. **Configuración de Seed creada:**
   - [`supabase/seed.sql`](file:///c:/Users/herna/Desktop/Stockly/supabase/seed.sql): Archivo con comentario único (`-- Archivo seed intencionalmente vacío (sin datos de prueba).`), requerido por `supabase/config.toml` (`[db.seed] enabled = true`).
4. **Tests modificados:**
   - [`supabase/tests/02_tanda_2_2_inventory.test.sql`](file:///c:/Users/herna/Desktop/Stockly/supabase/tests/02_tanda_2_2_inventory.test.sql):
     - `SELECT plan(22);` -> `SELECT plan(26);`.
     - `GRANT SELECT, INSERT ON TABLE test_context TO authenticated;` en el setup temporal.
     - Reemplazo de los 2 CUITs ficticios inválidos (`20-12345678-9` y `20-98765432-1`) por CUITs válidos bajo algoritmo Módulo 11 (`30-71111111-1` y `30-70000004-0`).
     - Desdoblamiento de `T-21` en `T-21a` (`authenticated` -> `42501`) y `T-21b` (`RESET ROLE` -> `P0001` con el mensaje exacto del trigger `prevent_immutable_modification()`).
     - Reemplazo de los patrones `%...%` en `throws_ok` por el mensaje exacto en `T-06`, `T-07`, `T-08`, `T-09`, `T-13`, `T-17`, `T-18`, y por `throws_like` en `T-14` y `T-19` (que interpolan el UUID dinámico del producto).

### 6.2. Evidencia de `npx supabase db reset --yes`
Orden exacto ejecutado por el motor local:
1. `Applying migration 20261016000001_tanda_2_0_base_security.sql...`
2. `Applying migration 20261016000002_tanda_2_1_multi_tenant_core.sql...`
3. `Applying migration 20261021000001_tanda_2_2_catalogo_inventario.sql...`
4. `Seeding data from supabase/seed.sql...` (confirmado empíricamente que la CLI lee `supabase/seed.sql` durante el reset).

### 6.3. Debilidad Residual en Tests (`T-14` y `T-19`) y Cómo Mejorarla
- En `T-14` y `T-19` se utilizó `throws_like(sql, pattern, description)` porque el mensaje de `RAISE EXCEPTION` incluye el UUID generado dinámicamente para `prod_a1`.
- **Debilidad:** `throws_like` en pgTAP verifica que la consulta lance una excepción cuyo mensaje coincida con el patrón `LIKE`, pero **no verifica explícitamente que el código SQLSTATE sea `'P0001'`**.
- **Cómo mejorarlo en la próxima iteración:** Construir el string de mensaje esperado exacto dinámicamente con `format()` inyectando el UUID real de `prod_a1` desde `test_context`, y volver a usar `throws_ok(sql, 'P0001', format('Stock insuficiente para el producto %s. Existencia actual: 15.00, solicitada: 20.00', ...), description)`. De esa forma se valida simultáneamente el código `P0001` y el mensaje exacto caracter por caracter.
