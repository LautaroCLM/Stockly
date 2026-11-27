# 06 — Factura electrónica ARCA (ex AFIP)

Estado: **plan, pendiente de confirmación** (2026-11-26).

## Decisiones tomadas
- Una empresa es **Responsable Inscripto** (emite Factura A y B) y la otra **Monotributo** (emite Factura C).
- La factura se emite **a pedido**: la venta se cobra como hoy y después se pide el CAE desde la venta
  (botón "Facturar" en Ventas o tilde "Facturar" en el carrito). Si ARCA no responde, la venta no se traba.
- Web service de ARCA: **WSFEv1** (factura electrónica mercado interno), con autenticación **WSAA**.
- Se arranca en **homologación** (ambiente de prueba de ARCA, sin validez fiscal) y se pasa a producción
  recién cuando todo esté probado.

## Qué no cambia
- Ventas, caja y stock funcionan igual. La factura es un comprobante fiscal que se cuelga de una venta existente.
- Los tickets, presupuestos y remitos X siguen como están (no fiscales).

## Arquitectura
- **Edge Function `arca`** (TypeScript, Supabase): única pieza que habla con ARCA. Firma el pedido de acceso
  con el certificado de la empresa, guarda el token (dura 12 h) y pide el CAE.
- El **certificado y la clave privada** de cada empresa se guardan cifrados (Supabase Vault) y solo los lee
  la Edge Function. Nunca llegan al navegador después de cargarlos.
- La numeración la da ARCA: antes de cada factura se consulta el último número autorizado del punto de venta
  y tipo. Un bloqueo por empresa + punto de venta + tipo evita dos facturas con el mismo número.
- Si ARCA falla o no contesta, la factura queda **"Pendiente"** con el error a la vista y se reintenta;
  antes de reintentar se verifica en ARCA si ya se había autorizado, para no duplicar.
- Una factura con CAE **no se anula**: se corrige con una **nota de crédito** (A/B/C), como exige ARCA.

## Dependencias nuevas (a justificar)
- `node-forge` en la Edge Function: firmar el pedido de acceso de WSAA (CMS/PKCS#7). Deno no lo trae.
- `qrcode` en el frontend: el QR obligatorio de ARCA en cada factura impresa (RG 4892). Hoy no hay librería de QR.

## Tandas
1. **Datos fiscales. HECHA (2026-11-27).** Tabla `arca_settings` (punto de venta electrónico, inicio de
   actividades, ingresos brutos), `products.vat_rate` (21 % por defecto; el precio de venta lo incluye) y
   `customers.vat_condition` (consumidor final por defecto; Responsable Inscripto exige CUIT).
   La condición de IVA del emisor sigue en `document_settings.tax_condition`.
   El campo de IVA del producto solo se muestra si la empresa es Responsable Inscripto.
   Migración `20261128000001_arca_fiscal_data.sql`, tests pgTAP `35_arca_fiscal_data.test.sql`.
2. **Conexión con ARCA (homologación).** Pantalla del certificado (Stockly genera la clave y el pedido CSR
   dentro de la Edge Function, así la clave privada nunca pasa por el navegador) y "Probar conexión".
   Edge Function con WSAA + WSFEv1: último número, pedir CAE, consultar un comprobante.
   Tests con respuestas grabadas de ARCA.
   Ojo: `customers.tax_id` guarda el CUIT con guiones; a ARCA se le manda solo con dígitos.
3. **Emitir facturas.** Elegir A/B/C según emisor y cliente, IVA discriminado en la A, CAE + vencimiento + QR,
   impresión 80 mm y A4, envío por WhatsApp como el ticket. Estado "Pendiente / Autorizada / Rechazada".
4. **Notas de crédito.** Desde una devolución o una anulación de venta facturada, asociada a la factura original.
5. **Libro IVA Ventas.** Informe por período con exportación a Excel para el contador.
6. **Paso a producción.** Certificado de producción, punto de venta real, primera factura real controlada.

## Lo que tiene que hacer la empresa en ARCA (no lo puede hacer Stockly)
- Clave fiscal nivel 3 de cada CUIT.
- Crear un **punto de venta "Web Services"** en "Administración de puntos de venta y domicilios".
- Generar el certificado (homologación con WSASS; producción con "Administración de certificados digitales")
  y autorizarlo para el servicio **wsfe**. Stockly genera el pedido de certificado (CSR) para que solo haya
  que subirlo.
