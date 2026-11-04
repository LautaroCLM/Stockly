import { fromHundredths, parseHundredths, toHundredths } from '@/lib/decimal';
import { isIndivisibleUnit } from './stockValidation';
import type { Product, StockMovementDirection, StockMovementReason } from './types';

/** Motivos de ajuste manual que justifican la salida y exigen observación. */
export const REASONS_REQUIRING_NOTES: StockMovementReason[] = ['loss_damage', 'internal_use'];

export interface AdjustmentPreview {
  /** Lo ingresado en centésimas, o null si no es un número válido. */
  inputHundredths: number | null;
  direction: StockMovementDirection;
  deltaQuantity: number;
  projectedStock: number;
}

/**
 * Variación y stock resultante de un ajuste, en centésimas exactas.
 * En el conteo físico la variación es la diferencia entre lo contado y el stock actual.
 */
export function previewAdjustment(
  currentStock: number,
  reason: StockMovementReason,
  direction: StockMovementDirection,
  input: string
): AdjustmentPreview {
  const inputHundredths = parseHundredths(input);
  const current = toHundredths(currentStock);
  let delta: number;
  let effective = direction;

  if (reason === 'physical_count') {
    const diff = (inputHundredths ?? current) - current;
    effective = diff >= 0 ? 'increase' : 'decrease';
    delta = Math.abs(diff);
  } else {
    delta = inputHundredths ?? 0;
  }

  return {
    inputHundredths,
    direction: effective,
    deltaQuantity: fromHundredths(delta),
    projectedStock: fromHundredths(effective === 'increase' ? current + delta : current - delta),
  };
}

/** Valida el formulario de ajuste. Devuelve el mensaje de error o null. */
export function validateAdjustmentForm(
  product: Product,
  reason: StockMovementReason,
  inputHundredths: number | null,
  notes: string
): string | null {
  if (inputHundredths === null) {
    return 'Ingrese un número válido, mayor o igual a cero y con como máximo 2 decimales.';
  }
  if (reason !== 'physical_count' && inputHundredths <= 0) {
    return 'La cantidad debe ser un número positivo mayor a cero.';
  }
  if (isIndivisibleUnit(product.unit.toLowerCase()) && inputHundredths % 100 !== 0) {
    return `La unidad "${product.unit}" es indivisible y no admite cantidades fraccionarias con decimales.`;
  }
  if (REASONS_REQUIRING_NOTES.includes(reason) && !notes.trim()) {
    return 'Para registrar mermas o consumo interno se requiere indicar una justificación en las observaciones.';
  }
  return null;
}
