/** Redondeos permitidos (los mismos del cambio masivo de precios). */
export const ROUNDING_STEPS = [0.01, 1, 10, 50, 100] as const;
export type RoundingStep = (typeof ROUNDING_STEPS)[number];

export const ROUNDING_LABELS: Record<RoundingStep, string> = {
  0.01: 'Al centavo',
  1: 'A $1',
  10: 'A $10',
  50: 'A $50',
  100: 'A $100',
};

export interface PriceList {
  id: string;
  name: string;
  /** Porcentaje sobre el precio de venta (negativo = descuento). */
  adjustmentPercent: number;
  roundingStep: RoundingStep;
  isActive: boolean;
}

/** Precio de un producto en una lista; isFixed = precio fijado a mano (excepción). */
export interface ListPrice {
  price: number;
  isFixed: boolean;
}

export interface PriceListFormValues {
  name: string;
  /** Texto tal como se escribe ("-15", "10,5"). */
  percentText: string;
  roundingStep: RoundingStep;
  isActive: boolean;
}

export type ListActionResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; value: T })
  | { ok: false; message: string };
