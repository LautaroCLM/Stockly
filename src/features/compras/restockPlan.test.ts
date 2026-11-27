import { describe, expect, it } from 'vitest';
import type { Product } from '@/features/inventario/types';
import type { Supplier } from '@/features/proveedores/types';
import { buildRestockPlan, buildSupplierOrderMessage, needsRestock, suggestedQuantity } from './restockPlan';

const product = (over: Partial<Product>): Product => ({
  id: 'p', sku: 'SKU', barcode: '', name: 'Producto', category: 'General', salePrice: 100, vatRate: 21, costPrice: null,
  stock: 2, minStock: 5, unit: 'unidad', status: 'low', isActive: true, ...over,
});
const supplier = (id: string, name: string, contactName?: string): Supplier => ({
  id, companyId: 'c', name, contactName, isActive: true, createdAt: '', updatedAt: '',
});

describe('needsRestock y suggestedQuantity', () => {
  it('repone lo activo con mínimo cargado que está en el mínimo o debajo', () => {
    expect(needsRestock(product({ stock: 5, minStock: 5 }))).toBe(true);
    expect(needsRestock(product({ stock: 6, minStock: 5 }))).toBe(false);
    expect(needsRestock(product({ minStock: 0, stock: 0 }))).toBe(false);
    expect(needsRestock(product({ isActive: false }))).toBe(false);
  });

  it('sugiere llegar al doble del mínimo, entero si la unidad no se fracciona', () => {
    expect(suggestedQuantity(product({ stock: 2, minStock: 5 }))).toBe(8);
    expect(suggestedQuantity(product({ stock: -3, minStock: 5 }))).toBe(13);
    expect(suggestedQuantity(product({ stock: 0.5, minStock: 1.2, unit: 'kg' }))).toBe(1.9);
  });
});

describe('buildRestockPlan', () => {
  it('agrupa por proveedor, ordena por nombre y deja los sin proveedor al final', () => {
    const sA = supplier('a', 'Zeta SA'), sB = supplier('b', 'Alfa SRL');
    const plan = buildRestockPlan([
      product({ id: '1', name: 'Tuerca', supplierId: 'a' }),
      product({ id: '2', name: 'Arandela', supplierId: 'a' }),
      product({ id: '3', name: 'Cable', supplierId: 'b' }),
      product({ id: '4', name: 'Sin prov' }),
      product({ id: '5', name: 'Con stock', supplierId: 'b', stock: 50 }),
    ], [sA, sB]);
    expect(plan.map((g) => g.supplier?.name ?? null)).toEqual(['Alfa SRL', 'Zeta SA', null]);
    expect(plan[1].items.map((i) => i.product.name)).toEqual(['Arandela', 'Tuerca']);
    expect(plan[0].items).toHaveLength(1);
  });
});

describe('buildSupplierOrderMessage', () => {
  it('saluda al contacto y lista cantidades con unidad y código', () => {
    const text = buildSupplierOrderMessage('Ferretería', supplier('a', 'Alfa', 'Marta'), [
      { product: product({ name: 'Tornillo', sku: 'TOR-1' }), quantity: 8 },
    ]);
    expect(text).toContain('Hola Marta');
    expect(text).toContain('*Ferretería*');
    expect(text).toContain('• 8 unidad — Tornillo (TOR-1)');
  });
});
