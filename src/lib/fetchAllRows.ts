/**
 * PostgREST corta cada respuesta en max_rows (1000 por defecto) sin avisar.
 * fetchAllRows lee una consulta completa pidiendo páginas consecutivas con .range().
 *
 * - La consulta debe tener un orden estable con desempate único (por ejemplo, .order('id'))
 *   para no saltear ni repetir filas entre páginas.
 * - Corta al recibir una página vacía, no una incompleta: si el servidor tuviera un
 *   max_rows menor al tamaño pedido, cortar por página incompleta perdería filas.
 */
export const FETCH_ALL_PAGE_SIZE = 1000;

export interface PageResponse<T, E> {
  data: T[] | null;
  error: E | null;
}

export async function fetchAllRows<T, E>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResponse<T, E>>,
  pageSize: number = FETCH_ALL_PAGE_SIZE
): Promise<PageResponse<T, E> & { data: T[] }> {
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) {
      return { data: rows, error };
    }

    const page = data ?? [];
    if (page.length === 0) {
      return { data: rows, error: null };
    }
    rows.push(...page);

    // Si el servidor devolvió menos filas que las pedidas, la próxima página arranca donde terminó esta
    if (page.length < pageSize) {
      from = from + page.length - pageSize;
    }
  }
}
