import type { Product } from './types';

/** Lo mínimo de un evento de teclado que hace falta para decidir un atajo. */
export interface KeyInput {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

/** Elementos donde se escribe: ahí las teclas comunes (+, −, Supr) no son atajos. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/** Hay otra ventana abierta (formulario, confirmación) que tiene prioridad sobre los atajos de venta. */
export function isDialogOpen(doc: Document = document): boolean {
  return doc.querySelector('[role="dialog"]') !== null;
}

export const isPlusKey = (e: KeyInput) => !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === '+' || e.key === 'Add');
export const isMinusKey = (e: KeyInput) => !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === '-' || e.key === 'Subtract');
export const isCheckoutKey = (e: KeyInput) => e.key === 'F4';
/** F2 lleva al buscador de Inventario (Ctrl+K abre la búsqueda global en cualquier pantalla). */
export const isSearchKey = (e: KeyInput) => e.key === 'F2';

/**
 * Producto que corresponde a lo escrito o escaneado en el buscador, para agregarlo con Enter.
 * Primero busca coincidencia exacta de código de barras o SKU (lo que manda un lector);
 * si no hay, sirve solo cuando los filtros dejaron un único producto activo.
 */
export function pickProductForQuery(query: string, filtered: readonly Product[], all: readonly Product[]): Product | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const active = (p: Product) => p.isActive !== false;
  const exact = all.filter((p) => active(p) && (p.barcode.toLowerCase() === q || p.sku.toLowerCase() === q));
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  const candidates = filtered.filter(active);
  return candidates.length === 1 ? candidates[0] : null;
}

/** Mueve una selección dentro de una lista sin salirse de los bordes. */
export function moveSelection(index: number, count: number, delta: number): number {
  if (count <= 0) return -1;
  if (index < 0) return delta > 0 ? 0 : count - 1;
  return Math.max(0, Math.min(count - 1, index + delta));
}
