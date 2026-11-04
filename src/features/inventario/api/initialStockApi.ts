import { supabase } from '@/lib/supabase';
import { isNetworkOrUncertainError } from '@/lib/errorMessages';
import type { InitialStockItemInput, InitialStockMovementItem } from '../types';

/**
 * Normaliza y traduce los errores emitidos por PostgreSQL durante la ejecución de import_initial_stock.
 */
export function sanitizeInitialStockError(err: unknown, defaultMessage: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
    const msg = err.message.replace(/^(P0001|error):\s*/i, '').trim();

    if (msg.includes('ya posee existencias registradas')) {
      return 'Uno o más productos seleccionados ya poseen existencias registradas. La carga inicial solo admite productos con stock cero.';
    }
    if (msg.includes('ya posee movimientos históricos registrados')) {
      return 'Uno o más productos seleccionados ya poseen movimientos históricos registrados. Utilice Ajuste de Stock para modificar sus existencias.';
    }
    if (msg.includes('duplicados')) {
      return 'El lote contiene productos duplicados (el mismo producto fue incluido más de una vez).';
    }
    if (msg.includes('no puede estar vacío')) {
      return 'El lote de carga inicial no puede estar vacío. Seleccione al menos un producto.';
    }
    if (msg.includes('indivisible')) {
      return 'Uno de los productos posee una unidad indivisible (unidad, bulto, par) y no admite cantidades con decimales.';
    }
    if (msg.includes('master_admin')) {
      return 'Acceso denegado: se requiere rol de Administrador (master_admin) para realizar la carga inicial de inventario.';
    }
    if (msg.includes('Idempotency key mismatch')) {
      return 'Error de idempotencia: clave de carga inicial reutilizada con parámetros distintos.';
    }
    if (msg.includes('Cantidad fuera de rango') || msg.includes('chk_stock_movements_quantity')) {
      return 'La cantidad ingresada debe ser mayor a 0 y tener como máximo 2 decimales.';
    }
    if (msg.includes('Costo fuera de rango')) {
      return 'El costo unitario debe ser mayor o igual a 0 y tener como máximo 2 decimales.';
    }
    if (msg.includes('excede 2 decimales')) {
      return 'Las cantidades y costos admiten un máximo de 2 cifras decimales.';
    }
    if (msg.includes('inactiva')) {
      return 'La empresa se encuentra inactiva. No se admiten operaciones de inventario.';
    }
    return msg;
  }
  if (err instanceof Error) {
    return err.message.replace(/^(P0001|error):\s*/i, '').trim();
  }
  return defaultMessage;
}

export interface ImportInitialStockParams {
  companyId: string;
  idempotencyKey: string;
  items: InitialStockItemInput[];
}

export interface ImportInitialStockExecutionResult {
  status: 'success' | 'failed' | 'uncertain';
  message?: string;
  itemsCount?: number;
  movements?: InitialStockMovementItem[];
  createdAt?: string;
}

// Tope de ids por llamada: la respuesta nunca supera el max_rows de PostgREST
const MOVEMENT_CHECK_BATCH = 1000;

/**
 * De los productos indicados, devuelve los que ya tienen movimientos históricos en la empresa.
 * Permite al frontend distinguir entre productos con saldo 0 sin abrir y productos con rotación previa.
 * Consulta solo los candidatos (no todo el libro de movimientos) mediante public.products_with_movements.
 */
export async function fetchProductsWithMovements(
  companyId: string,
  productIds: string[]
): Promise<Set<string>> {
  const result = new Set<string>();
  if (!companyId || productIds.length === 0) return result;

  try {
    for (let i = 0; i < productIds.length; i += MOVEMENT_CHECK_BATCH) {
      const { data, error } = await supabase.rpc('products_with_movements', {
        p_company_id: companyId,
        p_product_ids: productIds.slice(i, i + MOVEMENT_CHECK_BATCH),
      });

      if (error) {
        console.warn('Error al verificar movimientos previos:', error);
        return result;
      }

      (data || []).forEach((row) => result.add(row.product_id));
    }
    return result;
  } catch (err) {
    console.warn('Fallo de red al consultar movimientos previos:', err);
    return result;
  }
}

/**
 * Ejecuta la carga inicial de inventario masiva mediante la RPC atómica e idempotente public.import_initial_stock.
 * Exclusivo para usuarios con rol master_admin.
 */
export async function importInitialStockRpc(
  params: ImportInitialStockParams
): Promise<ImportInitialStockExecutionResult> {
  try {
    const formattedItems = params.items.map((item) => ({
      product_id: item.productId,
      quantity: Number(item.quantity),
      unit_cost: Number(item.unitCost),
    }));

    const { data, error } = await supabase.rpc('import_initial_stock', {
      p_company_id: params.companyId,
      p_idempotency_key: params.idempotencyKey,
      p_items: formattedItems,
    });

    if (error) {
      return {
        status: 'failed',
        message: sanitizeInitialStockError(error, 'Error al ejecutar la carga inicial de inventario.'),
      };
    }

    const payload = data as Record<string, unknown> | null;
    const rawCount = payload?.items_count;
    const rawMovements = Array.isArray(payload?.movements) ? payload.movements : [];

    const movements: InitialStockMovementItem[] = rawMovements.map((m: unknown) => {
      const rec = m as Record<string, unknown>;
      return {
        productId: String(rec.product_id || ''),
        movementId: String(rec.movement_id || ''),
        quantity: Number(rec.quantity || 0),
        unitCost: Number(rec.unit_cost || 0),
        totalCost: Number(rec.total_cost || 0),
      };
    });

    return {
      status: 'success',
      itemsCount: typeof rawCount === 'number' ? rawCount : movements.length,
      movements,
      createdAt: typeof payload?.created_at === 'string' ? payload.created_at : undefined,
    };
  } catch (err) {
    if (isNetworkOrUncertainError(err)) {
      return {
        status: 'uncertain',
        message:
          'Error de comunicación con el servidor durante la carga inicial. El estado en la base de datos es incierto; si reintenta la operación, se reutilizará la misma clave de idempotencia para no duplicar existencias ni movimientos.',
      };
    }
    return {
      status: 'failed',
      message: sanitizeInitialStockError(err, 'No se pudo completar la carga inicial de inventario.'),
    };
  }
}
