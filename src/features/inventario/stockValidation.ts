import type { InitialStockBatchData, Product, StockAdjustmentData } from './types';

/** Unidades que no admiten cantidades con decimales. */
export const INDIVISIBLE_UNITS = ['unidad', 'bulto', 'par'];

const MANUAL_ADJUSTMENT_REASONS = ['physical_count', 'loss_damage', 'internal_use'];

export function isIndivisibleUnit(unit: string): boolean {
  return INDIVISIBLE_UNITS.includes(unit);
}

/** Valida un ajuste manual antes de enviarlo. Devuelve el mensaje de error o null. */
export function validateStockAdjustment(data: StockAdjustmentData, product: Product | undefined): string | null {
  if (!product) return 'Producto no encontrado en el catálogo.';
  if (!MANUAL_ADJUSTMENT_REASONS.includes(data.reason)) {
    return 'Motivo no admitido para ajuste manual. Solo se admiten: conteo físico, merma/daño o consumo interno.';
  }
  const isPhysicalCount = data.reason === 'physical_count';
  if (isPhysicalCount && data.countedQuantity === undefined) return 'Falta la cantidad contada.';

  const checkedQuantity = isPhysicalCount ? data.countedQuantity ?? 0 : data.quantity;
  if (isIndivisibleUnit(product.unit) && !Number.isInteger(checkedQuantity)) {
    return `La unidad "${product.unit}" es indivisible y no admite cantidades fraccionarias con decimales.`;
  }
  return null;
}

/** Valida un lote de carga inicial antes de enviarlo. Devuelve el mensaje de error o null. */
export function validateInitialStockBatch(data: InitialStockBatchData, products: Product[]): string | null {
  if (!data.items || data.items.length === 0) return 'El lote de carga inicial no puede estar vacío.';

  for (const item of data.items) {
    const prod = products.find((p) => p.id === item.productId);
    if (!prod) return `Producto con identificador ${item.productId} no encontrado en el catálogo.`;
    if (prod.stock !== 0) {
      return `El producto "${prod.name}" ya posee existencias (${prod.stock}). La carga inicial solo admite productos con stock cero. Utilice Ajuste de Stock.`;
    }
    if (isIndivisibleUnit(prod.unit) && !Number.isInteger(item.quantity)) {
      return `El producto "${prod.name}" posee unidad indivisible (${prod.unit}) y no admite cantidades fraccionarias con decimales.`;
    }
    if (item.quantity <= 0) return `La cantidad para "${prod.name}" debe ser mayor a cero.`;
    if (item.unitCost < 0) return `El costo unitario inicial para "${prod.name}" no puede ser negativo.`;
  }
  return null;
}
