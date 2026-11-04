import { describe, expect, it } from 'vitest';
import { cashDifference, differenceKind, parseMoneyInput, paymentMethodLabel } from './cashMath';

describe('parseMoneyInput', () => {
  it('acepta coma o punto decimal y hasta dos decimales', () => {
    expect(parseMoneyInput('1500,50')).toBe(1500.5);
    expect(parseMoneyInput('1500.5')).toBe(1500.5);
    expect(parseMoneyInput('0')).toBe(0);
  });

  it('rechaza negativos, texto y más de dos decimales', () => {
    expect(parseMoneyInput('-10')).toBeNull();
    expect(parseMoneyInput('abc')).toBeNull();
    expect(parseMoneyInput('10,555')).toBeNull();
    expect(parseMoneyInput('')).toBeNull();
  });
});

describe('cashDifference', () => {
  it('calcula sin errores de coma flotante', () => {
    expect(cashDifference(0.3, 0.1 + 0.2)).toBe(0);
    expect(cashDifference(990, 1000)).toBe(-10);
    expect(cashDifference(1420.6, 1420.5)).toBe(0.1);
  });
});

describe('differenceKind', () => {
  it('clasifica sobrante, faltante y exacto', () => {
    expect(differenceKind(0)).toBe('exact');
    expect(differenceKind(5.25)).toBe('surplus');
    expect(differenceKind(-0.01)).toBe('shortage');
  });
});

describe('paymentMethodLabel', () => {
  it('traduce los medios conocidos', () => {
    expect(paymentMethodLabel('transferencia')).toBe('Transferencia');
    expect(paymentMethodLabel('otro')).toBe('otro');
  });
});
