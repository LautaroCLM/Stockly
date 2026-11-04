import { describe, expect, it } from 'vitest';
import { draftTotal, lineSubtotal, validatePurchaseDraft, withQuantity } from './purchaseDraft';
import type { PurchaseDraftItem } from './types';

const item = (overrides: Partial<PurchaseDraftItem> = {}): PurchaseDraftItem => ({
  productId: 'p1',
  productName: 'Latex',
  sku: 'LTX',
  unit: 'unidad',
  quantity: 1,
  unitCost: 0,
  subtotal: 0,
  ...overrides,
});

describe('compras: importes exactos', () => {
  it('multiplica cantidad por costo sin errores de coma flotante', () => {
    expect(lineSubtotal(3, 0.1)).toBe(0.3);
    expect(lineSubtotal(1.5, 10.05)).toBe(15.08); // 15.075 redondea como round(x, 2)
    expect(lineSubtotal(10, 3200)).toBe(32000);
  });

  it('suma el total en centavos', () => {
    const items = [withQuantity(item({ unitCost: 0.1 }), 1), withQuantity(item({ productId: 'p2', unitCost: 0.2 }), 1)];
    expect(draftTotal(items)).toBe(0.3);
  });
});

describe('validatePurchaseDraft', () => {
  it('exige proveedor y al menos un producto', () => {
    expect(validatePurchaseDraft('', [item()])).toMatch(/proveedor/);
    expect(validatePurchaseDraft('s1', [])).toMatch(/al menos un producto/);
  });

  it('rechaza cantidades inválidas y costos negativos', () => {
    expect(validatePurchaseDraft('s1', [item({ quantity: 0 })])).toMatch(/mayor a 0/);
    expect(validatePurchaseDraft('s1', [item({ quantity: 1.5 })])).toMatch(/fraccionadas/);
    expect(validatePurchaseDraft('s1', [item({ unitCost: -1 })])).toMatch(/negativo/);
    expect(validatePurchaseDraft('s1', [item({ unit: 'kg', quantity: 1.5 })])).toBeNull();
  });
});
