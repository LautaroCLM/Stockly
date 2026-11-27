# 11 — Módulos Atmosférico y Municipio

Estado: **hecha (2026-11-27)**. Migración `20261207000001_customer_municipality.sql`, tests pgTAP
`44_customer_municipality.test.sql`.

## Por qué
Un cliente de Stockly los pidió para organizarse. Otros módulos ya cumplen esa función, así que son
**vistas** de esos módulos con su propio nombre en el menú: no duplican datos.

## Atmosférico
- Es **Máquinas filtrado al tipo "Atmosférico"** (el tipo ya existía). Misma pantalla: camiones, estado y lo
  gastado en el período. "Nuevo atmosférico" crea la máquina con ese tipo.
- Los gastos se siguen cargando en Gastos eligiendo la máquina; se ven en Máquinas y en Atmosférico.
- Permiso: el mismo de **Máquinas**.

## Municipio
- Clientes con la marca **"Es municipio u organismo público"** (`customers.is_municipality`, se marca en el
  formulario del cliente; la guarda `set_customer_municipality`, permiso Clientes para operar).
- La pantalla es **Cobros y Pagos filtrado a esos clientes**: total a cobrar, saldo, estado de cuenta, cobrar y
  recordatorio por WhatsApp.
- Permiso: el mismo de **Cobros y Pagos**.
- Pendiente si hace falta: listado de ventas al municipio.

## Ocultos por defecto
- Los dos vienen ocultos en el menú de todos. Cada persona los activa en **Mis preferencias** ("Viene oculto:
  activalo si lo usás").
- Se guarda en `user_preferences.hidden_routes` como `show:atmosferico` / `show:municipio` (sin cambiar la base):
  en la app la lista sigue siendo "módulos ocultos".
