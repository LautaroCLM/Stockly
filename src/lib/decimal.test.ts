import { describe, expect, it } from 'vitest';
import { fromHundredths, multiplyToCents, parseHundredths, toHundredths } from './decimal';

describe('parseHundredths', () => {
  it.each([
    ['2.2', 220],
    ['2,2', 220],
    ['0.29', 29],
    ['1,15', 115],
    ['7', 700],
    ['0', 0],
    [' 10.05 ', 1005],
  ])('convierte "%s" a %i centésimas', (input, expected) => {
    expect(parseHundredths(input)).toBe(expected);
  });

  it.each(['1.234', '-1', '', 'abc', '1,2,3', '.5', '1e3'])('rechaza "%s"', (input) => {
    expect(parseHundredths(input)).toBeNull();
  });
});

describe('toHundredths', () => {
  it('corrige el ruido de coma flotante de valores con 2 decimales', () => {
    expect(toHundredths(0.29)).toBe(29);
    expect(toHundredths(10.3 - 10.1)).toBe(20);
    expect(toHundredths(10.1 * 3)).toBe(3030);
  });

  it('es la inversa de fromHundredths', () => {
    expect(toHundredths(fromHundredths(92593))).toBe(92593);
  });
});

describe('multiplyToCents', () => {
  it('redondea como round(precio * cantidad, 2) de PostgreSQL', () => {
    // 1234,57 x 0,75 = 925,9275 -> 925,93
    expect(multiplyToCents(123457, 75)).toBe(92593);
    // 0,05 x 0,5 = 0,025 -> 0,03 (mitad hacia arriba)
    expect(multiplyToCents(5, 50)).toBe(3);
    // 10,10 x 3 = 30,30 exacto
    expect(multiplyToCents(1010, 300)).toBe(3030);
  });

  it('es exacto con montos grandes', () => {
    // 999.999.999,99 x 1.000 unidades
    expect(multiplyToCents(99999999999, 100000)).toBe(99999999999000);
  });
});
