import { describe, expect, it } from 'vitest';
import { validateInitialStockBatch, validateStockAdjustment } from './stockValidation';
import type { Product } from './types';

const product = (overrides: Partial<Product> = {}): Product => ({
  id: 'p1',
  sku: 'SKU-1',
  barcode: '',
  name: 'Latex',
  category: 'Pinturas',
  salePrice: 100,
  costPrice: 50,
  stock: 0,
  minStock: 0,
  unit: 'unidad',
  status: 'normal' as Product['status'],
  ...overrides,
});

describe('validateStockAdjustment', () => {
  const base = { productId: 'p1', direction: 'decrease' as const, quantity: 2 };

  it('acepta una merma entera en unidades', () => {
    expect(validateStockAdjustment({ ...base, reason: 'loss_damage' }, product())).toBeNull();
  });

  it('rechaza decimales en unidades indivisibles', () => {
    expect(validateStockAdjustment({ ...base, reason: 'loss_damage', quantity: 1.5 }, product())).toMatch(/indivisible/);
  });

  it('acepta decimales en kg', () => {
    expect(validateStockAdjustment({ ...base, reason: 'internal_use', quantity: 1.5 }, product({ unit: 'kg' }))).toBeNull();
  });

  it('exige la cantidad contada en un conteo físico', () => {
    expect(validateStockAdjustment({ ...base, reason: 'physical_count' }, product())).toBe('Falta la cantidad contada.');
  });

  it('rechaza motivos que no son ajustes manuales', () => {
    expect(validateStockAdjustment({ ...base, reason: 'sale' }, product())).toMatch(/Motivo no admitido/);
  });

  it('rechaza un producto inexistente', () => {
    expect(validateStockAdjustment({ ...base, reason: 'loss_damage' }, undefined)).toMatch(/no encontrado/);
  });
});

describe('validateInitialStockBatch', () => {
  const item = { productId: 'p1', quantity: 10, unitCost: 50 };

  it('acepta un lote válido', () => {
    expect(validateInitialStockBatch({ items: [item] }, [product()])).toBeNull();
  });

  it('rechaza un lote vacío', () => {
    expect(validateInitialStockBatch({ items: [] }, [product()])).toMatch(/vacío/);
  });

  it('rechaza productos que ya tienen stock', () => {
    expect(validateInitialStockBatch({ items: [item] }, [product({ stock: 3 })])).toMatch(/ya posee existencias/);
  });

  it('rechaza cantidad cero y costo negativo', () => {
    expect(validateInitialStockBatch({ items: [{ ...item, quantity: 0 }] }, [product()])).toMatch(/mayor a cero/);
    expect(validateInitialStockBatch({ items: [{ ...item, unitCost: -1 }] }, [product()])).toMatch(/negativo/);
  });
});
