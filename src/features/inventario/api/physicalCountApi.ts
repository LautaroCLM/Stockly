import { supabase } from '@/lib/supabase';
import {
  isNetworkOrUncertainError,
  sanitizeStockMovementError,
  type RegisterAdjustmentExecutionResult,
} from './stockMovementsApi';

export interface RegisterPhysicalCountParams {
  companyId: string;
  idempotencyKey: string;
  productId: string;
  countedQuantity: number;
  notes?: string;
  referenceDoc?: string;
}

const UNCERTAIN_MESSAGE =
  'Error de red durante el conteo físico. El resultado en la base de datos es incierto; si reintenta, se reutilizará la misma clave para no duplicar el movimiento.';

/**
 * Registra un conteo físico mediante public.register_physical_count: el servidor fija el stock
 * en la cantidad contada calculando la diferencia contra el stock vigente bajo bloqueo.
 */
export async function registerPhysicalCountRpc(
  params: RegisterPhysicalCountParams
): Promise<RegisterAdjustmentExecutionResult> {
  try {
    const { data, error } = await supabase.rpc('register_physical_count', {
      p_company_id: params.companyId,
      p_idempotency_key: params.idempotencyKey,
      p_product_id: params.productId,
      p_counted_quantity: params.countedQuantity,
      p_notes: params.notes?.trim() || undefined,
      p_reference_doc: params.referenceDoc?.trim() || undefined,
    });

    if (error) {
      if (isNetworkOrUncertainError(error.message)) {
        return { status: 'uncertain', message: UNCERTAIN_MESSAGE };
      }
      return {
        status: 'failed',
        message: sanitizeStockMovementError(error, 'Error al registrar el conteo físico.'),
      };
    }

    const payload = data as Record<string, unknown> | null;
    const newStock = Number(payload?.new_stock);
    const previousStock = Number(payload?.previous_stock);

    return {
      status: 'success',
      newStock: Number.isNaN(newStock) ? undefined : newStock,
      previousStock: Number.isNaN(previousStock) ? undefined : previousStock,
    };
  } catch (err) {
    if (isNetworkOrUncertainError(err)) {
      return { status: 'uncertain', message: UNCERTAIN_MESSAGE };
    }
    return {
      status: 'failed',
      message: sanitizeStockMovementError(err, 'No se pudo registrar el conteo físico.'),
    };
  }
}
