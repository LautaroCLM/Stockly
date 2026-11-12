import type { PreviewRow } from './types';

const MIN_PERCENT = 90;
const MAX_PERCENT = 1000;

/** Lee un porcentaje escrito a la argentina ("10", "7,5"). Devuelve null si no es un número válido. */
export function parsePercent(text: string): number | null {
  const clean = text.trim().replace(',', '.');
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(clean)) return null;
  return Number(clean);
}

/** Problema con el porcentaje escrito, o null si sirve. `direction` indica si se sube o se baja. */
export function validatePercent(text: string, direction: 'up' | 'down'): string | null {
  if (text.trim() === '') return 'Escribí el porcentaje.';
  const value = parsePercent(text);
  if (value === null) return 'Escribí un número, con hasta 2 decimales (por ejemplo 10 o 7,5).';
  if (value === 0) return 'El porcentaje tiene que ser mayor a 0.';
  if (direction === 'down' && value > MIN_PERCENT) return `La baja no puede superar el ${MIN_PERCENT} %.`;
  if (direction === 'up' && value > MAX_PERCENT) return `El aumento no puede superar el ${MAX_PERCENT} %.`;
  return null;
}

/** Porcentaje con signo para enviar a la base (la baja va negativa). */
export function signedPercent(text: string, direction: 'up' | 'down'): number | null {
  const value = parsePercent(text);
  if (value === null) return null;
  return direction === 'down' ? -value : value;
}

/** Diferencia porcentual entre el precio actual y el nuevo, con un decimal. */
export function rowChangePercent(row: Pick<PreviewRow, 'oldPrice' | 'newPrice'>): number {
  if (row.oldPrice <= 0) return 0;
  return Math.round(((row.newPrice - row.oldPrice) / row.oldPrice) * 1000) / 10;
}

export interface PreviewSummary {
  selected: number;
  excluded: number;
}

/** Cuántos productos se van a cambiar y cuántos tildó el usuario para dejar afuera. */
export function summarizePreview(rows: PreviewRow[], excluded: ReadonlySet<string>): PreviewSummary {
  const excludedCount = rows.filter((r) => excluded.has(r.productId)).length;
  return { selected: rows.length - excludedCount, excluded: excludedCount };
}

/** Alterna un id dentro de un conjunto sin modificar el original. */
export function toggleId(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}
