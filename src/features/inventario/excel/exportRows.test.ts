import { describe, expect, it } from 'vitest';
import { detectMapping } from './columns';
import { buildExportTable, exportFileName } from './exportRows';
import type { Product } from '../types';

const product = (changes: Partial<Product>): Product => ({
  id: '1', sku: 'MIL-1', barcode: '7791', name: 'Milanesa', category: 'Comidas', salePrice: 100, costPrice: 40, stock: 20, minStock: 5,
  unit: 'unidad', status: 'normal', description: 'Napolitana', isActive: true, ...changes,
});

describe('exportar inventario', () => {
  it('sigue el orden de la tabla de pantalla y suma el resto de los datos', () => {
    const { headers, rows } = buildExportTable([product({})], { includeCosts: true });
    expect(headers.slice(0, 5)).toEqual(['SKU', 'Producto', 'Categoría', 'Precio de venta', 'Stock']);
    expect(rows[0]?.slice(0, 5)).toEqual(['MIL-1', 'Milanesa', 'Comidas', 100, 20]);
    expect(headers).toContain('Costo');
    expect(rows[0]).toHaveLength(headers.length);
  });

  it('sin permiso para ver costos, la columna no sale', () => {
    const { headers, rows } = buildExportTable([product({ costPrice: 40 })], { includeCosts: false });
    expect(headers).not.toContain('Costo');
    expect(rows[0]).not.toContain(40);
    expect(rows[0]).toHaveLength(headers.length);
  });

  it('marca los productos inactivos y deja vacío lo que no hay', () => {
    const { rows } = buildExportTable([product({ isActive: false, category: '', description: undefined, barcode: '' })], { includeCosts: false });
    expect(rows[0]?.at(-1)).toBe('Inactivo');
    expect(rows[0]?.filter((c) => c === null)).toHaveLength(3);
  });

  it('el archivo exportado se reconoce por completo al importarlo de nuevo', () => {
    const { headers } = buildExportTable([product({})], { includeCosts: true });
    const mapping = detectMapping(headers);
    expect(Object.keys(mapping).sort()).toEqual(['barcode', 'category', 'cost_price', 'description', 'min_stock', 'name', 'selling_price', 'sku', 'stock', 'unit']);
  });

  it('arma un nombre de archivo limpio', () => {
    expect(exportFileName('Ferretería La Perla S.A.', new Date(2026, 10, 9))).toBe('inventario-ferreteria-la-perla-s-a-2026-11-09.xlsx');
    expect(exportFileName('###', new Date(2026, 0, 5))).toBe('inventario-empresa-2026-01-05.xlsx');
  });
});
