/** Múltiplos a los que se pueden redondear los precios nuevos. */
export const ROUNDING_STEPS = [0.01, 1, 10, 50, 100] as const;
export type RoundingStep = (typeof ROUNDING_STEPS)[number];

export const ROUNDING_LABELS: Record<RoundingStep, string> = {
  0.01: 'Sin redondeo (centavos)',
  1: 'Al peso',
  10: 'A múltiplos de $10',
  50: 'A múltiplos de $50',
  100: 'A múltiplos de $100',
};

/** Qué cambio se pide: porcentaje (negativo = baja), redondeo y a qué productos. */
export interface PriceChangeParams {
  percent: number;
  step: RoundingStep;
  /** Vacío = todas las categorías. */
  categoryIds: string[];
  /** Vacío = todos los proveedores. */
  supplierIds: string[];
}

/** Un producto de la vista previa: precio actual y precio que tendría. */
export interface PreviewRow {
  productId: string;
  sku: string;
  name: string;
  categoryId: string | null;
  supplierId: string | null;
  oldPrice: number;
  newPrice: number;
}

export interface PriceBatch {
  id: string;
  percent: number;
  roundingStep: number;
  categoryIds: string[];
  supplierIds: string[];
  note: string | null;
  itemsCount: number;
  status: 'applied' | 'reverted';
  revertedItems: number | null;
  createdAt: string;
  revertedAt: string | null;
}

export type PriceResult<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; message: string; uncertain?: boolean };

export interface AppliedChange {
  updated: number;
  duplicate: boolean;
}

export interface RevertedChange {
  reverted: number;
  skipped: number;
}
