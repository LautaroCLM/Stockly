# 10 — Depósitos

Estado: **hecha (2026-11-27)**. Migración `20261206000001_warehouses.sql`, tests pgTAP `43_warehouses.test.sql`.

## Decisiones tomadas
- **Depósitos, no sucursales:** un mismo local con varios lugares de stock (ej. "Salón" y "Depósito"). Una sola
  caja, una sola numeración de ventas, mismos precios.
- **Cada PC tiene elegido su depósito** (se cambia desde el encabezado). Ventas, compras, ajustes y devoluciones
  hechas en esa PC mueven el stock de ese depósito.
- Hoy: 2 depósitos en una de las empresas. La otra sigue con uno solo y no nota ningún cambio.

## Reglas
- Toda empresa tiene un depósito **"Principal"** (se crea solo; todo el stock actual queda ahí). Mientras haya
  uno solo, la app se ve igual que hoy: no aparece ningún selector.
- El stock total del producto sigue existiendo (lo usan informes, avisos de reposición, Excel). El stock por
  depósito sale de los mismos movimientos: cada movimiento indica su depósito.
- **Cómo sabe la base el depósito:** la app manda el depósito de la PC en cada pedido y un trigger lo anota en el
  movimiento (si no viene, va al Principal). Así no hay que tocar una por una las ~18 funciones que mueven stock.
  La base verifica que el depósito sea de la empresa y esté activo.
- **Stock negativo:** la regla de la empresa ("permite stock negativo") se aplica **por depósito**: si no se
  permite, no se puede vender del Salón lo que solo está en el Depósito; hay que transferir antes.
- **Transferencias:** de un depósito a otro, varios productos a la vez, con número (TRF-00000001) y nota. Generan
  una salida y una entrada; el stock total no cambia. Se ven en el Historial de movimientos.
- **Conteo físico:** se cuenta un depósito (el de la PC); la diferencia es contra el stock de ese depósito.
- **Vencimientos por lote:** por ahora siguen siendo de toda la empresa (las transferencias no los mueven).
  Si más adelante hace falta saber en qué depósito está cada lote, se agrega aparte.
- Permisos: crear/renombrar/desactivar depósitos, Master Admin. Transferir, **Productos** operar. Elegir el
  depósito de la PC, cualquiera.
- No se puede desactivar un depósito con stock, ni el Principal.

## Tablas
- `warehouses`: nombre (único por empresa), principal sí/no, activo.
- `product_stock`: producto × depósito → cantidad (la mantiene el trigger, como hoy `current_stock`).
- `stock_movements.warehouse_id` (obligatorio; los movimientos viejos quedan en el Principal).
- `stock_transfers` y `stock_transfer_items`: número, desde, hasta, nota, productos y cantidades.
- Motivos de movimiento nuevos: `transfer_out` y `transfer_in`.
- `register_physical_count` e `import_inventory` (si fija cantidades) pasan a mirar el stock del depósito.

## Pantallas
- **Encabezado:** "Depósito: Salón" para elegir el de esta PC (solo si hay más de uno activo).
- **Inventario → pestaña "Depósitos"** (el admin siempre; el resto, si hay más de un depósito):
  administración de depósitos (admin), nueva transferencia, stock de cada producto por depósito y últimas
  transferencias.
- **Movimientos de Stock:** el depósito de cada movimiento debajo del motivo, y filtro por transferencias.
  La columna "Stock antes → después" sigue mostrando el total de la empresa.
- Pendiente para más adelante: mostrar "en Salón" dentro de compras, ajustes y conteo (hoy lo indica el
  encabezado) y un filtro por depósito en la tabla de Inventario.

## Tests
- pgTAP: empresa nueva y existentes con Principal y su stock; venta desde el depósito de la PC; depósito ajeno o
  inactivo rechazado; stock negativo por depósito; transferencia (total igual, cada depósito cambia); conteo por
  depósito; anulación vuelve al depósito de la venta; compra al depósito de la PC; suma por depósito = total;
  los lotes no se mueven con transferencias; permisos y aislamiento.
- Vitest: armado de la transferencia y vista del stock por depósito.
