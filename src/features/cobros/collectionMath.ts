import { fromHundredths, toHundredths } from '@/lib/decimal';
import type { CollectionPart, StatementEntry } from './types';

/** Suma exacta (en centavos) de las partes de un cobro. */
export function collectionTotal(parts: CollectionPart[]): number {
  return fromHundredths(parts.reduce((sum, p) => sum + toHundredths(p.amount), 0));
}

/** Parte en efectivo del cobro: lo único que puede ingresar a la caja. */
export function cashPart(parts: CollectionPart[]): number {
  return collectionTotal(parts.filter((p) => p.method === 'efectivo'));
}

/** Estado de cuenta con el saldo acumulado después de cada movimiento. */
export function withRunningBalance(entries: StatementEntry[]): { entry: StatementEntry; balance: number }[] {
  let cents = 0;
  return entries.map((entry) => {
    cents += toHundredths(entry.amount);
    return { entry, balance: fromHundredths(cents) };
  });
}

/** Días que lleva abierta la deuda más antigua; null si no hay deuda. */
export function daysOpen(oldestOpenSince: string | null, now: Date = new Date()): number | null {
  if (!oldestOpenSince) return null;
  const diff = now.getTime() - new Date(oldestOpenSince).getTime();
  return Math.max(0, Math.floor(diff / 86_400_000));
}

export type DebtAge = 'recent' | 'warning' | 'overdue';

/** Hasta 30 días: reciente. De 31 a 60: atención. Más de 60: vencida. */
export function debtAge(days: number | null): DebtAge {
  if (days === null || days <= 30) return 'recent';
  return days <= 60 ? 'warning' : 'overdue';
}
