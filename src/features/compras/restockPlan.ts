import { formatNumber } from '@/lib/formatters';
import type { Product } from '@/features/inventario/types';
import { isIndivisibleUnit } from '@/features/inventario/stockValidation';
import type { Supplier } from '@/features/proveedores/types';

/** Se repone hasta el doble del mínimo: deja margen para no volver a quedar bajo enseguida. */
export const RESTOCK_TARGET_FACTOR = 2;

export interface RestockItem {
  product: Product;
  /** Cantidad sugerida para llegar al stock deseado. */
  suggested: number;
}

export interface RestockGroup {
  /** null: productos sin proveedor cargado. */
  supplier: Supplier | null;
  items: RestockItem[];
}

/** Necesita reponer: activo, con mínimo cargado y con stock en el mínimo o por debajo. */
export const needsRestock = (p: Product): boolean => p.isActive !== false && p.minStock > 0 && p.stock <= p.minStock;

/** Cuánto pedir para llegar a RESTOCK_TARGET_FACTOR × mínimo (entero si la unidad no se fracciona). */
export function suggestedQuantity(p: Product): number {
  const missing = RESTOCK_TARGET_FACTOR * p.minStock - p.stock;
  const rounded = isIndivisibleUnit(p.unit) ? Math.ceil(missing) : Math.ceil(missing * 100) / 100;
  return Math.max(rounded, isIndivisibleUnit(p.unit) ? 1 : 0.01);
}

/** Productos para reponer agrupados por proveedor (por nombre); los que no tienen proveedor van al final. */
export function buildRestockPlan(products: readonly Product[], suppliers: readonly Supplier[]): RestockGroup[] {
  const byId = new Map(suppliers.map((s) => [s.id, s]));
  const groups = new Map<string, RestockGroup>();
  for (const product of products.filter(needsRestock)) {
    const supplier = (product.supplierId && byId.get(product.supplierId)) || null;
    const key = supplier?.id ?? '';
    const group = groups.get(key) ?? { supplier, items: [] };
    group.items.push({ product, suggested: suggestedQuantity(product) });
    groups.set(key, group);
  }
  const list = [...groups.values()];
  list.forEach((g) => g.items.sort((a, b) => a.product.name.localeCompare(b.product.name, 'es')));
  return list.sort((a, b) => {
    if (!a.supplier) return 1;
    if (!b.supplier) return -1;
    return a.supplier.name.localeCompare(b.supplier.name, 'es');
  });
}

/** Mensaje de pedido para el proveedor (WhatsApp). */
export function buildSupplierOrderMessage(companyName: string, supplier: Supplier | null, lines: { product: Product; quantity: number }[]): string {
  const greeting = supplier?.contactName ? `Hola ${supplier.contactName}, ¿cómo estás?` : 'Hola, ¿cómo estás?';
  const items = lines.map(({ product, quantity }) => {
    const code = product.sku ? ` (${product.sku})` : '';
    return `• ${formatNumber(quantity)} ${product.unit} — ${product.name}${code}`;
  });
  return [greeting, `Te paso el pedido de *${companyName}*:`, '', ...items, '', '¿Me confirmás disponibilidad y precio? ¡Gracias!'].join('\n');
}
