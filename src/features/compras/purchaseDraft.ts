import { fromHundredths, multiplyToCents, toHundredths } from '@/lib/decimal';
import type { Product } from '@/features/inventario/types';
import { isIndivisibleUnit } from '@/features/inventario/stockValidation';
import type { PurchaseDraftItem } from './types';

/** Subtotal exacto (cantidad × costo) redondeado a centavos como round(x, 2) en PostgreSQL. */
export function lineSubtotal(quantity: number, unitCost: number): number {
  if (!(quantity >= 0) || !(unitCost >= 0)) return 0;
  return fromHundredths(multiplyToCents(toHundredths(unitCost), toHundredths(quantity)));
}

export function newDraftItem(product: Product): PurchaseDraftItem {
  const unitCost = product.costPrice && product.costPrice > 0 ? product.costPrice : 0;
  return {
    productId: product.id,
    productName: product.name,
    sku: product.sku,
    unit: product.unit || 'unidad',
    quantity: 1,
    unitCost,
    subtotal: lineSubtotal(1, unitCost),
    tracksExpiry: product.tracksExpiry ?? false,
    expiresOn: '',
    lotCode: '',
  };
}

export function withLot(item: PurchaseDraftItem, lot: { expiresOn?: string; lotCode?: string }): PurchaseDraftItem {
  return { ...item, ...lot };
}

export function withQuantity(item: PurchaseDraftItem, quantity: number): PurchaseDraftItem {
  return { ...item, quantity, subtotal: lineSubtotal(quantity, item.unitCost) };
}

export function withUnitCost(item: PurchaseDraftItem, unitCost: number): PurchaseDraftItem {
  return { ...item, unitCost, subtotal: lineSubtotal(item.quantity, unitCost) };
}

/** Total exacto de la compra (suma en centavos). */
export function draftTotal(items: PurchaseDraftItem[]): number {
  return fromHundredths(items.reduce((acc, item) => acc + toHundredths(item.subtotal), 0));
}

/** Valida la compra antes de enviarla. Devuelve el mensaje de error o null. */
export function validatePurchaseDraft(supplierId: string, items: PurchaseDraftItem[]): string | null {
  if (!supplierId) return 'Debe seleccionar un proveedor activo.';
  if (items.length === 0) return 'Debe agregar al menos un producto a la compra.';
  for (const item of items) {
    if (item.quantity <= 0) return `La cantidad para "${item.productName}" debe ser mayor a 0.`;
    if (isIndivisibleUnit(item.unit.toLowerCase()) && !Number.isInteger(item.quantity)) {
      return `El producto "${item.productName}" se mide en ${item.unit} y no admite cantidades fraccionadas.`;
    }
    if (item.unitCost < 0) return `El costo unitario para "${item.productName}" no puede ser negativo.`;
    if (item.tracksExpiry && !/^\d{4}-\d{2}-\d{2}$/.test(item.expiresOn)) {
      return `Indicá la fecha de vencimiento de "${item.productName}".`;
    }
    if (item.lotCode.trim().length > 50) return `El número de lote de "${item.productName}" no puede superar los 50 caracteres.`;
  }
  return null;
}
