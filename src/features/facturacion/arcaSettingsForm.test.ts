import { describe, expect, it } from 'vitest';
import { formatArcaPointOfSale, parseArcaForm, todayIso, toArcaFormValues } from './arcaSettingsForm';

const TODAY = '2026-11-26';
const form = (pointOfSale = '', activityStartDate = '', grossIncomeNumber = '') => ({
  pointOfSale, activityStartDate, grossIncomeNumber,
});

describe('parseArcaForm', () => {
  it('acepta todo vacío (se completa más adelante)', () => {
    expect(parseArcaForm(form(), TODAY)).toEqual({
      ok: true, value: { pointOfSale: null, activityStartDate: '', grossIncomeNumber: '' },
    });
  });
  it('convierte y limpia los valores', () => {
    expect(parseArcaForm(form(' 3 ', '2015-04-01', ' 901-123456-7 '), TODAY)).toEqual({
      ok: true, value: { pointOfSale: 3, activityStartDate: '2015-04-01', grossIncomeNumber: '901-123456-7' },
    });
  });
  it('rechaza un punto de venta fuera de rango o con letras', () => {
    expect(parseArcaForm(form('0'), TODAY).ok).toBe(false);
    expect(parseArcaForm(form('99999'), TODAY).ok).toBe(false);
    expect(parseArcaForm(form('3a'), TODAY).ok).toBe(false);
    expect(parseArcaForm(form('1.5'), TODAY).ok).toBe(false);
  });
  it('rechaza una fecha de inicio futura', () => {
    expect(parseArcaForm(form('', '2026-11-27'), TODAY).ok).toBe(false);
    expect(parseArcaForm(form('', TODAY), TODAY).ok).toBe(true);
  });
  it('rechaza ingresos brutos de más de 30 caracteres', () => {
    expect(parseArcaForm(form('', '', 'x'.repeat(31)), TODAY).ok).toBe(false);
  });
});

describe('formato', () => {
  it('muestra el punto de venta con 5 dígitos', () => {
    expect(formatArcaPointOfSale(3)).toBe('00003');
    expect(formatArcaPointOfSale(null)).toBe('');
  });
  it('arma los valores del formulario desde lo guardado', () => {
    expect(toArcaFormValues({ pointOfSale: 12, activityStartDate: '2020-01-02', grossIncomeNumber: '' }))
      .toEqual({ pointOfSale: '12', activityStartDate: '2020-01-02', grossIncomeNumber: '' });
  });
  it('usa la fecha local, no UTC', () => {
    expect(todayIso(new Date(2026, 10, 26, 23, 30))).toBe('2026-11-26');
  });
});
