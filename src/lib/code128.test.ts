import { describe, expect, it } from 'vitest';
import { CODE128_PATTERNS, code128Checksum, code128Values, encodeCode128 } from './code128';

describe('tabla de Code 128', () => {
  it('tiene los 107 patrones y cada uno suma 11 módulos (el de cierre, 13)', () => {
    expect(CODE128_PATTERNS).toHaveLength(107);
    CODE128_PATTERNS.forEach((p, i) => {
      const sum = [...p].reduce((a, d) => a + Number(d), 0);
      expect(sum, `patrón ${i}`).toBe(i === 106 ? 13 : 11);
    });
  });

  it('no repite patrones', () => {
    expect(new Set(CODE128_PATTERNS).size).toBe(107);
  });
});

describe('encodeCode128', () => {
  it('calcula el control como inicio B + suma ponderada módulo 103', () => {
    // "A" = 33 → (104 + 33) % 103 = 34
    expect(code128Checksum(code128Values('A') ?? [])).toBe(34);
    // "BUL-004": valores 34,53,44,13,16,16,20
    expect(code128Values('BUL-004')).toEqual([34, 53, 44, 13, 16, 16, 20]);
  });

  it('arma inicio, datos, control y cierre con el ancho total esperado', () => {
    const bars = encodeCode128('7790000000004');
    expect(bars).not.toBeNull();
    // (1 inicio + 13 datos + 1 control) × 11 + 13 del cierre
    expect(bars?.reduce((a, b) => a + b, 0)).toBe(15 * 11 + 13);
  });

  it('rechaza texto vacío o con caracteres fuera del juego B', () => {
    expect(encodeCode128('')).toBeNull();
    expect(encodeCode128('Ñandú')).toBeNull();
  });
});
