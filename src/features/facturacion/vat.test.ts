import { describe, expect, it } from 'vitest';
import {
  customerVatConditionError,
  formatVatRate,
  invoiceLettersFor,
  issuerUsesVatRates,
  toCustomerVatCondition,
  toVatRate,
} from './vat';

describe('toVatRate', () => {
  it('lee el numeric de la base como texto o número', () => {
    expect(toVatRate('10.50')).toBe(10.5);
    expect(toVatRate(27)).toBe(27);
    expect(toVatRate('0.00')).toBe(0);
  });
  it('usa 21 % ante un valor que ARCA no acepta', () => {
    expect(toVatRate('19')).toBe(21);
    expect(toVatRate(null)).toBe(21);
  });
});

describe('formatVatRate', () => {
  it('usa coma decimal (es-AR)', () => {
    expect(formatVatRate(10.5)).toBe('10,5 %');
    expect(formatVatRate(21)).toBe('21 %');
  });
});

describe('toCustomerVatCondition', () => {
  it('acepta las condiciones conocidas y cae en consumidor final', () => {
    expect(toCustomerVatCondition('monotributo')).toBe('monotributo');
    expect(toCustomerVatCondition('otra')).toBe('consumidor_final');
  });
});

describe('customerVatConditionError', () => {
  it('exige CUIT para un Responsable Inscripto', () => {
    expect(customerVatConditionError('responsable_inscripto', 'DNI', '30111222')).not.toBeNull();
    expect(customerVatConditionError('responsable_inscripto', 'CUIT', ' ')).not.toBeNull();
    expect(customerVatConditionError('responsable_inscripto', 'CUIT', '20-32964233-0')).toBeNull();
  });
  it('no exige nada al resto', () => {
    expect(customerVatConditionError('consumidor_final', 'DNI', '')).toBeNull();
    expect(customerVatConditionError('monotributo', 'DNI', '30111222')).toBeNull();
  });
});

describe('letras de factura por emisor', () => {
  it('Responsable Inscripto emite A y B y discrimina IVA', () => {
    expect(invoiceLettersFor('responsable_inscripto')).toEqual(['A', 'B']);
    expect(issuerUsesVatRates('responsable_inscripto')).toBe(true);
  });
  it('Monotributo y Exento emiten C sin discriminar IVA', () => {
    expect(invoiceLettersFor('monotributo')).toEqual(['C']);
    expect(invoiceLettersFor('exento')).toEqual(['C']);
    expect(issuerUsesVatRates('monotributo')).toBe(false);
  });
  it('No Responsable no emite factura electrónica', () => {
    expect(invoiceLettersFor('no_responsable')).toEqual([]);
  });
});
