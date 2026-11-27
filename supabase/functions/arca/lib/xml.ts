/**
 * Lectura mínima de las respuestas SOAP de ARCA. Son respuestas chicas y de forma fija,
 * así que alcanza con buscar etiquetas (Deno no trae un parser XML).
 */

const ENTITIES: Record<string, string> = { '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&amp;': '&' };

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Deshace las entidades (WSAA devuelve su XML interno escapado dentro de otra etiqueta). */
export function unescapeXml(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&(lt|gt|quot|apos|amp);/g, (entity) => ENTITIES[entity] ?? entity);
}

/** Contenido de todas las etiquetas con ese nombre, con o sin prefijo de espacio de nombres. */
export function readAllTags(xml: string, tag: string): string[] {
  const pattern = new RegExp(`<(?:[\\w.-]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${tag}>`, 'g');
  return Array.from(xml.matchAll(pattern), (m) => m[1].trim());
}

/** Contenido de la primera etiqueta con ese nombre, o null. */
export function readTag(xml: string, tag: string): string | null {
  return readAllTags(xml, tag)[0] ?? null;
}

/** Mensaje de un SOAP Fault, si la respuesta es un error. */
export function readSoapFault(xml: string): string | null {
  const fault = readTag(xml, 'faultstring');
  return fault === null ? null : unescapeXml(fault);
}
