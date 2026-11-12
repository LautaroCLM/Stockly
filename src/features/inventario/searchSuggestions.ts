import type { Product } from './types';

export type SuggestionField = 'name' | 'sku' | 'barcode';

export interface ProductSuggestion {
  product: Product;
  /** Campo en el que coincidió lo escrito. */
  field: SuggestionField;
  /** Texto completo de ese campo: es lo que se completa en el buscador al elegirla. */
  text: string;
  /** Dónde empieza y cuánto mide la parte que coincide con lo escrito. */
  matchStart: number;
  matchLength: number;
}

export const MAX_SUGGESTIONS = 6;

/** Minúsculas y sin tildes, conservando el largo para poder ubicar la coincidencia en el texto original. */
export function foldText(value: string): string {
  return value
    .split('')
    .map((char) => char.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()[0] ?? char)
    .join('');
}

const FIELD_ORDER: readonly SuggestionField[] = ['name', 'sku', 'barcode'];

/** Menor rank = mejor. Empieza igual (0-2) gana a empieza una palabra (3) y esta a contiene (4-6). */
function rankOf(fieldIndex: number, matchStart: number, text: string): number {
  if (matchStart === 0) return fieldIndex;
  const startsWord = fieldIndex === 0 && /[\s\-_./]/.test(text[matchStart - 1] ?? '');
  return startsWord ? 3 : 4 + fieldIndex;
}

function bestMatch(product: Product, folded: string): (ProductSuggestion & { rank: number }) | null {
  let best: (ProductSuggestion & { rank: number }) | null = null;
  FIELD_ORDER.forEach((field, fieldIndex) => {
    const text = product[field];
    if (!text) return;
    const start = foldText(text).indexOf(folded);
    if (start < 0) return;
    const rank = rankOf(fieldIndex, start, text);
    if (best === null || rank < best.rank) {
      best = { product, field, text, matchStart: start, matchLength: folded.length, rank };
    }
  });
  return best;
}

/** Sugerencias para el buscador de productos: por nombre, SKU o código de barras, las que empiezan igual primero. */
export function suggestProducts(products: readonly Product[], query: string, limit = MAX_SUGGESTIONS): ProductSuggestion[] {
  const folded = foldText(query.trim());
  if (folded === '') return [];
  const matches: (ProductSuggestion & { rank: number })[] = [];
  for (const product of products) {
    const match = bestMatch(product, folded);
    if (match) matches.push(match);
  }
  matches.sort((a, b) => a.rank - b.rank || a.product.name.localeCompare(b.product.name, 'es'));
  // Dos productos con el mismo texto darían dos sugerencias idénticas: se muestra una sola
  const seen = new Set<string>();
  const result: ProductSuggestion[] = [];
  for (const { rank, ...suggestion } of matches) {
    const key = `${suggestion.field}:${foldText(suggestion.text)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(suggestion);
    if (result.length >= limit) break;
  }
  return result;
}
