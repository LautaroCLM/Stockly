import { isIndivisibleUnit } from './stockValidation';
import type { InitialStockItemInput, Product } from './types';

/** Una línea del lote tal como la escribe el usuario. */
export interface BatchDraftLine {
  productId: string;
  quantity: string;
  unitCost: string;
}

/** Valida el lote de carga inicial escrito en el formulario. Devuelve el mensaje de error o null. */
export function validateBatchDraft(items: BatchDraftLine[], productMap: Map<string, Product>): string | null {
  if (items.length === 0) return 'Debe agregar al menos un producto al lote.';
  for (const item of items) {
    const prod = productMap.get(item.productId);
    const name = prod?.name || item.productId;
    const qty = parseFloat(item.quantity);
    const cost = parseFloat(item.unitCost);
    if (Number.isNaN(qty) || qty <= 0) return `La cantidad para el producto "${name}" debe ser mayor a cero.`;
    if (prod && isIndivisibleUnit(prod.unit) && !Number.isInteger(qty)) {
      return `El producto "${prod.name}" tiene unidad indivisible (${prod.unit}) y no admite decimales.`;
    }
    if (Number.isNaN(cost) || cost < 0) return `El costo unitario para "${name}" debe ser un número mayor o igual a cero.`;
  }
  return null;
}

export function toBatchPayload(items: BatchDraftLine[]): InitialStockItemInput[] {
  return items.map((it) => ({ productId: it.productId, quantity: parseFloat(it.quantity), unitCost: parseFloat(it.unitCost) }));
}
