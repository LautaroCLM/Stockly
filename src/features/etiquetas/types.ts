import type { Product } from '@/features/inventario/types';

/** Lo que lleva una etiqueta de góndola. */
export interface LabelData {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  price: number;
  unit: string;
}

export const labelFromProduct = (p: Product): LabelData => ({
  id: p.id, name: p.name, sku: p.sku, barcode: p.barcode, price: p.salePrice, unit: p.unit,
});

/** El código que va en barras: el de barras del producto o, si no tiene, su SKU. */
export const labelCode = (l: LabelData): string => (l.barcode.trim() || l.sku.trim());
