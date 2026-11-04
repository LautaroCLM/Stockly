import { describe, expect, it } from 'vitest';
import { previewAdjustment, validateAdjustmentForm } from './adjustmentMath';
import type { Product } from './types';

const product: Product = {
  id: 'p1',
  sku: 'S',
  barcode: '',
  name: 'Latex',
  category: 'Pinturas',
  salePrice: 1,
  costPrice: 1,
  stock: 20,
  minStock: 5,
  unit: 'unidad',
  status: 'normal' as Product['status'],
};

describe('previewAdjustment', () => {
  it('en conteo físico calcula la diferencia contra el stock actual', () => {
    expect(previewAdjustment(20, 'physical_count', 'increase', '18')).toMatchObject({
      direction: 'decrease',
      deltaQuantity: 2,
      projectedStock: 18,
    });
    expect(previewAdjustment(20, 'physical_count', 'decrease', '25').direction).toBe('increase');
  });

  it('en mermas resta la cantidad ingresada, sin errores de coma flotante', () => {
    expect(previewAdjustment(0.3, 'loss_damage', 'decrease', '0,1')).toMatchObject({ deltaQuantity: 0.1, projectedStock: 0.2 });
  });

  it('marca como inválido un texto que no es número', () => {
    expect(previewAdjustment(20, 'loss_damage', 'decrease', 'abc').inputHundredths).toBeNull();
  });
});

describe('validateAdjustmentForm', () => {
  it('exige justificación en mermas y consumo interno', () => {
    expect(validateAdjustmentForm(product, 'loss_damage', 200, '  ')).toMatch(/justificación/);
    expect(validateAdjustmentForm(product, 'loss_damage', 200, 'Rotura')).toBeNull();
  });

  it('rechaza decimales en unidades indivisibles y cantidad cero fuera del conteo', () => {
    expect(validateAdjustmentForm(product, 'physical_count', 150, '')).toMatch(/indivisible/);
    expect(validateAdjustmentForm(product, 'internal_use', 0, 'Uso')).toMatch(/mayor a cero/);
    expect(validateAdjustmentForm(product, 'physical_count', 0, '')).toBeNull();
  });
});
