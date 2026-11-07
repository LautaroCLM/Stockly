import { describe, expect, it } from 'vitest';
import { averageTicket, deltaPercent, grossMarginPercent, grossProfit, operatingResult, periodRange, previousRange } from './financeMath';
import type { FinancialSummary } from './types';

const summary = (overrides: Partial<FinancialSummary> = {}): FinancialSummary => ({
  salesTotal: 150,
  salesCount: 2,
  cancelledTotal: 0,
  cancelledCount: 0,
  cogsTotal: 40,
  purchasesTotal: 0,
  purchasesCount: 0,
  paymentsByMethod: {},
  inventoryValue: 0,
  expensesTotal: 0,
  expensesCount: 0,
  expensesByCategory: {},
  creditSalesTotal: 0,
  collectionsTotal: 0,
  receivableTotal: 0,
  ...overrides,
});

describe('períodos', () => {
  it('calcula los rangos a partir de hoy', () => {
    expect(periodRange('today', '2026-11-07')).toEqual({ from: '2026-11-07', to: '2026-11-07' });
    expect(periodRange('7d', '2026-11-07')).toEqual({ from: '2026-11-01', to: '2026-11-07' });
    expect(periodRange('30d', '2026-11-07')).toEqual({ from: '2026-10-09', to: '2026-11-07' });
    expect(periodRange('month', '2026-11-07')).toEqual({ from: '2026-11-01', to: '2026-11-07' });
  });

  it('el mes anterior cubre el mes completo, incluso cruzando de año', () => {
    expect(periodRange('prev-month', '2026-11-07')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(periodRange('prev-month', '2026-01-15')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(periodRange('prev-month', '2026-03-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });

  it('el período anterior tiene la misma duración y termina el día previo', () => {
    expect(previousRange({ from: '2026-11-01', to: '2026-11-07' })).toEqual({ from: '2026-10-25', to: '2026-10-31' });
    expect(previousRange({ from: '2026-11-07', to: '2026-11-07' })).toEqual({ from: '2026-11-06', to: '2026-11-06' });
  });
});

describe('cálculos de dinero', () => {
  it('ganancia bruta y margen, sin errores de coma flotante', () => {
    expect(grossProfit(summary())).toBe(110);
    expect(grossMarginPercent(summary())).toBeCloseTo(73.33, 2);
    expect(grossProfit(summary({ salesTotal: 0.3, cogsTotal: 0.1 + 0.2 }))).toBe(0);
  });

  it('sin ventas no hay margen ni ticket promedio', () => {
    expect(grossMarginPercent(summary({ salesTotal: 0, salesCount: 0 }))).toBeNull();
    expect(averageTicket(summary({ salesTotal: 0, salesCount: 0 }))).toBeNull();
    expect(averageTicket(summary())).toBe(75);
  });

  it('la variación es null si el período anterior no tiene datos', () => {
    expect(deltaPercent(150, 100)).toBe(50);
    expect(deltaPercent(50, 100)).toBe(-50);
    expect(deltaPercent(150, 0)).toBeNull();
  });
});

describe('operatingResult', () => {
  it('resta los gastos de la ganancia bruta en centavos exactos', () => {
    expect(operatingResult(summary({ salesTotal: 100.3, cogsTotal: 40.1, expensesTotal: 20.2 }))).toBe(40);
  });

  it('puede ser negativo', () => {
    expect(operatingResult(summary({ salesTotal: 10, cogsTotal: 5, expensesTotal: 8 }))).toBe(-3);
  });
});
