import { describe, expect, it } from 'vitest';
import type { Product, StockMovement } from '@/features/inventario/types';
import {
  buildActivity,
  buildCriticalStock,
  buildKpis,
  buildRevenueHistory,
  percentChange,
  timeAgo,
  type DailySales,
} from './dashboardMetrics';

function product(overrides: Partial<Product>): Product {
  return {
    id: 'p',
    sku: 'SKU',
    barcode: '',
    name: 'Producto',
    category: 'General',
    salePrice: 100,
    costPrice: null,
    stock: 10,
    minStock: 2,
    unit: 'unidad',
    status: 'normal',
    isActive: true,
    ...overrides,
  } as Product;
}

/** Serie diaria terminando en lastDay, con el total indicado por fecha. */
function series(lastDay: string, count: number, totals: Record<string, [number, number]>): DailySales[] {
  const end = new Date(`${lastDay}T12:00:00Z`);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(end);
    d.setUTCDate(end.getUTCDate() - (count - 1 - i));
    const day = d.toISOString().slice(0, 10);
    const [salesTotal, salesCount] = totals[day] ?? [0, 0];
    return { day, salesTotal, salesCount, costTotal: 0 };
  });
}

describe('percentChange', () => {
  it('calcula la variación con coma decimal', () => {
    expect(percentChange(150, 100)).toEqual({ change: '+50,0%', isPositive: true });
    expect(percentChange(50, 100)).toEqual({ change: '-50,0%', isPositive: false });
  });

  it('maneja la falta de base de comparación', () => {
    expect(percentChange(0, 0)).toEqual({ change: 'Sin cambios', isPositive: true });
    expect(percentChange(10, 0)).toEqual({ change: 'Nuevo', isPositive: true });
  });
});

describe('buildKpis', () => {
  const days = series('2026-11-03', 62, {
    '2026-11-03': [150.5, 2],
    '2026-11-02': [100, 1],
    '2026-11-01': [49.5, 1],
    '2026-10-02': [100, 1],
    '2026-10-05': [999, 1],
  });

  it('compara hoy contra ayer', () => {
    const kpis = buildKpis(days, []);
    expect(kpis.todaySales.value).toContain('150,50');
    expect(kpis.todaySales.change).toBe('+50,5%');
    expect(kpis.todaySales.trendLabel).toBe('2 ventas · vs. ayer');
  });

  it('compara el mes en curso con los mismos días del mes anterior', () => {
    const kpis = buildKpis(days, []);
    // Noviembre 1 a 3 = 300; octubre 1 a 3 = 100 (el 5/10 queda afuera)
    expect(kpis.monthRevenue.value).toContain('300,00');
    expect(kpis.monthRevenue.change).toBe('+200,0%');
  });

  it('cuenta los productos activos a reponer y marca los negativos', () => {
    const kpis = buildKpis(days, [
      product({ id: 'a', status: 'negative' }),
      product({ id: 'b', status: 'low' }),
      product({ id: 'c', status: 'normal' }),
      product({ id: 'd', status: 'out_of_stock', isActive: false }),
    ]);
    expect(kpis.itemsToRestock.value).toBe('2');
    expect(kpis.itemsToRestock.change).toBe('1 negativos');
    expect(kpis.itemsToRestock.badgeColor).toBe('danger');
  });
});

describe('buildRevenueHistory', () => {
  it('arma las series de 7, 14 y 30 días con fecha dd/MM', () => {
    const history = buildRevenueHistory(series('2026-11-03', 62, {}));
    expect(history['7D']).toHaveLength(7);
    expect(history['30D']).toHaveLength(30);
    expect(history['7D'][6].date).toBe('03/11');
  });
});

describe('buildCriticalStock', () => {
  it('ordena por gravedad y excluye inactivos', () => {
    const result = buildCriticalStock([
      product({ id: 'low', status: 'low', stock: 1 }),
      product({ id: 'neg', status: 'negative', stock: -3 }),
      product({ id: 'out', status: 'out_of_stock', stock: 0 }),
      product({ id: 'off', status: 'negative', stock: -9, isActive: false }),
      product({ id: 'ok', status: 'normal' }),
    ]);
    expect(result.map((p) => [p.id, p.status])).toEqual([
      ['neg', 'negative'],
      ['out', 'critical'],
      ['low', 'warning'],
    ]);
  });
});

describe('buildActivity', () => {
  it('describe cada movimiento con tiempo relativo', () => {
    const now = new Date('2026-11-03T15:00:00Z');
    const movement = {
      id: 'm1',
      reason: 'sale',
      direction: 'decrease',
      quantity: 3,
      productName: 'Tornillo',
      createdBy: 'Ana',
      createdAt: '2026-11-03T14:55:00Z',
    } as StockMovement;
    const [event] = buildActivity([movement], now);
    expect(event.type).toBe('sale');
    expect(event.description).toBe('Venta: Tornillo');
    expect(event.entity).toBe('-3 · Ana');
    expect(event.timeAgo).toBe(timeAgo('2026-11-03T14:55:00Z', now));
  });
});
