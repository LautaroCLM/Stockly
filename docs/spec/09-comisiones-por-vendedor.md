# 09 — Comisiones por vendedor

Estado: **hecha (2026-11-27)**. Migración `20261205000001_seller_commissions.sql`, tests pgTAP `42_seller_commissions.test.sql`.

## Decisiones tomadas
- **El vendedor se elige al cobrar**, entre la gente de **Personal** (no tienen por qué tener cuenta en Stockly).
  Se puede dejar vacío: esa venta no genera comisión.
- **Porcentaje por vendedor** (ej. Juan 3 %, Ana 5 %). Quien no tiene porcentaje no aparece para elegir.
- **Base: total cobrado** de la venta (con descuento). Las anuladas no cuentan; las devoluciones se restan.
- **Informe y pago:** informe por período y vendedor, y un botón "Pagar comisión" que la registra como gasto
  (si es en efectivo, sale de la caja). No deja pagar dos veces el mismo período.

## Reglas
- La base calcula todo, como en ventas y listas de precios.
- La venta guarda el vendedor **y el porcentaje de ese momento**: si después cambia el porcentaje, las ventas
  ya hechas no cambian.
- Si se olvidaron de elegir el vendedor (o se eligió mal), quien tiene permiso de **Personal** operar lo puede
  corregir desde el detalle de la venta, mientras ese período no esté pagado. Queda en la auditoría.
- Comisión de una venta = total × porcentaje, redondeado al centavo. Devolución: se resta su importe × el mismo
  porcentaje. Anulación y devolución restan **en su propia fecha**: así un período ya pagado nunca cambia.
- Pagar: período (desde / hasta) y vendedor. El importe lo calcula la base. Se registra un gasto de categoría
  nueva **"Comisiones"** con el medio de pago elegido. Un período pagado queda cerrado para ese vendedor (no se
  puede pagar otro que se superponga). Anular el gasto reabre el período.
- Permisos: informe, **Personal** ver; porcentajes, corregir vendedor y pagar, **Personal** operar (pagar además
  pide **Gastos** operar, como cualquier gasto; el admin siempre). Elegir vendedor al cobrar y ver su nombre en
  ventas y tickets: todo el equipo.

## Tablas
- `employees.commission_percent` (0 a 50, vacío = no vende a comisión).
- `sales.seller_employee_id` y `sales.seller_commission_percent`.
- `commission_payments`: vendedor, desde, hasta, importe, gasto asociado, estado (activo / anulado).
- `expenses.category`: se agrega "comisiones".
- `process_sale`: parámetro nuevo opcional `p_seller_employee_id` (se recrea, como con las listas de precios).

## Pantallas
- **Personal → Comisiones**: porcentaje de cada empleado activo (vacío = no vende a comisión).
- **Cobro**: selector "Vendedor" (recuerda el último elegido en esa PC).
- **Ticket**: "Lo atendió: Juan".
- **Historial de Ventas**: columna vendedor; en el detalle, cambiar vendedor.
- **Personal → pestaña "Comisiones"**: período (este mes por defecto), por vendedor: ventas, total, devoluciones,
  comisión, pagado y pendiente; detalle de ventas; botón "Pagar comisión"; exportar a Excel.

## Tests
- pgTAP: venta con vendedor guarda el porcentaje; cambiar el porcentaje no toca ventas viejas; anulada no suma;
  devolución resta; informe por período; pagar crea el gasto y cierra el período; no se paga dos veces; anular el
  gasto reabre; no se cambia el vendedor de un período pagado; vendedor de otra empresa rechazado; permisos.
- Vitest: armado del informe y validación del formulario de pago.
