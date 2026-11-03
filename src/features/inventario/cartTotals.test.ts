import { describe, expect, it } from 'vitest';
import { calculateCartTotals, calculateCartTotalsCents } from './cartTotals';

describe('calculateCartTotalsCents', () => {
  it('suma líneas redondeadas a centavos como process_sale', () => {
    const totals = calculateCartTotalsCents(
      [
        { unitPrice: 10.1, quantity: 3 },
        { unitPrice: 1234.57, quantity: 0.75 },
      ],
      0
    );
    expect(totals.lineCents).toEqual([3030, 92593]);
    expect(totals.subtotalCents).toBe(95623);
    expect(totals.totalCents).toBe(95623);
  });

  it('redondea el descuento a pesos enteros', () => {
    // 10% de 333,33 = 33,333 -> 33 pesos
    const totals = calculateCartTotalsCents([{ unitPrice: 333.33, quantity: 1 }], 10);
    expect(totals.discountCents).toBe(3300);
    expect(totals.totalCents).toBe(30033);
  });

  it('nunca deja un descuento mayor al subtotal', () => {
    // 100% de 30,60 redondeado a pesos daría 31: se limita a 30,60
    const totals = calculateCartTotalsCents([{ unitPrice: 30.6, quantity: 1 }], 100);
    expect(totals.discountCents).toBe(3060);
    expect(totals.totalCents).toBe(0);
  });

  it('limita el porcentaje de descuento entre 0 y 100', () => {
    expect(calculateCartTotalsCents([{ unitPrice: 100, quantity: 1 }], -5).discountCents).toBe(0);
    expect(calculateCartTotalsCents([{ unitPrice: 100, quantity: 1 }], 150).totalCents).toBe(0);
  });

  it('un carrito vacío da cero', () => {
    expect(calculateCartTotalsCents([], 10)).toEqual({
      lineCents: [],
      subtotalCents: 0,
      discountCents: 0,
      totalCents: 0,
    });
  });
});

describe('calculateCartTotals', () => {
  it('devuelve montos que se serializan con 2 decimales exactos', () => {
    const totals = calculateCartTotals([{ unitPrice: 10.1, quantity: 3 }], 0);
    // Antes: 10.1 * 3 = 30.299999999999997 y el servidor rechazaba el pago
    expect(JSON.stringify(totals.total)).toBe('30.3');
    expect(totals.lineAmounts).toEqual([30.3]);
  });
});
