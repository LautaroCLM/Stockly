import type { ColumnMapping, ImportField } from './columns';
import { FIELD_INFO } from './columns';
import { INDIVISIBLE_UNITS, cellText, parseDecimal, parseUnit } from './values';

/** Máximo de productos por importación (el mismo límite que la base). */
export const MAX_IMPORT_ROWS = 2000;

export interface ImportOptions {
  /** Con qué se reconoce un producto que ya existe. */
  matchBy: 'sku' | 'name';
  /** Qué hacer con los que ya existen: actualizar lo elegido y sumar stock, u omitirlos. */
  onExisting: 'update' | 'skip';
  createCategories: boolean;
}

/** Lo mínimo que hace falta saber de cada producto actual para clasificar las filas. */
export interface ExistingProduct {
  sku: string;
  name: string;
  unit: string;
}

export interface RowIssue {
  /** Número de fila en la planilla (la 1 es el encabezado). 0 = problema general del archivo. */
  row: number;
  message: string;
}

/** Fila lista para enviar a la base: solo trae los campos elegidos y con valor. */
export interface ImportRowPayload {
  row: number;
  sku?: string;
  name?: string;
  category?: string;
  selling_price?: number;
  stock?: number;
  unit?: string;
  min_stock?: number;
  cost_price?: number;
  barcode?: string;
  description?: string;
}

export interface ImportPlan {
  rows: ImportRowPayload[];
  issues: RowIssue[];
  toCreate: number;
  toUpdate: number;
  toSkip: number;
  /** Productos que van a recibir stock. */
  stockEntries: number;
  /** Categorías del archivo que todavía no existen. */
  newCategories: string[];
  /** Cuántos SKU se generaron solos para productos nuevos sin código. */
  generatedSkus: number;
}

const NUMERIC_FIELDS: { field: 'selling_price' | 'stock' | 'min_stock' | 'cost_price'; label: string }[] = [
  { field: 'selling_price', label: 'el precio de venta' },
  { field: 'cost_price', label: 'el costo' },
  { field: 'min_stock', label: 'el stock mínimo' },
  { field: 'stock', label: 'el stock' },
];

const LIMITS = { price: 999_999_999_999.99, quantity: 999_999_999.99 };

const isRowEmpty = (cells: unknown[], mapping: ColumnMapping): boolean =>
  Object.values(mapping).every((index) => cellText(index === undefined ? '' : cells[index]) === '');

