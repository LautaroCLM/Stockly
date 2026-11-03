import type { ActivityEvent, CriticalProduct, KpiCardData, RevenuePoint } from '@/types';
import type { Product, StockMovement } from '@/features/inventario/types';
import { formatCurrency } from '@/lib/formatters';
import { fromHundredths, toHundredths } from '@/lib/decimal';

/** Totales de un día (fecha local de la empresa, formato AAAA-MM-DD), del más viejo al más nuevo. */
export interface DailySales {
  day: string;
  salesTotal: number;
  salesCount: number;
  costTotal: number;
}

export interface DashboardKpis {
  todaySales: KpiCardData;
  cashBalance: KpiCardData;
  itemsToRestock: KpiCardData;
  monthRevenue: KpiCardData;
}

const sumCents = (days: DailySales[], pick: (d: DailySales) => number) =>
  days.reduce((acc, d) => acc + toHundredths(pick(d)), 0);

/** Variación porcentual con casos borde explícitos (sin base de comparación). */
export function percentChange(current: number, previous: number): { change: string; isPositive: boolean } {
  if (previous === 0) {
    return current === 0 ? { change: 'Sin cambios', isPositive: true } : { change: 'Nuevo', isPositive: true };
  }
  const pct = ((current - previous) / previous) * 100;
  const sign = pct > 0 ? '+' : '';
  return { change: `${sign}${pct.toFixed(1).replace('.', ',')}%`, isPositive: pct >= 0 };
}

const NEEDS_RESTOCK: Product['status'][] = ['negative', 'out_of_stock', 'low'];

/** Productos activos en o bajo su stock mínimo (mismo criterio para el dashboard y la alerta). */
export function productsToRestock(products: Product[]): Product[] {
  return products.filter((p) => p.isActive !== false && NEEDS_RESTOCK.includes(p.status));
}

export function buildKpis(days: DailySales[], products: Product[]): DashboardKpis {
  const today = days[days.length - 1];
  const yesterday = days[days.length - 2];

  // Mes en curso contra los mismos días del mes anterior
  const [year, month, dayOfMonth] = (today?.day ?? '0000-00-00').split('-').map(Number);
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const inMonth = (d: DailySales, y: number, m: number, untilDay: number) => {
    const [dy, dm, dd] = d.day.split('-').map(Number);
    return dy === y && dm === m && dd <= untilDay;
  };
  const monthCents = sumCents(days.filter((d) => inMonth(d, year, month, dayOfMonth)), (d) => d.salesTotal);
  const prevMonthCents = sumCents(days.filter((d) => inMonth(d, prevYear, prevMonth, dayOfMonth)), (d) => d.salesTotal);

  // Ticket promedio: últimos 30 días contra los 30 anteriores
  const last30 = days.slice(-30);
  const prev30 = days.slice(-60, -30);
  const avgTicket = (list: DailySales[]) => {
    const count = list.reduce((acc, d) => acc + d.salesCount, 0);
    return count === 0 ? 0 : sumCents(list, (d) => d.salesTotal) / count;
  };
  const ticketCents = Math.round(avgTicket(last30));

  const restock = productsToRestock(products);
  const negativeCount = restock.filter((p) => p.status === 'negative').length;

  return {
    todaySales: {
      title: 'Ventas de hoy',
      value: formatCurrency(today?.salesTotal ?? 0),
      ...percentChange(today?.salesTotal ?? 0, yesterday?.salesTotal ?? 0),
      subtext: '',
      trendLabel: `${today?.salesCount ?? 0} ventas · vs. ayer`,
    },
    cashBalance: {
      title: 'Ticket promedio (30 días)',
      value: formatCurrency(fromHundredths(ticketCents)),
      ...percentChange(avgTicket(last30), avgTicket(prev30)),
      subtext: '',
      trendLabel: 'vs. 30 días previos',
    },
    itemsToRestock: {
      title: 'Productos a reponer',
      value: `${restock.length}`,
      change: negativeCount > 0 ? `${negativeCount} negativos` : restock.length > 0 ? 'Bajo mínimo' : 'Todo en orden',
      isPositive: restock.length === 0,
      subtext: '',
      trendLabel: 'stock en o bajo el mínimo',
      badgeColor: negativeCount > 0 ? 'danger' : restock.length > 0 ? 'warning' : 'success',
    },
    monthRevenue: {
      title: 'Ventas del mes',
      value: formatCurrency(fromHundredths(monthCents)),
      ...percentChange(monthCents, prevMonthCents),
      subtext: '',
      trendLabel: 'vs. mismo período del mes anterior',
    },
  };
}

export function buildRevenueHistory(days: DailySales[]): Record<'7D' | '14D' | '30D', RevenuePoint[]> {
  const toPoints = (list: DailySales[]): RevenuePoint[] =>
    list.map((d) => {
      const [, m, dd] = d.day.split('-');
      return { date: `${dd}/${m}`, ventas: d.salesTotal, costo: d.costTotal };
    });
  return { '7D': toPoints(days.slice(-7)), '14D': toPoints(days.slice(-14)), '30D': toPoints(days.slice(-30)) };
}

const SEVERITY: Record<string, number> = { negative: 0, out_of_stock: 1, low: 2 };

export function buildCriticalStock(products: Product[], limit = 8): CriticalProduct[] {
  return productsToRestock(products)
    .sort((a, b) => SEVERITY[a.status] - SEVERITY[b.status] || a.stock - b.stock)
    .slice(0, limit)
    .map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      category: p.category,
      currentStock: p.stock,
      minStock: p.minStock,
      unitPrice: p.salePrice,
      status: p.status === 'negative' ? 'negative' : p.status === 'out_of_stock' ? 'critical' : 'warning',
    }));
}

const REASON_LABELS: Record<string, string> = {
  initial_load: 'Carga inicial',
  purchase: 'Compra',
  physical_count: 'Conteo físico',
  loss_damage: 'Merma',
  internal_use: 'Consumo interno',
  sale: 'Venta',
  cancellation: 'Anulación de venta',
  purchase_cancellation: 'Anulación de compra',
};

export function timeAgo(isoDate: string, now: Date): string {
  const seconds = Math.round((new Date(isoDate).getTime() - now.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat('es-AR', { numeric: 'auto' });
  const abs = Math.abs(seconds);
  if (abs < 60) return rtf.format(seconds, 'second');
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), 'hour');
  return rtf.format(Math.round(seconds / 86400), 'day');
}

export function buildActivity(movements: StockMovement[], now: Date): ActivityEvent[] {
  return movements.map((m) => ({
    id: m.id,
    type: m.reason === 'sale' ? 'sale' : m.reason === 'purchase' ? 'purchase' : m.direction === 'increase' ? 'stock_in' : 'stock_out',
    description: `${REASON_LABELS[m.reason] ?? m.reason}: ${m.productName}`,
    entity: `${m.direction === 'increase' ? '+' : '-'}${m.quantity} · ${m.createdBy}`,
    timeAgo: timeAgo(m.createdAt, now),
    timestamp: m.createdAt,
  }));
}
