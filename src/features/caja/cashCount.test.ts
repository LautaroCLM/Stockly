import { describe, expect, it } from 'vitest';
import { countCash, parseCount } from './cashCount';

describe('parseCount', () => {
  it('acepta enteros de hasta 4 cifras y vacío como cero', () => {
    expect(parseCount('')).toBe(0);
    expect(parseCount(' 12 ')).toBe(12);
    expect(parseCount('-1')).toBeNull();
    expect(parseCount('1,5')).toBeNull();
    expect(parseCount('12345')).toBeNull();
  });
});

describe('countCash', () => {
  it('suma cantidad por valor de cada billete', () => {
    expect(countCash({ 20000: '2', 1000: '3', 100: '7' }, '').total).toBe(43700);
  });

  it('suma el monto suelto con centavos, sin errores de redondeo', () => {
    expect(countCash({ 10: '1' }, '0,30').total).toBe(10.3);
    expect(countCash({}, '1234.56').total).toBe(1234.56);
  });

  it('con todo vacío el total es cero', () => {
    expect(countCash({}, '')).toEqual({ total: 0, invalid: [] });
  });

  it('marca los campos inválidos y no da total', () => {
    expect(countCash({ 500: 'x', 200: '2' }, '')).toEqual({ total: null, invalid: [500] });
    expect(countCash({}, 'abc').total).toBeNull();
  });
});
