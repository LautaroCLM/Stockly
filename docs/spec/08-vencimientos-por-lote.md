# 08 — Vencimientos por lote

Estado: **hecha (2026-11-27)**. Migración `20261204000001_stock_lots.sql`, tests pgTAP `41_stock_lots.test.sql`.

## Decisiones tomadas
- **Lotes con descuento automático.** Cada compra de un producto con vencimiento indica fecha (y, si se quiere,
  número de lote). Las salidas descuentan solas del lote que vence primero, así siempre se sabe cuántas unidades
  quedan de cada fecha.
- **Solo en los productos marcados** con "Controla vencimiento". El resto sigue igual que hoy.
- **Vender vencidos: se avisa y se deja vender.** Hay una acción para dar de baja un lote vencido
  (queda como pérdida en el Historial).
- **Aviso 30 días antes**, configurable por empresa.

## Reglas
- El stock sigue saliendo de `stock_movements`; los lotes no lo reemplazan, lo detallan. Para un producto con
  vencimiento, la suma de lo que queda en sus lotes es igual a su stock.
- Lo hace la base, en un solo lugar: un trigger sobre `stock_movements` reparte cada movimiento en lotes. Así
  ventas, compras, ajustes, conteos, anulaciones y devoluciones quedan cubiertas sin tocar cada pantalla.
  - **Entrada por compra**: crea el lote con la fecha de esa línea. La compra exige fecha para productos con vencimiento.
  - **Otras entradas** (carga inicial, conteo, ajuste, importación): van a un lote "sin fecha".
  - **Salidas**: primero el lote que vence antes; "sin fecha" al final. Si no alcanza, el resto queda sin lote
    (stock negativo, como hoy).
  - **Anular una venta o una devolución**: las unidades vuelven a los mismos lotes de los que salieron.
  - **Anular una compra**: se descuenta del lote que creó esa compra.
- Al activar "Controla vencimiento" en un producto con stock, ese stock queda en un lote "sin fecha"; se le puede
  cargar fecha y número después.
- Dar de baja un lote: registra una salida "pérdida / rotura" de ese lote puntual.
- Permisos: los lotes los ve todo el equipo (el carrito avisa a quien vende); editar, separar o dar de baja,
  **Productos** operar. Configurar días de aviso: Master Admin.

## Tablas
- `products.tracks_expiry` (boolean).
- `stock_lots`: producto, número de lote (opcional), vence (fecha, o sin fecha), cantidad inicial, cantidad
  que queda, compra que lo creó.
- `stock_lot_allocations`: qué cantidad de cada movimiento salió de (o entró a) qué lote. Sirve para devolver
  a los mismos lotes al anular.
- `stock_movements`: columnas opcionales `lot_code`, `expires_on` (las completa la compra). Para dar de baja un
  lote puntual, la función le indica el lote al trigger con una variable local de la transacción.
- `companies.expiry_warning_days` (por defecto 30).

## Pantallas
- **Producto**: casilla "Controla vencimiento".
- **Compras**: por cada línea de un producto con vencimiento, campos "Vence" (obligatorio) y "Lote" (opcional).
- **Inventario → "Vencimientos"**: lotes con lo que queda, ordenados por fecha; filtros Vencidos / Por vencer /
  Todos; editar fecha y número, y dar de baja.
- **Ficha / tabla de producto**: próximo vencimiento. *Pendiente*: por ahora se ve en la pestaña Vencimientos.
- **Avisos (campanita)**: "X lotes vencidos" y "X lotes vencen en los próximos N días".
- **Carrito**: aviso si el producto tiene unidades vencidas (la venta sigue).
- **Días de aviso**: en la misma pestaña Vencimientos (solo el Master Admin).

## Tests
- pgTAP: compra crea lote; venta descuenta del que vence primero y salta a "sin fecha" al final; venta que
  consume dos lotes; anular venta devuelve a los mismos lotes; devolución; anular compra; conteo hacia abajo y
  hacia arriba; dar de baja; activar en producto con stock; producto sin vencimiento no crea lotes; la suma de
  lotes coincide con el stock; aislamiento entre empresas; empleado sin permiso.
- Vitest: estado del lote (vencido / por vencer / ok) y armado de avisos.
