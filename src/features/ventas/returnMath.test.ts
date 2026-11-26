import { describe, expect, it } from 'vitest';
import { lineRefund, parseReturnQty } from './returnMath';

describe('lineRefund', () => {
  it('coincide con la base: proporcional a la cantidad y al descuento de la venta', () => {
    // Venta: 3 × 8.300 + 1.000 = 25.900, descuento 2.830, total 23.070
    expect(lineRefund(24900, 3, 2, 25900, 23070)).toBe(14786.18);
    expect(lineRefund(1000, 1, 1, 25900, 23070)).toBe(890.73);
  });

  it('sin descuento devuelve el precio de lo devuelto', () => {
    expect(lineRefund(16600, 2, 1, 16600, 16600)).toBe(8300);
  });

  it('cero si no se devuelve nada', () => {
    expect(lineRefund(1000, 1, 0, 1000, 1000)).toBe(0);
  });
});

describe('parseReturnQty', () => {
  it('acepta vacío (0), enteros y hasta dos decimales dentro de lo que queda', () => {
    expect(parseReturnQty('', 3)).toBe(0);
    expect(parseReturnQty('2', 3)).toBe(2);
    expect(parseReturnQty('1,5', 3)).toBe(1.5);
  });

  it('rechaza más de lo que queda o texto inválido', () => {
    expect(parseReturnQty('4', 3)).toBeNull();
    expect(parseReturnQty('-1', 3)).toBeNull();
    expect(parseReturnQty('1.234', 3)).toBeNull();
  });
});
