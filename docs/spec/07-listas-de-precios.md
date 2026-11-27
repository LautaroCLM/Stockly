# 07 — Listas de precios

Estado: **hecha (2026-11-27)**. Migración `20261203000001_price_lists.sql`, tests pgTAP `40_price_lists.test.sql`.

## Decisiones tomadas
- Cada lista es un **porcentaje sobre el precio de venta** (ej. Mayorista −15 %), con **redondeo**
  (al centavo, a $1, a $10 o a $100). A un producto puntual se le puede **fijar un precio propio** en esa lista.
  Cuando cambian los precios de venta, las listas acompañan solas (salvo los precios fijados).
- La lista se elige **por cliente**: cada cliente puede tener una lista. Al elegirlo en el carrito, los precios
  cambian solos. Sin cliente (o cliente sin lista), se cobra el precio normal. El Master Admin puede cambiar la
  lista en el carrito para una venta puntual.

## Reglas
- **La base calcula el precio**, como hoy: la venta ignora el precio que manda la pantalla y cobra el de la lista.
  La pantalla muestra los precios que le da la base, así lo que se ve es lo que se cobra.
- La venta guarda qué lista se usó. Ticket, factura, devoluciones y notas de crédito usan el precio cobrado
  (ya quedan en cada línea de la venta), así que no cambian.
- Un empleado cobra con la lista del cliente; no puede elegir otra.
- Crear y editar listas: permiso **Cambio de precios** (el admin siempre).

## Tablas
- `price_lists`: nombre (único por empresa), porcentaje (−90 % a +1000 %), redondeo, activa.
- `price_list_items`: precio fijo de un producto en una lista (excepción).
- `customers.price_list_id`: lista del cliente.
- `sales.price_list_id`: lista con la que se cobró.

## Pantallas
- **Cambio de Precios → pestaña "Listas de precios"**: crear/editar listas, ver cómo queda cada producto,
  fijar o quitar excepciones.
- **Clientes**: campo "Lista de precios".
- **Carrito**: muestra la lista que se aplica y los precios con la lista; el admin puede cambiarla.
- **Ticket**: indica la lista usada.

## Tests
- pgTAP: cálculo con porcentaje y redondeo, excepción, venta que cobra con la lista del cliente, empleado que no
  puede cambiar la lista, aislamiento entre empresas.
- Vitest: lo que muestra el carrito con lista.
