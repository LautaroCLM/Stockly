/** Campos de un producto que se pueden traer desde una planilla. */
export const IMPORT_FIELDS = [
  'sku', 'name', 'category', 'selling_price', 'stock', 'unit', 'min_stock', 'cost_price', 'barcode', 'description',
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

export interface FieldInfo {
  label: string;
  /** Nombres de encabezado habituales, ya normalizados (ver normalizeHeader). Los primeros pesan más. */
  aliases: string[];
  hint?: string;
}

export const FIELD_INFO: Record<ImportField, FieldInfo> = {
  sku: { label: 'SKU / Código', aliases: ['sku', 'codigo', 'codigointerno', 'codigodeproducto', 'codproducto', 'cod', 'articulo', 'id'] },
  name: {
    label: 'Producto (nombre)',
    aliases: ['producto', 'nombre', 'nombredelproducto', 'nombreproducto', 'item', 'articulo', 'descripcion', 'detalle'],
  },
  category: { label: 'Categoría', aliases: ['categoria', 'rubro', 'familia', 'grupo', 'linea', 'tipo'] },
  selling_price: {
    label: 'Precio de venta',
    aliases: ['preciodeventa', 'precioventa', 'precio', 'pvp', 'preciopublico', 'precioalpublico', 'venta', 'preciounitario'],
  },
  stock: {
    label: 'Stock',
    aliases: ['stock', 'stockactual', 'existencia', 'existencias', 'cantidad', 'cant', 'unidades'],
    hint: 'Se suma al stock que ya tiene el producto.',
  },
  unit: { label: 'Unidad', aliases: ['unidad', 'unidaddemedida', 'um', 'medida'] },
  min_stock: { label: 'Stock mínimo', aliases: ['stockminimo', 'stockmin', 'minimo', 'min', 'puntodepedido', 'puntodereposicion'] },
  cost_price: { label: 'Costo', aliases: ['costo', 'preciodecosto', 'preciocosto', 'costounitario', 'preciodecompra', 'preciocompra', 'compra'] },
  barcode: { label: 'Código de barras', aliases: ['codigodebarras', 'codigobarras', 'codbarras', 'barras', 'ean', 'upc', 'codigoean'] },
  description: { label: 'Descripción', aliases: ['descripcion', 'observaciones', 'notas', 'detalle'] },
};

/** Encabezado en minúsculas, sin tildes ni símbolos: "Código de Barras" -> "codigodebarras". */
export function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export type ColumnMapping = Partial<Record<ImportField, number>>;

/**
 * Propone a qué campo va cada columna según su encabezado. Cada columna se usa una sola vez.
 * Los nombres fuertes de un campo se prueban primero en todas las columnas; así "Descripción"
 * solo pasa a ser el nombre del producto si no hay otra columna de nombre.
 */
export function detectMapping(headers: unknown[]): ColumnMapping {
  const normalized = headers.map(normalizeHeader);
  const used = new Set<number>();
  const mapping: ColumnMapping = {};

  const claim = (field: ImportField, alias: string): boolean => {
    const index = normalized.findIndex((h, i) => h === alias && !used.has(i));
    if (index < 0) return false;
    mapping[field] = index;
    used.add(index);
    return true;
  };

  for (const field of IMPORT_FIELDS) {
    // La descripción se resuelve al final, con lo que queda libre
    if (field === 'description') continue;
    // "descripcion" y "detalle" como nombre solo si no hay otro nombre; se resuelve en el segundo repaso
    const aliases = FIELD_INFO[field].aliases.filter((a) => !(field === 'name' && ['descripcion', 'detalle', 'articulo'].includes(a)));
    for (const alias of aliases) {
      if (claim(field, alias)) break;
    }
  }
  if (mapping.name === undefined) {
    for (const alias of ['articulo', 'descripcion', 'detalle']) {
      if (claim('name', alias)) break;
    }
  }
  // La descripción, ahora sí, con lo que quedó libre
  if (mapping.description === undefined) {
    for (const alias of FIELD_INFO.description.aliases) {
      if (claim('description', alias)) break;
    }
  }
  return mapping;
}
