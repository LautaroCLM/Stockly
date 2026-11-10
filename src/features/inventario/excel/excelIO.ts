import { parseCsv } from './csv';
import type { ExportTable } from './exportRows';

/** Tamaño máximo del archivo a importar. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

const extensionOf = (name: string): string => name.slice(name.lastIndexOf('.') + 1).toLowerCase();

/** Un CSV de Excel en español suele estar en Windows-1252: si no es UTF-8 válido, se prueba con ese. */
async function readText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

/**
 * Lee la primera hoja de un .xlsx, o un .csv, y devuelve una tabla de celdas (la fila 0 es el encabezado).
 * Los errores tienen un mensaje listo para mostrar.
 */
export async function readSpreadsheet(file: File): Promise<unknown[][]> {
  if (file.size > MAX_FILE_BYTES) throw new Error('El archivo pesa más de 5 MB. Dividilo en archivos más chicos.');
  const extension = extensionOf(file.name);

  let table: unknown[][];
  if (extension === 'csv' || extension === 'txt') {
    table = parseCsv(await readText(file));
  } else if (extension === 'xlsx') {
    try {
      const { readSheet } = await import('read-excel-file/universal');
      table = (await readSheet(file)) as unknown[][];
    } catch {
      throw new Error('No se pudo leer el archivo. Verificá que sea un Excel (.xlsx) válido y que no esté protegido con contraseña.');
    }
  } else if (extension === 'xls') {
    throw new Error('El formato .xls (Excel antiguo) no se puede leer. Abrilo en Excel y guardalo como .xlsx o .csv.');
  } else {
    throw new Error('Elegí un archivo de Excel (.xlsx) o un .csv.');
  }

  if (table.length < 2) throw new Error('El archivo no tiene productos: necesita una fila de encabezados y al menos una fila de datos.');
  return table;
}

/** Genera el .xlsx y lo descarga. El encabezado va en negrita y las columnas con un ancho cómodo. */
export async function downloadSpreadsheet(table: ExportTable, fileName: string): Promise<void> {
  const { default: writeXlsxFile } = await import('write-excel-file/universal');
  const data = [
    table.headers.map((header) => ({ value: header, fontWeight: 'bold' as const })),
    ...table.rows.map((row) => row.map((cell) => (cell === null ? null : cell))),
  ];
  const columns = table.headers.map((header, index) => {
    const longest = table.rows.reduce((max, row) => Math.max(max, String(row[index] ?? '').length), header.length);
    return { width: Math.min(Math.max(longest + 2, 12), 50) };
  });

  const blob = await writeXlsxFile(data, { columns }).toBlob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
