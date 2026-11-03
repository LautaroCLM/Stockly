/**
 * Armado seguro de filtros de búsqueda para .or() de PostgREST.
 *
 * El texto del usuario va entre comillas dobles (con \ y " escapados) para que comas,
 * puntos o paréntesis no rompan la sintaxis del filtro. El * de PostgREST se descarta
 * del texto porque es el comodín que agregamos nosotros.
 */

/** Máximo de ids por filtro "in": mantiene la URL acotada. */
export const MAX_SEARCH_IDS = 300;

export function quoteSearchTerm(term: string): string {
  const cleaned = term.replace(/\*/g, '').trim();
  const escaped = cleaned.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"*${escaped}*"`;
}

/**
 * Devuelve el filtro para .or() que busca el texto en las columnas indicadas y, si hay,
 * en una lista de ids ya resueltos (por ejemplo, productos cuyo nombre coincide).
 * Devuelve null si no hay nada que buscar.
 */
export function buildSearchOrFilter(
  search: string,
  textColumns: string[],
  idMatch?: { column: string; ids: string[] }
): string | null {
  const term = search.replace(/\*/g, '').trim();
  if (!term) return null;

  const conditions = textColumns.map((column) => `${column}.ilike.${quoteSearchTerm(term)}`);

  if (idMatch && idMatch.ids.length > 0) {
    const ids = idMatch.ids.slice(0, MAX_SEARCH_IDS);
    conditions.push(`${idMatch.column}.in.(${ids.join(',')})`);
  }

  return conditions.join(',');
}
