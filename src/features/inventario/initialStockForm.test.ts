import { describe, expect, it } from 'vitest';
import { toBatchPayload, validateBatchDraft } from './initialStockForm';
import type { Product } from './types';

const product = (unit: string): Product => ({
  id: 'p1',
  sku: 'S',
  barcode: '',
  name: 'Latex',
  category: 'Pinturas',
  salePrice: 1,
  costPrice: null,
  stock: 0,
  minStock: 0,
  unit,
  status: 'normal' as Product['status'],
});

describe('validateBatchDraft', () => {
  it('exige al menos un producto', () => {
    expect(validateBatchDraft([], new Map())).toMatch(/al menos un producto/);
  });

  it('valida cantidad, unidad indivisible y costo', () => {
    const units = new Map([['p1', product('unidad')]]);
    expect(validateBatchDraft([{ productId: 'p1', quantity: '0', unitCost: '1' }], units)).toMatch(/mayor a cero/);
    expect(validateBatchDraft([{ productId: 'p1', quantity: '1.5', unitCost: '1' }], units)).toMatch(/indivisible/);
    expect(validateBatchDraft([{ productId: 'p1', quantity: '2', unitCost: '-1' }], units)).toMatch(/mayor o igual a cero/);
    expect(validateBatchDraft([{ productId: 'p1', quantity: '2', unitCost: 'abc' }], units)).toMatch(/costo/);
  });

  it('acepta decimales en kg', () => {
    const kg = new Map([['p1', product('kg')]]);
    expect(validateBatchDraft([{ productId: 'p1', quantity: '1.5', unitCost: '100' }], kg)).toBeNull();
  });
});

describe('toBatchPayload', () => {
  it('convierte el texto a números', () => {
    expect(toBatchPayload([{ productId: 'p1', quantity: '3', unitCost: '10.5' }])).toEqual([
      { productId: 'p1', quantity: 3, unitCost: 10.5 },
    ]);
  });
});
