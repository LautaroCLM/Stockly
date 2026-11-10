import { describe, expect, it } from 'vitest';
import { buildImportPlan } from './buildImport';
import type { ImportOptions } from './buildImport';
import { detectMapping, normalizeHeader } from './columns';
import { parseDecimal, parseUnit } from './values';

describe('encabezados', () => {
  it('normaliza tildes, mayúsculas y símbolos', () => {
    expect(normalizeHeader('Código de Barras')).toBe('codigodebarras');
    expect(normalizeHeader('  Precio ($) ')).toBe('precio');
  });

  it('detecta las columnas por su nombre habitual', () => {
    const mapping = detectMapping(['Código', 'Producto', 'Categoría', 'Precio venta', 'Stock', 'Unidad', 'Stock mínimo', 'Costo', 'Código de barras']);
    expect(mapping).toEqual({ sku: 0, name: 1, category: 2, selling_price: 3, stock: 4, unit: 5, min_stock: 6, cost_price: 7, barcode: 8 });
  });

  it('"Descripción" es el nombre solo si no hay otra columna de nombre', () => {
    expect(detectMapping(['Código', 'Descripción', 'Cantidad'])).toMatchObject({ sku: 0, name: 1, stock: 2 });
    const both = detectMapping(['Código', 'Nombre', 'Descripción']);
    expect(both).toMatchObject({ sku: 0, name: 1, description: 2 });
  });

  it('una columna no se usa para dos campos y las desconocidas quedan sin asignar', () => {
    const mapping = detectMapping(['Producto', 'Color', 'Stock']);
    expect(mapping).toEqual({ name: 0, stock: 2 });
  });

  it('un archivo exportado por la app se reconoce completo al volver a importarlo', () => {
    const mapping = detectMapping(['SKU', 'Producto', 'Categoría', 'Precio de venta', 'Stock', 'Unidad', 'Stock mínimo', 'Costo', 'Código de barras', 'Descripción', 'Estado']);
    expect(mapping).toMatchObject({ sku: 0, name: 1, category: 2, selling_price: 3, stock: 4, unit: 5, min_stock: 6, cost_price: 7, barcode: 8, description: 9 });
  });
});

describe('números', () => {
  const value = (raw: unknown) => {
    const r = parseDecimal(raw);
    return r.ok ? r.value : 'ERROR';
  };

  it('entiende los formatos argentinos y de Excel', () => {
    expect(value(1234.5)).toBe(1234.5);
    expect(value('1.234,56')).toBe(1234.56);
    expect(value('1234,56')).toBe(1234.56);
    expect(value('1234.56')).toBe(1234.56);
    expect(value('$ 4.500,00')).toBe(4500);
    expect(value('1,234.56')).toBe(1234.56);
    expect(value('4.500')).toBe(4500);
    expect(value('0.500')).toBe(0.5);
    expect(value('10,5')).toBe(10.5);
    expect(value('-3')).toBe(-3);
  });

  it('las celdas vacías no son error y los textos sí', () => {
    expect(value('')).toBeNull();
    expect(value(null)).toBeNull();
    expect(value('   ')).toBeNull();
    expect(value('abc')).toBe('ERROR');
    expect(value('12abc')).toBe('ERROR');
    expect(value('1.2.3')).toBe('ERROR');
  });

  it('redondea a dos decimales sin errores de coma flotante', () => {
    expect(value(0.1 + 0.2)).toBe(0.3);
    expect(value(10.005)).toBe(10.01);
  });
});

describe('unidades', () => {
  it('reconoce sinónimos habituales', () => {
    expect(parseUnit('Kilos')).toBe('kg');
    expect(parseUnit('LT')).toBe('litro');
    expect(parseUnit('Un.')).toBe('unidad');
    expect(parseUnit('Caja')).toBe('bulto');
    expect(parseUnit('Pares')).toBe('par');
  });

  it('vacío es null y desconocido es undefined', () => {
    expect(parseUnit('')).toBeNull();
    expect(parseUnit('cajón de fruta')).toBeUndefined();
  });
});

