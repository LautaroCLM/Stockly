import { fromHundredths, toHundredths } from '@/lib/decimal';
import { formatCurrency } from '@/lib/formatters';
import type { PaymentEntry, PaymentMethod } from './types';

/**
 * Cálculos del cobro en centavos: el servidor exige que la suma de pagos sea exactamente
 * el total de la venta, así que nada se compara con decimales de coma flotante.
 */
export function singlePaymentSummary(total: number, method: PaymentMethod, cashReceivedInput: string) {
  const totalCents = toHundredths(total);
  const receivedCents = toHundredths(parseFloat(cashReceivedInput) || 0);
  const isCash = method === 'efectivo';
  return {
    cashReceived: fromHundredths(receivedCents),
    cashChange: isCash ? fromHundredths(Math.max(0, receivedCents - totalCents)) : 0,
    missing: isCash ? fromHundredths(Math.max(0, totalCents - receivedCents)) : 0,
    cashInsufficient: isCash && receivedCents < totalCents,
  };
}

export function splitPaymentSummary(total: number, splits: PaymentEntry[]) {
  const totalCents = toHundredths(total);
  const assignedCents = splits.reduce((sum, s) => sum + toHundredths(Number(s.amount) || 0), 0);
  return {
    assigned: fromHundredths(assignedCents),
    /** Positivo: falta cubrir; negativo: excede. */
    difference: fromHundredths(totalCents - assignedCents),
    remaining: fromHundredths(Math.max(0, totalCents - assignedCents)),
    isExact: assignedCents === totalCents,
  };
}

export type PaymentsResult = { ok: true; payments: PaymentEntry[] } | { ok: false; error: string };

export function buildSinglePayment(total: number, method: PaymentMethod, cashReceivedInput: string): PaymentsResult {
  const summary = singlePaymentSummary(total, method, cashReceivedInput);
  if (summary.cashInsufficient) return { ok: false, error: 'El efectivo entregado es menor al total a pagar.' };
  const isCash = method === 'efectivo';
  return {
    ok: true,
    payments: [
      {
        id: 'pay-single-1',
        method,
        amount: total,
        cashReceived: isCash ? summary.cashReceived : undefined,
        cashChange: isCash ? summary.cashChange : undefined,
      },
    ],
  };
}

export function buildSplitPayments(total: number, splits: PaymentEntry[]): PaymentsResult {
  const summary = splitPaymentSummary(total, splits);
  if (!summary.isExact) {
    return {
      ok: false,
      error:
        summary.difference > 0
          ? `Resta cubrir ${formatCurrency(summary.difference)} para completar el total.`
          : `La suma de pagos excede el total por ${formatCurrency(Math.abs(summary.difference))}.`,
    };
  }
  if (splits.some((s) => isNaN(s.amount) || s.amount <= 0)) {
    return { ok: false, error: 'Todos los medios de pago deben tener un importe mayor a cero.' };
  }
  // Cada importe normalizado a 2 decimales exactos antes de enviarlo
  return { ok: true, payments: splits.map((s) => ({ ...s, amount: fromHundredths(toHundredths(s.amount)) })) };
}
