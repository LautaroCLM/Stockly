import { describe, expect, it } from 'vitest';
import { describeAdjustment, parseListForm, toListForm, toRoundingStep } from './priceListForm';

const form = (percentText: string, name = 'Mayorista') => ({ name, percentText, roundingStep: 10 as const, isActive: true });

describe('formulario de lista de precios', () => {
  it('acepta coma o punto y signo', () => {
    expect(parseListForm(form('-15'))).toMatchObject({ ok: true, value: { percent: -15 } });
    expect(parseListForm(form('10,5'))).toMatchObject({ ok: true, value: { percent: 10.5 } });
    expect(parseListForm(form('+3.25'))).toMatchObject({ ok: true, value: { percent: 3.25 } });
  });
  it('rechaza porcentajes fuera de rango, mal escritos o sin nombre', () => {
    expect(parseListForm(form('-95')).ok).toBe(false);
    expect(parseListForm(form('abc')).ok).toBe(false);
    expect(parseListForm(form('1,234')).ok).toBe(false);
    expect(parseListForm(form('-10', '  ')).ok).toBe(false);
  });
  it('vuelve a mostrar el porcentaje con coma', () => {
    expect(toListForm({ id: 'l', name: 'X', adjustmentPercent: -12.5, roundingStep: 1, isActive: true }).percentText).toBe('-12,5');
  });
  it('describe el ajuste en palabras', () => {
    expect(describeAdjustment(-15)).toBe('15 % menos que el precio de venta');
    expect(describeAdjustment(10.5)).toBe('10,5 % más que el precio de venta');
    expect(describeAdjustment(0)).toBe('Igual al precio de venta');
  });
  it('un redondeo desconocido cae al centavo', () => {
    expect(toRoundingStep('10.00')).toBe(10);
    expect(toRoundingStep(7)).toBe(0.01);
  });
});
