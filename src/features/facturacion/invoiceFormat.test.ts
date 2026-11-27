import { describe, expect, it } from 'vitest';
import { arcaQrUrl, displayUnitPrice, formatInvoiceNumber, invoiceLabel, receiverDocLabel } from './invoiceFormat';
import type { InvoiceDetail } from './invoiceTypes';

const INV: InvoiceDetail = {
  id: 'i', saleId: 's', letter: 'B', pointOfSale: 3, number: 16, status: 'authorized', arcaMessage: null, createdAt: '',
  environment: 'homologacion', invoiceType: 6, issueDate: '2026-11-27', receiverDocType: 99, receiverDocNumber: '0',
  receiverName: 'Consumidor final', receiverVatCondition: 'consumidor_final', receiverAddress: null, subtotal: 1431,
  discount: 143.1, netAmount: 1080, vatAmount: 207.9, totalAmount: 1287.9, cae: '76123456789012', caeExpiresAt: '2026-12-07',
  items: [], vatLines: [],
};

describe('formato de factura', () => {
  it('numera con 5 y 8 dígitos', () => {
    expect(formatInvoiceNumber(3, 16)).toBe('00003-00000016');
    expect(invoiceLabel(INV)).toBe('Factura B 00003-00000016');
    expect(invoiceLabel({ ...INV, number: null })).toBe('Factura B (sin número todavía)');
  });
  it('muestra el documento del receptor solo si está identificado', () => {
    expect(receiverDocLabel(80, '30712345671')).toBe('CUIT 30712345671');
    expect(receiverDocLabel(99, '0')).toBe('');
  });
  it('en la Factura A el precio unitario va sin IVA', () => {
    expect(displayUnitPrice('A', 1210, 21)).toBe(1000);
    expect(displayUnitPrice('B', 1210, 21)).toBe(1210);
  });
});

describe('QR de ARCA', () => {
  it('codifica los datos del comprobante en base64', () => {
    const url = arcaQrUrl(INV, '20-32964233-0');
    expect(url).toMatch(/^https:\/\/www\.afip\.gob\.ar\/fe\/qr\/\?p=/);
    const data = JSON.parse(atob(String(url).split('?p=')[1]));
    expect(data).toEqual({
      ver: 1, fecha: '2026-11-27', cuit: 20329642330, ptoVta: 3, tipoCmp: 6, nroCmp: 16, importe: 1287.9,
      moneda: 'PES', ctz: 1, tipoDocRec: 99, nroDocRec: 0, tipoCodAut: 'E', codAut: 76123456789012,
    });
  });
  it('no hay QR sin autorización', () => {
    expect(arcaQrUrl({ ...INV, status: 'pending', cae: null }, '20329642330')).toBeNull();
  });
});
