import type { Product } from '../types';

export type ExportCell = string | number | null;

export interface ExportTable {
  headers: string[];
  rows: ExportCell[][];
}

/**
 * Tabla para exportar el inventario. Las primeras columnas siguen el orden de la tabla de pantalla
 * (SKU, Producto, Categoría, Precio de venta, Stock) y después van los demás datos. El costo solo
 * sale si quien exporta puede verlo. Los encabezados son los mismos que reconoce la importación,
 * así que el archivo exportado se puede editar y volver a importar tal cual.
 */
export function buildExportTable(products: Product[], options: { includeCosts: boolean }): ExportTable {
  const headers = ['SKU', 'Producto', 'Categoría', 'Precio de venta', 'Stock', 'Unidad', 'Stock mínimo'];
  if (options.includeCosts) headers.push('Costo');
  headers.push('Código de barras', 'Descripción', 'Estado');

  const rows = products.map((p): ExportCell[] => {
    const row: ExportCell[] = [p.sku, p.name, p.category || null, p.salePrice, p.stock, p.unit, p.minStock];
    if (options.includeCosts) row.push(p.costPrice);
    row.push(p.barcode || null, p.description || null, p.isActive === false ? 'Inactivo' : 'Activo');
    return row;
  });
  return { headers, rows };
}

/** Nombre del archivo: inventario-<empresa>-<fecha>.xlsx, sin caracteres problemáticos. */
export function exportFileName(companyName: string, date: Date): string {
  const slug = companyName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `inventario-${slug || 'empresa'}-${day}.xlsx`;
}
