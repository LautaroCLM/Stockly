/**
 * Limpieza de cada error antes de mandarlo a Sentry. Nunca salen datos de clientes, importes ni
 * credenciales: solo qué falló, dónde y en qué pantalla.
 * - Usuario: solo su id (nada de email, nombre ni IP).
 * - URLs: sin parámetros (los filtros de búsqueda pueden tener nombres o CUIT de clientes).
 * - Sin cuerpos de pedidos, cookies ni cabeceras.
 * - Mensajes: se recortan y se tapan números largos (CUIT, DNI, teléfonos, tarjetas).
 */

/** Forma mínima de un evento de Sentry que se limpia (los demás campos pasan tal cual). */
export interface ScrubbableEvent {
  message?: string;
  user?: { id?: string | number; [key: string]: unknown };
  request?: { url?: string; [key: string]: unknown };
  exception?: { values?: { value?: string; [key: string]: unknown }[] };
  breadcrumbs?: { message?: string; data?: Record<string, unknown>; [key: string]: unknown }[];
  extra?: Record<string, unknown>;
}

const MAX_TEXT = 500;

/** Saca la parte "?..." y "#..." de una URL. */
export function stripQuery(url: string): string {
  return url.split(/[?#]/)[0];
}

/** Tapa secuencias de 7 o más dígitos (con o sin guiones): CUIT, DNI, teléfonos, tarjetas. */
export function maskNumbers(text: string): string {
  return text.replace(/\d[\d-]{5,}\d/g, (m) => (m.replace(/\D/g, '').length >= 7 ? '[número]' : m)).slice(0, MAX_TEXT);
}

export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  if (event.user) event.user = event.user.id !== undefined ? { id: event.user.id } : {};
  if (event.request) event.request = event.request.url ? { url: stripQuery(event.request.url) } : {};
  if (event.message) event.message = maskNumbers(event.message);
  for (const value of event.exception?.values ?? []) {
    if (value.value) value.value = maskNumbers(value.value);
  }
  event.breadcrumbs = (event.breadcrumbs ?? []).map((crumb) => {
    const data = crumb.data ? { ...crumb.data } : undefined;
    if (data && typeof data.url === 'string') data.url = stripQuery(data.url);
    if (data && typeof data.to === 'string') data.to = stripQuery(data.to);
    if (data && typeof data.from === 'string') data.from = stripQuery(data.from);
    if (data) delete data.body;
    return { ...crumb, message: crumb.message ? maskNumbers(crumb.message) : crumb.message, data };
  });
  delete event.extra;
  return event;
}
