import { fromHundredths, parseHundredths, toHundredths } from '@/lib/decimal';
import type { CashSummary } from './types';

export { PAYMENT_METHOD_LABELS, paymentMethodLabel } from '@/features/inventario/paymentMethods';

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

export interface ExpectedLine {
  label: string;
  amount: number;
  sign: '+' | '-' | '';
  hint?: string;
}

/** Cómo se llega al efectivo esperado del turno, línea por línea (fondo, ventas, devoluciones, ingresos y retiros). */
export function expectedBreakdown(summary: CashSummary): ExpectedLine[] {
  return [
    { label: 'Fondo inicial', amount: summary.openingAmount, sign: '' },
    {
      label: 'Ventas cobradas en efectivo',
      amount: summary.cashSalesAmount,
      sign: '+',
      hint: summary.completedSalesCount === null ? undefined : `${summary.completedSalesCount} ventas completadas en el turno`,
    },
    { label: 'Devoluciones (anulaciones y parciales)', amount: summary.cashRefundsAmount, sign: '-' },
    { label: 'Ingresos de efectivo', amount: summary.cashInAmount, sign: '+' },
    { label: 'Retiros de efectivo', amount: summary.cashOutAmount, sign: '-' },
  ];
}
