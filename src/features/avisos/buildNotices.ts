import { fromHundredths, toHundredths } from '@/lib/decimal';
import { formatCurrency } from '@/lib/formatters';
import type { Notice, NoticeSeverity, NoticeSources } from './types';

/** Una deuda con más de este tiempo ya merece un aviso. */
export const DEBT_ALERT_DAYS = 30;
/** Más de este tiempo, el aviso pasa a ser urgente. */
export const DEBT_URGENT_DAYS = 60;
/** Una entrada sin salida con más horas que estas se considera olvidada. */
export const OPEN_ATTENDANCE_HOURS = 12;

const SEVERITY_ORDER: Record<NoticeSeverity, number> = { danger: 0, warning: 1, info: 2 };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const daysSince = (iso: string | null, now: Date): number | null => {
  if (!iso) return null;
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000));
};

const startOfDay = (now: Date) => new Date(now.getFullYear(), now.getMonth(), now.getDate());

/** Primeros nombres de una lista, con "y N más" si hay más. */
const names = (list: string[], max = 3): string => {
  const shown = list.slice(0, max).join(', ');
  return list.length > max ? `${shown} y ${list.length - max} más` : shown;
};

function restockNotice(sources: NoticeSources): Notice | null {
  const items = sources.restock;
  if (items.length === 0) return null;
  const empty = items.filter((p) => p.stock <= 0).length;
  return {
    id: 'restock',
    severity: empty > 0 ? 'danger' : 'warning',
    title: `${plural(items.length, 'producto', 'productos')} para reponer`,
    detail: `${empty > 0 ? `${plural(empty, 'sin stock', 'sin stock')}. ` : ''}${names(items.map((p) => p.name))}.`,
    route: 'inventario',
  };
}

function debtNotice(
  id: string, debts: NonNullable<NoticeSources['customerDebts']>, now: Date,
  texts: { who: (n: number) => string; verb: string }, route: Notice['route']
): Notice | null {
  const overdue = debts.filter((d) => d.balance > 0 && (daysSince(d.oldestOpenSince, now) ?? 0) > DEBT_ALERT_DAYS);
  if (overdue.length === 0) return null;
  const totalCents = overdue.reduce((sum, d) => sum + toHundredths(d.balance), 0);
  const urgent = overdue.some((d) => (daysSince(d.oldestOpenSince, now) ?? 0) > DEBT_URGENT_DAYS);
  return {
    id,
    severity: urgent ? 'danger' : 'warning',
    title: `${texts.who(overdue.length)} con deuda de más de ${DEBT_ALERT_DAYS} días`,
    detail: `${texts.verb} ${formatCurrency(fromHundredths(totalCents))}: ${names(overdue.map((d) => d.name))}.`,
    route,
  };
}

function attendanceNotice(sources: NoticeSources, now: Date): Notice | null {
  const forgotten = (sources.openAttendance ?? []).filter(
    (a) => now.getTime() - new Date(a.checkIn).getTime() > OPEN_ATTENDANCE_HOURS * 3_600_000
  );
  if (forgotten.length === 0) return null;
  return {
    id: 'attendance',
    severity: 'warning',
    title: `${plural(forgotten.length, 'entrada', 'entradas')} sin salida`,
    detail: `Se marcó la entrada hace más de ${OPEN_ATTENDANCE_HOURS} horas y falta la salida: ${names(forgotten.map((a) => a.employeeName))}.`,
    route: sources.attendanceRoute,
  };
}

function cashNotice(sources: NoticeSources, now: Date): Notice | null {
  if (!sources.openCashSince) return null;
  if (new Date(sources.openCashSince) >= startOfDay(now)) return null;
  return {
    id: 'cash',
    severity: 'warning',
    title: 'La caja sigue abierta de un día anterior',
    detail: 'Conviene hacer el arqueo y cerrarla antes de seguir con la caja de hoy.',
    route: 'caja',
  };
}

/** Avisos a mostrar en la campana, de lo más urgente a lo menos. Solo usa las fuentes disponibles. */
export function buildNotices(sources: NoticeSources, now: Date = new Date()): Notice[] {
  const notices: (Notice | null)[] = [
    restockNotice(sources),
    sources.customerDebts
      ? debtNotice('customer-debts', sources.customerDebts, now, { who: (n) => plural(n, 'cliente', 'clientes'), verb: 'Te deben' }, 'cobros-pagos')
      : null,
    sources.supplierDebts
      ? debtNotice('supplier-debts', sources.supplierDebts, now, { who: (n) => plural(n, 'proveedor', 'proveedores'), verb: 'Les debés' }, 'cobros-pagos')
      : null,
    attendanceNotice(sources, now),
    cashNotice(sources, now),
  ];
  return notices
    .filter((n): n is Notice => n !== null)
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
