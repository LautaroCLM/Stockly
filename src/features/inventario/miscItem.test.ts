import { describe, expect, it } from 'vitest';
import { buildMiscItem, isMiscItem } from './miscItem';

describe('buildMiscItem', () => {
  it('arma la línea con precio y cantidad, sin producto del catálogo', () => {
    const item = buildMiscItem('  Corte de caño  ', '1500,50', '2', 'abc');
    expect(item).toMatchObject({ productId: 'misc:abc', sku: 'VARIOS', name: 'Corte de caño', unitPrice: 1500.5, quantity: 2, subtotal: 3001 });
    expect(typeof item !== 'string' && isMiscItem(item)).toBe(true);
  });

  it('cantidad vacía es 1', () => {
    expect(buildMiscItem('Servicio', '100', '', 'x')).toMatchObject({ quantity: 1, subtotal: 100 });
  });

  it('rechaza descripción vacía, precio inválido o cantidad cero', () => {
    expect(buildMiscItem(' ', '100', '1', 'x')).toBe('Escribí qué estás vendiendo.');
    expect(typeof buildMiscItem('A', 'abc', '1', 'x')).toBe('string');
    expect(typeof buildMiscItem('A', '100', '0', 'x')).toBe('string');
    expect(typeof buildMiscItem('A'.repeat(121), '100', '1', 'x')).toBe('string');
  });

  it('los productos del catálogo no son varios', () => {
    expect(isMiscItem({ productId: '4f1c-uuid' })).toBe(false);
  });
});
