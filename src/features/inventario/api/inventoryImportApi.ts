import { supabase } from '@/lib/supabase';
import { isNetworkOrUncertainError } from '@/lib/errorMessages';
import type { Json } from '@/types/database';
import type { ImportOptions, ImportRowPayload } from '../excel/buildImport';

export interface InventoryImportResult {
  created: number;
  updated: number;
  skipped: number;
  /** Productos a los que se les sumó stock. */
  stockEntries: number;
  categoriesCreated: number;
}

export type InventoryImportOutcome =
  | { ok: true; result: InventoryImportResult }
  | { ok: false; message: string; uncertain?: boolean };

const UNCERTAIN_MESSAGE =
  'No pudimos confirmar si la importación se guardó por un problema de conexión. Reintentá con el mismo archivo: si ya se guardó, no se vuelve a sumar el stock.';

const cleanMessage = (message: string) => message.replace(/^(P0001|error):\s*/i, '').trim();
const num = (value: unknown): number => Number(value ?? 0);

/** Traduce los errores de la base a mensajes que el usuario pueda resolver. */
function toUserMessage(message: string): string {
  const clean = cleanMessage(message);
  if (clean.includes('No tenés permiso')) return 'No tenés permiso para importar productos. Pedile acceso al administrador.';
  if (clean.includes('Idempotency key mismatch')) return 'Esta importación cambió respecto de un intento anterior. Volvé a elegir el archivo.';
  if (clean.includes('inactiva')) return 'La empresa está inactiva: no se pueden importar productos.';
  return clean;
}

/**
 * Importa el inventario en una sola operación (todo o nada). La misma clave en un reintento
 * devuelve el resultado ya guardado, así que el stock no se suma dos veces.
 */
export async function importInventoryRpc(
  companyId: string,
  rows: ImportRowPayload[],
  options: ImportOptions,
  idempotencyKey: string
): Promise<InventoryImportOutcome> {
  try {
    const { data, error } = await supabase.rpc('import_inventory', {
      p_company_id: companyId,
      p_idempotency_key: idempotencyKey,
      p_rows: rows as unknown as Json,
      p_options: { match_by: options.matchBy, on_existing: options.onExisting, create_categories: options.createCategories },
    });
    if (error) {
      if (isNetworkOrUncertainError(error.message)) return { ok: false, message: UNCERTAIN_MESSAGE, uncertain: true };
      return { ok: false, message: toUserMessage(error.message) };
    }
    const payload = (data ?? {}) as Record<string, unknown>;
    return {
      ok: true,
      result: {
        created: num(payload.created),
        updated: num(payload.updated),
        skipped: num(payload.skipped),
        stockEntries: num(payload.stock_entries),
        categoriesCreated: num(payload.categories_created),
      },
    };
  } catch (err) {
    if (isNetworkOrUncertainError(err instanceof Error ? err.message : '')) return { ok: false, message: UNCERTAIN_MESSAGE, uncertain: true };
    return { ok: false, message: 'No se pudo importar el inventario. Intentá de nuevo.' };
  }
}
