import { describe, expect, it } from 'vitest';
import { describeDaysLeft, formatLotDate, lotStatus, summarizeLots } from './lotStatus';
import type { StockLot } from './types';

const lot = (over: Partial<StockLot>): StockLot => ({
  id: 'l', productId: 'p', productName: 'Yogur', sku: 'YOG', unit: 'unidad', lotCode: null,
  expiresOn: '2030-01-01', remaining: 1, initial: 1, purchaseNumber: null, daysLeft: 100, ...over,
});

describe('lotStatus', () => {
  it('distingue vencido, por vencer, al día y sin fecha', () => {
    expect(lotStatus({ daysLeft: -1 }, 30)).toBe('expired');
    expect(lotStatus({ daysLeft: 0 }, 30)).toBe('soon');
    expect(lotStatus({ daysLeft: 30 }, 30)).toBe('soon');
    expect(lotStatus({ daysLeft: 31 }, 30)).toBe('ok');
    expect(lotStatus({ daysLeft: null }, 30)).toBe('undated');
  });
});

describe('describeDaysLeft', () => {
  it('arma textos legibles', () => {
    expect(describeDaysLeft(-3)).toBe('Venció hace 3 días');
    expect(describeDaysLeft(-1)).toBe('Venció ayer');
    expect(describeDaysLeft(0)).toBe('Vence hoy');
    expect(describeDaysLeft(1)).toBe('Vence mañana');
    expect(describeDaysLeft(12)).toBe('Vence en 12 días');
    expect(describeDaysLeft(null)).toBe('Sin fecha');
  });
});

describe('summarizeLots', () => {
  it('cuenta vencidos y por vencer, y toma el próximo vencimiento por producto', () => {
    const s = summarizeLots([
      lot({ id: 'a', productId: 'p1', expiresOn: '2026-11-01', daysLeft: -5 }),
      lot({ id: 'b', productId: 'p1', expiresOn: '2026-12-10', daysLeft: 10 }),
      lot({ id: 'c', productId: 'p2', expiresOn: '2027-06-01', daysLeft: 190 }),
      lot({ id: 'd', productId: 'p2', expiresOn: null, daysLeft: null }),
    ], 30);
    expect(s.expiredLots).toBe(1);
    expect(s.soonLots).toBe(1);
    expect([...s.productsWithExpired]).toEqual(['p1']);
    expect(s.nextExpiryByProduct.get('p1')).toBe('2026-11-01');
    expect(s.nextExpiryByProduct.get('p2')).toBe('2027-06-01');
  });
});

describe('formatLotDate', () => {
  it('formatea sin correr el día por zona horaria', () => {
    expect(formatLotDate('2026-12-01')).toBe('01/12/2026');
    expect(formatLotDate(null)).toBe('Sin fecha');
  });
});
