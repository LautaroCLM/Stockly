import { describe, expect, it } from 'vitest';
import type { VatBookRow } from './types';
import { vatBookTable, vatBookTotals, voucherLabel } from './vatBookColumns';

const row = (over: Partial<VatBookRow>): VatBookRow => ({
  invoiceId: 'i1', issueDate: '2026-11-27', environment: 'produccion', kind: 'invoice', letter: 'B', invoiceType: 6,
  pointOfSale: 3, number: 16, cae: '76123456789012', receiverDocType: 99, receiverDocNumber: '0', receiverName: 'Consumidor final',
  receiverVatCondition: 'consumidor_final', netAmount: 1200, vat21: 210, vat105: 21, vat27: 0, vatOther: 0, total: 1431, ...over,
});

describe('Libro IVA Ventas', () => {
  it('distingue facturas de notas de crédito', () => {
    expect(voucherLabel(row({}))).toBe('FC B');
    expect(voucherLabel(row({ kind: 'credit_note' }))).toBe('NC B');
  });

  it('las notas de crédito restan en los totales, sin errores de redondeo', () => {
    const rows = [
      row({}),
      row({ invoiceId: 'i2', kind: 'credit_note', netAmount: -1000, vat21: -210, vat105: 0, total: -1210 }),
      row({ invoiceId: 'i3', netAmount: 0.1, vat21: 0.2, vat105: 0, total: 0.3 }),
    ];
    const totals = vatBookTotals(rows);
    // 1.431 − 1.210 + 0,30 = 221,30 · 210 − 210 + 0,20 = 0,20
    expect(totals.total).toContain('221,30');
    expect(totals.vat21).toContain('0,20');
    expect(totals.net).toContain('200,10');
  });

  it('el Excel lleva los importes como números y el CAE', () => {
    const table = vatBookTable([row({ receiverDocType: 80, receiverDocNumber: '30712345671', receiverVatCondition: 'responsable_inscripto', letter: 'A', invoiceType: 1 })]);
    expect(table.headers).toContain('CAE');
    const [first] = table.rows;
    expect(first.slice(1, 6)).toEqual(['FC A', 1, 3, 16, '76123456789012']);
    expect(first.slice(7, 9)).toEqual(['CUIT 30712345671', 'Responsable Inscripto']);
    expect(first.slice(-6)).toEqual([1200, 210, 21, 0, 0, 1431]);
  });
});
