import { describe, expect, it } from 'vitest';
import type { Product } from './types';
import { foldText, suggestProducts } from './searchSuggestions';

function product(id: string, name: string, sku = '', barcode = ''): Product {
  return { id, name, sku, barcode, category: 'Varios', salePrice: 100, costPrice: null, stock: 1, minStock: 0, unit: 'un', status: 'normal' };
}

const CATALOG = [
  product('1', 'Coca-Cola 500ml', 'BEB-001', '7790001'),
  product('2', 'Agua Cola Sabor', 'BEB-002', '7790002'),
  product('3', 'Café molido', 'CAF-010', '7790003'),
  product('4', 'Galletitas', 'COC-777', '7790004'),
];

describe('foldText', () => {
  it('pasa a minúsculas y quita tildes sin cambiar el largo', () => {
    expect(foldText('CAFÉ Ñandú')).toBe('cafe nandu');
    expect(foldText('CAFÉ').length).toBe(4);
  });
});

describe('suggestProducts', () => {
  it('no sugiere nada con el texto vacío', () => {
    expect(suggestProducts(CATALOG, '   ')).toEqual([]);
  });

  it('pone primero lo que empieza igual y después lo que contiene el texto', () => {
    const result = suggestProducts(CATALOG, 'co');
    expect(result.map((s) => s.product.id)).toEqual(['1', '4', '2']);
    expect(result[0]).toMatchObject({ field: 'name', matchStart: 0, matchLength: 2 });
    expect(result[1]).toMatchObject({ field: 'sku', text: 'COC-777', matchStart: 0 });
  });

  it('encuentra por SKU y por código de barras', () => {
    expect(suggestProducts(CATALOG, 'caf-0')[0]).toMatchObject({ field: 'sku', text: 'CAF-010' });
    expect(suggestProducts(CATALOG, '7790003')[0]).toMatchObject({ field: 'barcode', product: { id: '3' } });
  });

  it('ignora tildes y mayúsculas', () => {
    expect(suggestProducts(CATALOG, 'CAFE')[0].product.id).toBe('3');
  });

  it('marca dónde coincide cuando el texto está en el medio', () => {
    const [first] = suggestProducts(CATALOG, 'cola');
    expect(first).toMatchObject({ field: 'name', text: 'Agua Cola Sabor', matchStart: 5 });
  });

  it('respeta el máximo y no repite sugerencias con el mismo texto', () => {
    const many = Array.from({ length: 20 }, (_, i) => product(String(i), `Leche ${i}`));
    expect(suggestProducts(many, 'leche', 6)).toHaveLength(6);
    const twins = [product('a', 'Pan'), product('b', 'Pan')];
    expect(suggestProducts(twins, 'pa')).toHaveLength(1);
  });
});
