import { describe, expect, it } from 'vitest';
import { parsePercent, rowChangePercent, signedPercent, summarizePreview, toggleId, validatePercent } from './priceMath';
import type { PreviewRow } from './types';

const row = (id: string, oldPrice: number, newPrice: number): PreviewRow => ({
  productId: id, sku: id, name: id, categoryId: null, supplierId: null, oldPrice, newPrice,
});

describe('parsePercent', () => {
  it('lee enteros y decimales con coma o punto', () => {
    expect(parsePercent('10')).toBe(10);
    expect(parsePercent('7,5')).toBe(7.5);
    expect(parsePercent(' 12.25 ')).toBe(12.25);
  });

  it('rechaza lo que no es un número simple', () => {
    for (const bad of ['', 'abc', '-5', '1e3', '10%', '1,234', '1.2.3', '12345']) expect(parsePercent(bad)).toBeNull();
  });
});

describe('validatePercent', () => {
  it('acepta valores razonables', () => {
    expect(validatePercent('10', 'up')).toBeNull();
    expect(validatePercent('90', 'down')).toBeNull();
  });

  it('pide el porcentaje y rechaza cero', () => {
    expect(validatePercent('', 'up')).toMatch(/Escribí el porcentaje/);
    expect(validatePercent('0', 'up')).toMatch(/mayor a 0/);
    expect(validatePercent('0,00', 'down')).toMatch(/mayor a 0/);
  });

  it('limita las bajas al 90 % y los aumentos al 1000 %', () => {
    expect(validatePercent('91', 'down')).toMatch(/90/);
    expect(validatePercent('1000', 'up')).toBeNull();
    expect(validatePercent('1001', 'up')).toMatch(/1000/);
  });
});

describe('signedPercent', () => {
  it('devuelve negativo cuando se baja', () => {
    expect(signedPercent('10', 'up')).toBe(10);
    expect(signedPercent('10', 'down')).toBe(-10);
    expect(signedPercent('x', 'up')).toBeNull();
  });
});

describe('rowChangePercent y resumen', () => {
  it('calcula la diferencia con un decimal', () => {
    expect(rowChangePercent(row('a', 1000, 1100))).toBe(10);
    expect(rowChangePercent(row('a', 1234.56, 1358))).toBe(10);
    expect(rowChangePercent(row('a', 0, 5))).toBe(0);
  });

  it('cuenta los productos que se cambian y los que se dejan afuera', () => {
    const rows = [row('a', 1, 2), row('b', 1, 2), row('c', 1, 2)];
    expect(summarizePreview(rows, new Set(['b']))).toEqual({ selected: 2, excluded: 1 });
    expect(summarizePreview(rows, new Set(['zzz']))).toEqual({ selected: 3, excluded: 0 });
  });

  it('alterna ids sin modificar la lista original', () => {
    const base = ['a'];
    expect(toggleId(base, 'b')).toEqual(['a', 'b']);
    expect(toggleId(base, 'a')).toEqual([]);
    expect(base).toEqual(['a']);
  });
});