/** Siguiente código libre del estilo IMP-0001 (no pisa SKU existentes ni ya generados). */
function nextFreeSku(taken: Set<string>, counter: { n: number }): string {
  for (;;) {
    const candidate = `IMP-${String(counter.n++).padStart(4, '0')}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Convierte la planilla en filas para importar y revisa todo lo que se pueda antes de enviar:
 * campos obligatorios, números, unidades, repetidos dentro del archivo y categorías.
 * `table[0]` es el encabezado. La base vuelve a validar todo: esto es para avisar a tiempo y por fila.
 */
export function buildImportPlan(
  table: unknown[][],
  mapping: ColumnMapping,
  options: ImportOptions,
  existing: ExistingProduct[],
  existingCategories: string[]
): ImportPlan {
  const plan: ImportPlan = { rows: [], issues: [], toCreate: 0, toUpdate: 0, toSkip: 0, stockEntries: 0, newCategories: [], generatedSkus: 0 };
  const dataRows = table.slice(1);

  const bySku = new Map(existing.map((p) => [p.sku.trim().toUpperCase(), p]));
  const byName = new Map<string, ExistingProduct[]>();
  for (const p of existing) {
    const key = p.name.trim().toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), p]);
  }
  const knownCategories = new Set(existingCategories.map((c) => c.trim().toLowerCase()));
  const newCategoryNames = new Map<string, string>();
  const takenSkus = new Set(bySku.keys());
  const skuCounter = { n: 1 };
  const seen = new Set<string>();

  const cell = (cells: unknown[], field: ImportField): unknown => {
    const index = mapping[field];
    return index === undefined ? undefined : cells[index];
  };

  dataRows.forEach((cells, offset) => {
    if (isRowEmpty(cells, mapping)) return;
    const row = offset + 2;
    const issue = (message: string) => plan.issues.push({ row, message });
    const payload: ImportRowPayload = { row };
    let rowOk = true;
    const fail = (message: string) => {
      issue(message);
      rowOk = false;
    };

    const sku = cellText(cell(cells, 'sku')).toUpperCase();
    const name = cellText(cell(cells, 'name'));
    if (sku) payload.sku = sku;
    if (name) payload.name = name;

    // Campos de texto
    const category = cellText(cell(cells, 'category'));
    if (category) payload.category = category;
    const barcode = cellText(cell(cells, 'barcode'));
    if (barcode) payload.barcode = barcode;
    const description = cellText(cell(cells, 'description'));
    if (description) payload.description = description;
    if (sku.length > 50) fail('el SKU no puede superar 50 caracteres');
    if (name.length > 200) fail('el nombre no puede superar 200 caracteres');
    if (barcode.length > 50) fail('el código de barras no puede superar 50 caracteres');
    if (category.length > 100) fail('la categoría no puede superar 100 caracteres');

    // Unidad
    const unit = parseUnit(cell(cells, 'unit'));
    if (unit === undefined) fail(`la unidad "${cellText(cell(cells, 'unit'))}" no es válida (unidad, kg, litro, metro, bulto o par)`);
    else if (unit) payload.unit = unit;

    // Números
    for (const { field, label } of NUMERIC_FIELDS) {
      if (mapping[field] === undefined) continue;
      const parsed = parseDecimal(cell(cells, field));
      if (!parsed.ok) {
        fail(`${label} no es un número ("${cellText(cell(cells, field))}")`);
      } else if (parsed.value !== null) {
        const max = field === 'selling_price' || field === 'cost_price' ? LIMITS.price : LIMITS.quantity;
        if (parsed.value < 0) fail(`${label} no puede ser negativo`);
        else if (parsed.value > max) fail(`${label} es demasiado grande`);
        else payload[field] = parsed.value;
      }
    }

    // Cómo se identifica el producto
    const key = options.matchBy === 'sku' ? sku : name.toLowerCase();
    if (key === '') {
      fail(options.matchBy === 'sku' ? 'falta el SKU' : 'falta el nombre');
    } else if (seen.has(key)) {
      fail(`el producto "${options.matchBy === 'sku' ? sku : name}" aparece más de una vez en el archivo`);
    } else {
      seen.add(key);
    }

    // ¿Existe ya?
    let match: ExistingProduct | undefined;
    if (key !== '') {
      if (options.matchBy === 'sku') {
        match = bySku.get(sku);
      } else {
        const candidates = byName.get(key) ?? [];
        if (candidates.length > 1) fail(`hay ${candidates.length} productos llamados "${name}" en el inventario: usá el SKU para identificarlo`);
        match = candidates.length === 1 ? candidates[0] : undefined;
      }
    }

    if (match && options.onExisting === 'skip') {
      if (rowOk) plan.toSkip += 1;
      return;
    }

    // Categoría
    if (category && !knownCategories.has(category.toLowerCase())) {
      if (!options.createCategories) fail(`la categoría "${category}" no existe`);
      else newCategoryNames.set(category.toLowerCase(), category);
    }

    // Un producto nuevo necesita SKU y nombre
    if (!match && rowOk) {
      if (!name) fail('para crear un producto nuevo hace falta el nombre');
      else if (!sku) {
        payload.sku = nextFreeSku(takenSkus, skuCounter);
        takenSkus.add(payload.sku);
        plan.generatedSkus += 1;
      }
    }

    // Unidades indivisibles no admiten decimales
    const effectiveUnit = payload.unit ?? match?.unit ?? 'unidad';
    if (INDIVISIBLE_UNITS.includes(effectiveUnit)) {
      for (const field of ['stock', 'min_stock'] as const) {
        const value = payload[field];
        if (value !== undefined && !Number.isInteger(value)) {
          fail(`la unidad "${effectiveUnit}" no admite decimales en ${field === 'stock' ? 'el stock' : 'el stock mínimo'}`);
        }
      }
    }

    if (!rowOk) return;
    plan.rows.push(payload);
    if (match) plan.toUpdate += 1;
    else plan.toCreate += 1;
    if (payload.stock !== undefined && payload.stock > 0) plan.stockEntries += 1;
  });

  plan.newCategories = [...newCategoryNames.values()];
  if (plan.rows.length + plan.toSkip > MAX_IMPORT_ROWS) {
    plan.issues.unshift({ row: 0, message: `El archivo tiene más de ${MAX_IMPORT_ROWS} productos: dividilo en archivos más chicos.` });
  }
  if (plan.rows.length === 0 && plan.toSkip === 0 && plan.issues.length === 0) {
    plan.issues.push({ row: 0, message: 'No se encontraron productos para importar: revisá las columnas elegidas.' });
  }
  return plan;
}

/** Nombre legible de un campo para mensajes. */
export const fieldLabel = (field: ImportField): string => FIELD_INFO[field].label;
