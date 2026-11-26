import { describe, expect, it } from 'vitest';
import type { Sale } from './types';
import { buildTicketMessage, normalizeArPhone, whatsappUrl } from './whatsappTicket';

describe('normalizeArPhone', () => {
  it('acepta celulares escritos como los anota la gente', () => {
    expect(normalizeArPhone('011 15-2345-6789')).toBe('5491123456789');
    expect(normalizeArPhone('+54 9 11 2345-6789')).toBe('5491123456789');
    expect(normalizeArPhone('11 2345 6789')).toBe('5491123456789');
    expect(normalizeArPhone('+54 11 2345 6789')).toBe('5491123456789');
    expect(normalizeArPhone('0351 15 612-3456')).toBe('5493516123456');
    expect(normalizeArPhone('0054 9 2944 123456')).toBe('5492944123456');
  });

  it('devuelve null si el número no se puede interpretar', () => {
    expect(normalizeArPhone('')).toBeNull();
    expect(normalizeArPhone('4444-5555')).toBeNull();
    expect(normalizeArPhone('12345678901234')).toBeNull();
  });
});

const sale: Sale = {
  id: 's1', tenantId: 'c1', saleNumber: 'VTA-00000013', createdAt: '2026-11-26T17:45:00Z',
  clientName: 'Consumidor Final',
  items: [
    { productId: 'p1', sku: 'BUL-003', name: 'Bulón 3/8"', unitPrice: 8300, quantity: 2, subtotal: 16600, currentStock: 10 },
    { productId: 'p2', sku: 'ARA-1', name: 'Arandela', unitPrice: 3100, quantity: 1, subtotal: 3100, currentStock: 4 },
  ],
  subtotal: 19700, discountPercent: 10, discountAmount: 1970, total: 17730,
  payments: [{ id: 'x', method: 'efectivo', amount: 10000 }, { id: 'y', method: 'transferencia', amount: 7730 }],
  status: 'completada',
};

describe('buildTicketMessage', () => {
  it('arma el comprobante con productos, descuento, total y medios de pago', () => {
    const text = buildTicketMessage(sale, 'Ferretería El Tornillo');
    expect(text).toContain('*Ferretería El Tornillo*');
    expect(text).toContain('Comprobante VTA-00000013');
    expect(text).toContain('2 x Bulón 3/8"');
    expect(text).toMatch(/Descuento \(10%\): -\$\s?1\.970,00/);
    expect(text).toMatch(/\*Total: \$\s?17\.730,00\*/);
    expect(text).toMatch(/Pago: Efectivo \$\s?10\.000,00 \+ Transferencia/);
    expect(text).not.toContain('Cliente:');
  });

  it('muestra el cliente si no es consumidor final y avisa si la venta está anulada', () => {
    const text = buildTicketMessage({ ...sale, clientName: 'Municipalidad', status: 'anulada' }, 'X');
    expect(text).toContain('Cliente: Municipalidad');
    expect(text).toContain('*VENTA ANULADA*');
  });
});

describe('whatsappUrl', () => {
  it('codifica el texto y usa el número si lo hay', () => {
    expect(whatsappUrl('5491123456789', 'Hola & chau')).toBe('https://wa.me/5491123456789?text=Hola%20%26%20chau');
    expect(whatsappUrl(null, 'Hola')).toBe('https://wa.me/?text=Hola');
  });
});
