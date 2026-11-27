/**
 * Depósito elegido en esta PC. Viaja en cada pedido a la base (cabecera x-stockly-warehouse) y un
 * trigger lo anota en los movimientos de stock: ventas, compras, ajustes y conteos de esta PC
 * mueven el stock de ese depósito. null = el principal de la empresa.
 */
let current: string | null = null;

export const WAREHOUSE_HEADER = 'x-stockly-warehouse';

export function setRequestWarehouse(id: string | null): void {
  current = id;
}

export function getRequestWarehouse(): string | null {
  return current;
}

/** fetch del cliente Supabase: agrega la cabecera solo a la API de datos (no a Auth ni Storage). */
export const fetchWithWarehouse: typeof fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!current || !url.includes('/rest/v1/')) return fetch(input, init);
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  headers.set(WAREHOUSE_HEADER, current);
  return fetch(input, { ...init, headers });
};
