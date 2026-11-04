import { describe, expect, it } from 'vitest';
import { initialProductFormValues, marginSummary, toProductFormData, validateProductForm } from './productForm';

const values = { ...initialProductFormValues(null, ['Pinturas']), name: 'Latex', sku: 'ltx-1', salePrice: '4500', costPrice: '3000' };

describe('formulario de producto', () => {
  it('arranca con la primera categoría y sin costo', () => {
    expect(initialProductFormValues(null, ['Pinturas', 'Herramientas'])).toMatchObject({ category: 'Pinturas', costPrice: '' });
  });

  it('valida nombre, SKU, categorías y valores negativos', () => {
    expect(validateProductForm({ ...values, name: ' ' }, ['Pinturas'], true)).toMatch(/nombre/);
    expect(validateProductForm(values, [], true)).toMatch(/No hay categorías/);
    expect(validateProductForm({ ...values, costPrice: '-1' }, ['Pinturas'], true)).toMatch(/costo/);
    expect(validateProductForm({ ...values, salePrice: '-1' }, ['Pinturas'], true)).toMatch(/precio/);
    expect(validateProductForm(values, ['Pinturas'], true)).toBeNull();
  });

  it('arma los datos a enviar: SKU en mayúsculas y costo vacío como null', () => {
    expect(toProductFormData(values, true)).toMatchObject({ sku: 'LTX-1', costPrice: 3000, salePrice: 4500 });
    expect(toProductFormData({ ...values, costPrice: '' }, true).costPrice).toBeNull();
    expect(toProductFormData(values, false).costPrice).toBeUndefined();
  });

  it('calcula ganancia y margen, y marca el margen negativo', () => {
    expect(marginSummary('3000', '4500')).toMatchObject({ grossProfit: 1500, isNegativeMargin: false });
    expect(marginSummary('', '4500').margin).toBeNull();
    expect(marginSummary('5000', '4500').isNegativeMargin).toBe(true);
  });
});