describe('plan de importación', () => {
  const header = ['SKU', 'Producto', 'Stock'];
  const mapping = { sku: 0, name: 1, stock: 2 };
  const update: ImportOptions = { matchBy: 'sku', onExisting: 'update', createCategories: true };
  const existing = [
    { sku: 'MIL-1', name: 'Milanesa', unit: 'unidad' },
    { sku: 'PAP-1', name: 'Papa frita', unit: 'unidad' },
  ];

  it('el ejemplo de la milanesa: una existente suma, una nueva se crea', () => {
    const plan = buildImportPlan([header, ['MIL-1', 'Milanesa', 4], ['NAP-1', 'Napolitana', 7]], mapping, update, existing, []);
    expect(plan.issues).toEqual([]);
    expect(plan.toUpdate).toBe(1);
    expect(plan.toCreate).toBe(1);
    expect(plan.stockEntries).toBe(2);
    expect(plan.rows).toEqual([
      { row: 2, sku: 'MIL-1', name: 'Milanesa', stock: 4 },
      { row: 3, sku: 'NAP-1', name: 'Napolitana', stock: 7 },
    ]);
  });

  it('sin la columna de stock no se envía stock', () => {
    const plan = buildImportPlan([header, ['MIL-1', 'Milanesa', 4], ['NAP-1', 'Napolitana', 7]], { sku: 0, name: 1 }, update, existing, []);
    expect(plan.rows.every((r) => r.stock === undefined)).toBe(true);
    expect(plan.stockEntries).toBe(0);
  });

  it('con "omitir", los existentes no entran', () => {
    const plan = buildImportPlan([header, ['MIL-1', 'Milanesa', 4], ['NAP-1', 'Napolitana', 7]], mapping, { ...update, onExisting: 'skip' }, existing, []);
    expect(plan.toSkip).toBe(1);
    expect(plan.rows.map((r) => r.sku)).toEqual(['NAP-1']);
  });

  it('por nombre reconoce al producto sin importar mayúsculas y genera SKU para los nuevos', () => {
    const plan = buildImportPlan([['Producto', 'Stock'], ['milanesa', 4], ['Napolitana', 7]], { name: 0, stock: 1 }, { ...update, matchBy: 'name' }, existing, []);
    expect(plan.issues).toEqual([]);
    expect(plan.toUpdate).toBe(1);
    expect(plan.toCreate).toBe(1);
    expect(plan.generatedSkus).toBe(1);
    expect(plan.rows[1]?.sku).toBe('IMP-0001');
  });

  it('el SKU generado no pisa a uno existente', () => {
    const plan = buildImportPlan([['Producto'], ['Nuevo']], { name: 0 }, { ...update, matchBy: 'name' }, [{ sku: 'IMP-0001', name: 'Otro', unit: 'unidad' }], []);
    expect(plan.rows[0]?.sku).toBe('IMP-0002');
  });

  it('avisa con el número de fila de cada problema', () => {
    const plan = buildImportPlan(
      [['SKU', 'Producto', 'Precio', 'Stock', 'Unidad'], ['A-1', 'Uno', 'abc', 1, ''], ['', 'Dos', 5, 1, ''], ['A-3', 'Tres', -2, 1, ''], ['A-4', 'Cuatro', 5, 1, 'cajón de fruta']],
      { sku: 0, name: 1, selling_price: 2, stock: 3, unit: 4 }, update, [], []
    );
    expect(plan.issues.map((i) => i.row)).toEqual([2, 3, 4, 5]);
    expect(plan.issues[0]?.message).toContain('precio de venta');
    expect(plan.issues[1]?.message).toBe('falta el SKU');
    expect(plan.issues[2]?.message).toContain('negativo');
    expect(plan.rows).toEqual([]);
  });

  it('detecta repetidos dentro del archivo', () => {
    const plan = buildImportPlan([header, ['A-1', 'Uno', 1], ['a-1', 'Otro', 2]], mapping, update, [], []);
    expect(plan.issues).toHaveLength(1);
    expect(plan.issues[0]).toMatchObject({ row: 3 });
    expect(plan.issues[0]?.message).toContain('más de una vez');
  });

  it('las unidades indivisibles no aceptan stock con decimales; el kilo sí', () => {
    const bad = buildImportPlan([header, ['A-1', 'Uno', 2.5]], mapping, update, [], []);
    expect(bad.issues[0]?.message).toContain('no admite decimales');
    const ok = buildImportPlan([['SKU', 'Producto', 'Stock', 'Unidad'], ['A-1', 'Harina', 2.5, 'kg']], { sku: 0, name: 1, stock: 2, unit: 3 }, update, [], []);
    expect(ok.issues).toEqual([]);
  });

  it('un producto existente usa su unidad para validar el stock', () => {
    const plan = buildImportPlan([header, ['MIL-1', 'Milanesa', 1.5]], mapping, update, existing, []);
    expect(plan.issues[0]?.message).toContain('"unidad" no admite decimales');
  });

  it('cuenta las categorías nuevas y exige permiso para crearlas', () => {
    const table = [['SKU', 'Producto', 'Categoría'], ['A-1', 'Uno', 'Bebidas'], ['A-2', 'Dos', 'comidas'], ['A-3', 'Tres', 'Bebidas']];
    const m = { sku: 0, name: 1, category: 2 };
    const created = buildImportPlan(table, m, update, [], ['Comidas']);
    expect(created.issues).toEqual([]);
    expect(created.newCategories).toEqual(['Bebidas']);
    const refused = buildImportPlan(table, m, { ...update, createCategories: false }, [], ['Comidas']);
    expect(refused.issues.map((i) => i.row)).toEqual([2, 4]);
  });

  it('ignora filas vacías y avisa si no hay nada para importar', () => {
    const plan = buildImportPlan([header, ['A-1', 'Uno', 1], [null, null, null], ['', '', '']], mapping, update, [], []);
    expect(plan.rows).toHaveLength(1);
    const empty = buildImportPlan([header, [null, null, null]], mapping, update, [], []);
    expect(empty.issues[0]?.message).toContain('No se encontraron productos');
  });

  it('rechaza archivos con más de 2000 productos', () => {
    const rows = Array.from({ length: 2001 }, (_, i) => [`S-${i}`, `P ${i}`, 1]);
    const plan = buildImportPlan([header, ...rows], mapping, update, [], []);
    expect(plan.issues[0]).toMatchObject({ row: 0 });
    expect(plan.issues[0]?.message).toContain('más de 2000');
  });

  it('los códigos de barras numéricos no salen en notación científica', () => {
    const plan = buildImportPlan([['SKU', 'Producto', 'Barras'], ['A-1', 'Uno', 7791234567890]], { sku: 0, name: 1, barcode: 2 }, update, [], []);
    expect(plan.rows[0]?.barcode).toBe('7791234567890');
  });
});
