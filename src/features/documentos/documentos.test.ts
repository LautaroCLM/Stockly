import { describe, expect, it } from 'vitest';
import { buildPayload, emptyForm, newItem, validateDocument } from './documentForm';
import { computeTotals, formatDocumentNumber, lineCents, warrantyEndDate } from './documentMath';
import type { DocumentFormValues } from './types';

const withItem = (type: DocumentFormValues['type'], patch: Partial<DocumentFormValues> = {}): DocumentFormValues => {
  const base = emptyForm(type, '2026-11-10');
  return { ...base, customerName: 'Juan Pérez', items: [{ ...newItem(), description: 'Cubierta', quantity: '2', unitPrice: '1500,50' }], ...patch };
};

describe('formatDocumentNumber', () => {
  it('usa punto de venta de 4 dígitos y número de 8', () => {
    expect(formatDocumentNumber(1, 123)).toBe('0001-00000123');
    expect(formatDocumentNumber(12, 5)).toBe('0012-00000005');
  });
});

describe('importes', () => {
  it('multiplica cantidad por precio sin errores de coma flotante', () => {
    expect(lineCents({ quantity: '3', unitPrice: '0,10' })).toBe(30);
    expect(lineCents({ quantity: '2,5', unitPrice: '1500,50' })).toBe(375125);
  });
  it('rechaza cantidades inválidas', () => {
    expect(lineCents({ quantity: '0', unitPrice: '10' })).toBeNull();
    expect(lineCents({ quantity: '1,234', unitPrice: '10' })).toBeNull();
  });
  it('calcula subtotal, descuento y total en centavos', () => {
    const items = [{ ...newItem(), quantity: '2', unitPrice: '1500,50' }, { ...newItem(), quantity: '1', unitPrice: '100' }];
    expect(computeTotals(items, '50', true)).toEqual({ subtotalCents: 310100, discountCents: 5000, totalCents: 305100 });
  });
  it('sin precios el total es cero', () => {
    expect(computeTotals([{ ...newItem(), unitPrice: '999' }], '10', false).totalCents).toBe(0);
  });
});

describe('warrantyEndDate', () => {
  it('suma meses respetando el fin de mes', () => {
    expect(warrantyEndDate('2026-11-10', 12)).toBe('2027-11-10');
    expect(warrantyEndDate('2026-08-31', 6)).toBe('2027-02-28');
  });
});

describe('validateDocument', () => {
  it('acepta un ticket sin cliente', () => {
    expect(validateDocument(withItem('ticket', { customerName: '' }))).toBeNull();
  });
  it('exige cliente en presupuesto, remito y garantía', () => {
    expect(validateDocument(withItem('presupuesto', { customerName: '' }))).toMatch(/cliente/);
    expect(validateDocument(withItem('remito', { customerName: '' }))).toMatch(/cliente/);
  });
  it('exige precio en ticket y presupuesto, pero no en remito sin precios', () => {
    const noPrice = [{ ...newItem(), description: 'X', quantity: '1', unitPrice: '' }];
    expect(validateDocument(withItem('ticket', { items: noPrice }))).toMatch(/precio/);
    expect(validateDocument(withItem('remito', { items: noPrice, showPrices: false }))).toBeNull();
  });
  it('valida el plazo de la garantía y la validez del presupuesto', () => {
    expect(validateDocument(withItem('garantia', { warrantyMonths: '0' }))).toMatch(/plazo/);
    expect(validateDocument(withItem('presupuesto', { validUntil: '2026-01-01' }))).toMatch(/validez/);
  });
  it('no deja un descuento mayor al subtotal', () => {
    expect(validateDocument(withItem('ticket', { discount: '999999' }))).toMatch(/descuento/);
  });
});

describe('buildPayload', () => {
  it('manda importes con punto y omite lo que no corresponde al tipo', () => {
    const payload = buildPayload(withItem('ticket', { validUntil: '2026-12-01', warrantyMonths: '12' }));
    expect(payload.items[0].unit_price).toBe('1500.50');
    expect(payload.valid_until).toBe('');
    expect(payload.warranty_months).toBe('');
  });
});
