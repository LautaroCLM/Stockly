import { fromHundredths, toHundredths } from '@/lib/decimal';
import type { DateRange, FinancialSummary, PeriodKey } from './types';

const DAY_MS = 86_400_000;

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: 'Hoy',
  '7d': 'Últimos 7 días',
  '30d': 'Últimos 30 días',
  month: 'Este mes',
  'prev-month': 'Mes anterior',
};

// Las fechas se manejan como texto AAAA-MM-DD y se operan en UTC: así el horario de verano
// del dispositivo no corre un día.
const toMs = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const toIso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** Rango de fechas de cada período, tomando `today` (AAAA-MM-DD) como el día de hoy. */
export function periodRange(key: PeriodKey, today: string): DateRange {
  const todayMs = toMs(today);
  switch (key) {
    case 'today':
      return { from: today, to: today };
    case '7d':
      return { from: toIso(todayMs - 6 * DAY_MS), to: today };
    case '30d':
      return { from: toIso(todayMs - 29 * DAY_MS), to: today };
    case 'month':
      return { from: `${today.slice(0, 8)}01`, to: today };
    case 'prev-month': {
      const [y, m] = today.split('-').map(Number);
      return { from: toIso(Date.UTC(y, m - 2, 1)), to: toIso(Date.UTC(y, m - 1, 1) - DAY_MS) };
    }
  }
}

/** Período inmediatamente anterior y de igual duración, para comparar. */
export function previousRange(range: DateRange): DateRange {
  const days = Math.round((toMs(range.to) - toMs(range.from)) / DAY_MS) + 1;
  const to = toMs(range.from) - DAY_MS;
  return { from: toIso(to - (days - 1) * DAY_MS), to: toIso(to) };
}

/** Ganancia bruta = vendido - costo de la mercadería vendida (sin gastos). */
export function grossProfit(summary: FinancialSummary): number {
  return fromHundredths(toHundredths(summary.salesTotal) - toHundredths(summary.cogsTotal));
}

/** Margen bruto sobre lo vendido, en %; null si no hubo ventas. */
export function grossMarginPercent(summary: FinancialSummary): number | null {
  const sales = toHundredths(summary.salesTotal);
  if (sales <= 0) return null;
  return ((sales - toHundredths(summary.cogsTotal)) / sales) * 100;
}

/** Variación porcentual contra el período anterior; null si antes no había nada con qué comparar. */
export function deltaPercent(current: number, previous: number): number | null {
  const prev = toHundredths(previous);
  if (prev === 0) return null;
  return ((toHundredths(current) - prev) / Math.abs(prev)) * 100;
}

/** Ticket promedio de las ventas completadas; null si no hubo ventas. */
export function averageTicket(summary: FinancialSummary): number | null {
  if (summary.salesCount <= 0) return null;
  return fromHundredths(Math.round(toHundredths(summary.salesTotal) / summary.salesCount));
}
