import { fromHundredths, parseHundredths, toHundredths } from '@/lib/decimal';

/** Nombres de los medios de pago que guarda process_sale. */
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  debito: 'Tarjeta de débito',
  credito: 'Tarjeta de crédito',
  cheque: 'Cheque',
};

export function paymentMethodLabel(method: string): string {
  return PAYMENT_METHOD_LABELS[method] ?? method;
}

/**
 * Convierte un importe escrito por el usuario ("1.500,50" no; "1500,50" o "1500.50" sí)
 * a pesos. Devuelve null si no es un importe válido con hasta dos decimales.
 */
export function parseMoneyInput(input: string): number | null {
  const cents = parseHundredths(input);
  return cents === null ? null : fromHundredths(cents);
}

/** Diferencia exacta contado - esperado, sin errores de coma flotante. */
export function cashDifference(counted: number, expected: number): number {
  return fromHundredths(toHundredths(counted) - toHundredths(expected));
}

export type DifferenceKind = 'exact' | 'surplus' | 'shortage';

export function differenceKind(difference: number): DifferenceKind {
  const cents = toHundredths(difference);
  if (cents === 0) return 'exact';
  return cents > 0 ? 'surplus' : 'shortage';
}
