import { describe, expect, it } from 'vitest';
import { fetchAllRows } from './fetchAllRows';

/** Simula PostgREST: devuelve el rango pedido, recortado a maxRows. */
function fakeTable(total: number, maxRows: number) {
  const rows = Array.from({ length: total }, (_, i) => i);
  const calls: Array<[number, number]> = [];
  const fetchPage = async (from: number, to: number) => {
    calls.push([from, to]);
    const end = Math.min(to + 1, from + maxRows);
    return { data: rows.slice(from, end), error: null };
  };
  return { rows, calls, fetchPage };
}

describe('fetchAllRows', () => {
  it('lee más de 1000 filas en varias páginas', async () => {
    const table = fakeTable(2500, 1000);
    const result = await fetchAllRows(table.fetchPage);
    expect(result.error).toBeNull();
    expect(result.data).toEqual(table.rows);
  });

  it('no pierde filas si el servidor devuelve menos de lo pedido', async () => {
    const table = fakeTable(2500, 300);
    const result = await fetchAllRows(table.fetchPage, 1000);
    expect(result.data).toEqual(table.rows);
  });

  it('devuelve vacío sin errores en una tabla vacía', async () => {
    const table = fakeTable(0, 1000);
    const result = await fetchAllRows(table.fetchPage);
    expect(result.data).toEqual([]);
    expect(table.calls).toEqual([[0, 999]]);
  });

  it('corta y devuelve el error de cualquier página', async () => {
    let call = 0;
    const result = await fetchAllRows(async () => {
      call += 1;
      return call === 1
        ? { data: [1, 2, 3], error: null }
        : { data: null, error: { message: 'boom' } };
    }, 3);
    expect(result.error).toEqual({ message: 'boom' });
    expect(result.data).toEqual([1, 2, 3]);
  });
});
