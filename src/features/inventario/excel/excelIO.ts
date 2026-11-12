import { parseCsv } from './csv';
import type { ExportTable } from './exportRows';

/** Tamaño máximo del archivo a importar. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

const READ_TIMEOUT_MS = 30_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error: unknown) => { window.clearTimeout(timer); reject(error); }
    );
  });
}

const extensionOf =(name: string): string => name.slice(name.lastIndexOf('.') + 1).toLowerCase();

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
      // Con hojas grandes la librería descomprime en un worker; si algo lo bloquea no responde nunca: se corta con un error
      table = (await withTimeout(readSheet(file), READ_TIMEOUT_MS)) as unknown[][];
    } catch (err) {
      if (err instanceof Error && err.message === 'timeout') {
        throw new Error('El archivo tardó demasiado en leerse. Probá de nuevo; si sigue igual, guardalo como .csv desde Excel e importá ese.');
      }
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

interface SaveHandle {
  createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
}
type SavePicker = (options: {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<SaveHandle>;

/** 'saved': se eligió dónde guardarlo. 'downloaded': bajó a la carpeta de Descargas. 'cancelled': no se guardó nada. */
export type SaveOutcome = 'saved' | 'downloaded' | 'cancelled';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Descarga clásica con un enlace temporal. El enlace se libera con demora: si se destruye al instante, algunos navegadores cancelan la descarga. */
function downloadWithLink(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 60_000);
}

/**
 * Genera el .xlsx y lo guarda. Donde el navegador lo permite (Chrome, Edge, la app de escritorio) abre
 * el cuadro "Guardar como"; si no, lo descarga. El encabezado va en negrita y las columnas con un ancho cómodo.
 */
export async function downloadSpreadsheet(table: ExportTable, fileName: string): Promise<SaveOutcome> {
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

  const picker = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({ suggestedName: fileName, types: [{ description: 'Excel (.xlsx)', accept: { [XLSX_TYPE]: ['.xlsx'] } }] });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return 'saved';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
      // Sin permiso para el cuadro de guardado (o no disponible): se baja con el método clásico
    }
  }
  downloadWithLink(blob, fileName);
  return 'downloaded';
}
