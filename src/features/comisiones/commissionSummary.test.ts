import { describe, expect, it } from 'vitest';
import { monthRange, parsePercent, summarizeCommissions } from './commissionSummary';
import type { CommissionEntry } from './types';

const entry = (over: Partial<CommissionEntry>): CommissionEntry => ({
  employeeId: 'j', employeeName: 'Juan', date: '2026-11-10', kind: 'sale', saleId: 's', saleNumber: 'VTA-1',
  documentNumber: 'VTA-1', base: 1000, percent: 3, commission: 30, isPaid: false, ...over,
});

describe('summarizeCommissions', () => {
  it('suma ventas, resta devoluciones y anulaciones, y separa pagado de pendiente', () => {
    const [juan, ana] = summarizeCommissions([
      entry({ base: 1000, commission: 30, isPaid: true }),
      entry({ base: 2000.1, commission: 200.01 }),
      entry({ kind: 'return', base: -1000, commission: -100 }),
      entry({ employeeId: 'a', employeeName: 'Ana', base: 1000, commission: 50 }),
      entry({ employeeId: 'a', employeeName: 'Ana', kind: 'cancellation', base: -1000, commission: -50 }),
    ]).sort((x) => (x.employeeName === 'Juan' ? -1 : 1));
    expect(juan).toMatchObject({ salesCount: 2, salesTotal: 3000.1, deductions: 1000, commission: 130.01, paid: 30, pending: 100.01 });
    expect(ana).toMatchObject({ salesCount: 1, salesTotal: 1000, deductions: 1000, commission: 0, pending: 0 });
  });

  it('ordena por nombre', () => {
    const list = summarizeCommissions([entry({ employeeId: 'z', employeeName: 'Zoe' }), entry({ employeeId: 'a', employeeName: 'Ana' })]);
    expect(list.map((s) => s.employeeName)).toEqual(['Ana', 'Zoe']);
  });
});

describe('monthRange', () => {
  it('devuelve el mes completo, incluido febrero bisiesto', () => {
    expect(monthRange('2026-11-27')).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(monthRange('2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });
});

describe('parsePercent', () => {
  it('acepta coma, vacío y rechaza fuera de rango', () => {
    expect(parsePercent('2,5')).toEqual({ ok: true, value: 2.5 });
    expect(parsePercent('')).toEqual({ ok: true, value: null });
    expect(parsePercent('0').ok).toBe(false);
    expect(parsePercent('60').ok).toBe(false);
    expect(parsePercent('3.333').ok).toBe(false);
  });
});
