import { fromHundredths, toHundredths } from '@/lib/decimal';
import type { CommissionEntry, SellerSummary } from './types';

/** Agrupa los movimientos por vendedor y suma en centavos (sin errores de redondeo). */
export function summarizeCommissions(entries: CommissionEntry[]): SellerSummary[] {
  const byEmployee = new Map<string, { s: SellerSummary; cents: { total: number; ded: number; com: number; paid: number } }>();
  for (const e of entries) {
    let acc = byEmployee.get(e.employeeId);
    if (!acc) {
      acc = {
        s: { employeeId: e.employeeId, employeeName: e.employeeName, salesCount: 0, salesTotal: 0, deductions: 0, commission: 0, paid: 0, pending: 0, entries: [] },
        cents: { total: 0, ded: 0, com: 0, paid: 0 },
      };
      byEmployee.set(e.employeeId, acc);
    }
    acc.s.entries.push(e);
    if (e.kind === 'sale') {
      acc.s.salesCount += 1;
      acc.cents.total += toHundredths(e.base);
    } else {
      acc.cents.ded += toHundredths(-e.base);
    }
    acc.cents.com += toHundredths(e.commission);
    if (e.isPaid) acc.cents.paid += toHundredths(e.commission);
  }
  return [...byEmployee.values()]
    .map(({ s, cents }) => ({
      ...s,
      salesTotal: fromHundredths(cents.total),
      deductions: fromHundredths(cents.ded),
      commission: fromHundredths(cents.com),
      paid: fromHundredths(cents.paid),
      pending: fromHundredths(cents.com - cents.paid),
    }))
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName, 'es'));
}

/** Primer y último día del mes de una fecha ISO (YYYY-MM-DD). */
export function monthRange(isoDate: string): { from: string; to: string } {
  const [y, m] = isoDate.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, '0');
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, '0')}` };
}

/** Valida el porcentaje escrito ("3", "2,5"). Devuelve el número, null si está vacío, o un mensaje. */
export function parsePercent(text: string): { ok: true; value: number | null } | { ok: false; message: string } {
  const clean = text.trim().replace(',', '.');
  if (clean === '') return { ok: true, value: null };
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(clean)) return { ok: false, message: 'Escribí el porcentaje con hasta 2 decimales (ej. 3 o 2,5).' };
  const value = Number(clean);
  if (value <= 0 || value > 50) return { ok: false, message: 'La comisión tiene que estar entre 0,01 % y 50 %.' };
  return { ok: true, value };
}
