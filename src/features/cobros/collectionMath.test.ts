import { describe, expect, it } from 'vitest';
import { cashPart, collectionTotal, daysOpen, debtAge, withRunningBalance } from './collectionMath';
import type { StatementEntry } from './types';

const entry = (kind: StatementEntry['kind'], amount: number): StatementEntry => ({
  kind, referenceId: `${kind}-${amount}`, document: 'X', occurredAt: '2026-11-01T10:00:00Z', amount,
});

describe('cobros', () => {
  it('suma las partes sin errores de coma flotante', () => {
    expect(collectionTotal([{ method: 'efectivo', amount: 0.1 }, { method: 'transferencia', amount: 0.2 }])).toBe(0.3);
  });

  it('solo el efectivo cuenta como parte de caja', () => {
    expect(cashPart([{ method: 'efectivo', amount: 50.5 }, { method: 'cheque', amount: 20 }])).toBe(50.5);
    expect(cashPart([{ method: 'transferencia', amount: 10 }])).toBe(0);
  });

  it('calcula el saldo acumulado del estado de cuenta', () => {
    const rows = withRunningBalance([entry('charge', 300.1), entry('charge', 150.2), entry('payment', -100.3)]);
    expect(rows.map((r) => r.balance)).toEqual([300.1, 450.3, 350]);
  });

  it('cuenta los días de la deuda abierta', () => {
    const now = new Date('2026-11-07T12:00:00Z');
    expect(daysOpen('2026-11-01T12:00:00Z', now)).toBe(6);
    expect(daysOpen(null, now)).toBeNull();
  });

  it('clasifica la antigüedad de la deuda', () => {
    expect(debtAge(null)).toBe('recent');
    expect(debtAge(30)).toBe('recent');
    expect(debtAge(31)).toBe('warning');
    expect(debtAge(60)).toBe('warning');
    expect(debtAge(61)).toBe('overdue');
  });
});
