import { describe, expect, it } from 'vitest';
import { maskNumbers, scrubEvent, stripQuery } from './scrubEvent';

describe('stripQuery', () => {
  it('saca los parámetros de la URL', () => {
    expect(stripQuery('https://x.supabase.co/rest/v1/customers?name=ilike.*Perez*#a')).toBe('https://x.supabase.co/rest/v1/customers');
  });
});

describe('maskNumbers', () => {
  it('tapa CUIT, DNI y teléfonos, pero no números cortos', () => {
    expect(maskNumbers('CUIT 20-32964233-0 inválido')).toBe('CUIT [número] inválido');
    expect(maskNumbers('DNI 32964233')).toBe('DNI [número]');
    expect(maskNumbers('Falló la venta 12 de 2026')).toBe('Falló la venta 12 de 2026');
  });
});

describe('scrubEvent', () => {
  it('deja solo el id del usuario, URLs sin filtros y sin datos extra', () => {
    const event = scrubEvent({
      message: 'Error con el cliente 30712345678',
      user: { id: 'u1', email: 'a@b.com', ip_address: '1.2.3.4' },
      request: { url: 'https://app/clientes?q=Perez', headers: { cookie: 'x' } },
      exception: { values: [{ type: 'Error', value: 'tel 1123456789' }] },
      breadcrumbs: [{ category: 'fetch', data: { url: 'https://api/rest/v1/sales?customer=eq.1', body: '{"monto":5000}' } }],
      extra: { carrito: [1, 2] },
    });
    expect(event.user).toEqual({ id: 'u1' });
    expect(event.request).toEqual({ url: 'https://app/clientes' });
    expect(event.message).toBe('Error con el cliente [número]');
    expect(event.exception?.values?.[0].value).toBe('tel [número]');
    expect(event.breadcrumbs?.[0].data).toEqual({ url: 'https://api/rest/v1/sales' });
    expect(event.extra).toBeUndefined();
  });
});
