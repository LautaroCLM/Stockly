import { supabase } from '@/lib/supabase';
import { isNetworkOrUncertainError } from '@/lib/errorMessages';

/**
 * Normaliza y traduce errores emitidos por PostgreSQL y las RPC de stock.
 */
export function sanitizeStockMovementError(err: unknown, defaultMessage: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
    const msg = err.message.replace(/^(P0001|error):\s*/i, '').trim();
    if (msg.includes('Stock insuficiente')) {
      return 'Stock insuficiente. Las existencias no pueden ser negativas según la política comercial de la empresa.';
    }
    if (msg.includes('indivisible')) {
      return 'La unidad de este producto es indivisible y no admite cantidades fraccionarias con decimales.';
    }
    if (msg.includes('master_admin')) {
      return 'Acceso denegado: se requiere rol de Administrador (master_admin) para registrar ajustes de stock.';
    }
    if (msg.includes('Idempotency key mismatch')) {
      return 'Error de idempotencia: clave de operación reutilizada con distintos parámetros.';
    }
    if (msg.includes('chk_stock_movements_quantity') || msg.includes('fuera de rango')) {
      return 'La cantidad ingresada debe ser mayor a cero y tener como máximo 2 decimales.';
    }
    if (msg.includes('Incoherencia entre dirección')) {
      return 'Incoherencia entre la dirección y el motivo del ajuste seleccionado.';
    }
    if (msg.includes('Motivo no autorizado')) {
      return 'Motivo no autorizado para ajuste manual. Solo se admiten: conteo físico, merma/daño o consumo interno.';
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

export interface RegisterAdjustmentParams {
  companyId: string;
  idempotencyKey: string;
  productId: string;
  direction: 'increase' | 'decrease';
  reason: 'physical_count' | 'loss_damage' | 'internal_use';
  quantity: number;
  notes?: string;
  referenceDoc?: string;
}

export interface RegisterAdjustmentExecutionResult {
  status: 'success' | 'failed' | 'uncertain';
  message?: string;
  newStock?: number;
  previousStock?: number;
}

/**
 * Registra un ajuste físico de stock mediante la RPC transaccional e idempotente public.register_stock_adjustment.
 * Exclusivo para usuarios con rol master_admin.
 */
export async function registerStockAdjustmentRpc(
  params: RegisterAdjustmentParams
): Promise<RegisterAdjustmentExecutionResult> {
  try {
    const { data, error } = await supabase.rpc('register_stock_adjustment', {
      p_company_id: params.companyId,
      p_idempotency_key: params.idempotencyKey,
      p_product_id: params.productId,
      p_direction: params.direction,
      p_reason: params.reason,
      p_quantity: params.quantity,
      p_notes: params.notes?.trim() || undefined,
      p_reference_doc: params.referenceDoc?.trim() || undefined,
    });

    if (error) {
      // supabase-js devuelve los cortes de red como error (no lanza): el resultado es incierto
      if (isNetworkOrUncertainError(error.message)) {
        return {
          status: 'uncertain',
          message:
            'Error de red durante el ajuste de existencias. El resultado en la base de datos es incierto; si reintenta la operación, se reutilizará la misma clave de idempotencia para no duplicar el movimiento.',
        };
      }
      return {
        status: 'failed',
        message: sanitizeStockMovementError(error, 'Error al registrar el ajuste de existencias.'),
      };
    }

    const payload = data as Record<string, unknown> | null;
    const rawNew = payload?.new_stock;
    const rawPrev = payload?.previous_stock;
    const parsedNew = rawNew != null && !Number.isNaN(Number(rawNew)) ? Number(rawNew) : undefined;
    const parsedPrev = rawPrev != null && !Number.isNaN(Number(rawPrev)) ? Number(rawPrev) : undefined;

    return {
      status: 'success',
      newStock: parsedNew,
      previousStock: parsedPrev,
    };
  } catch (err) {
    if (isNetworkOrUncertainError(err)) {
      return {
        status: 'uncertain',
        message:
          'Error de red durante el ajuste de existencias. El resultado en la base de datos es incierto; si reintenta la operación, se reutilizará la misma clave de idempotencia para no duplicar el movimiento.',
      };
    }
    return {
      status: 'failed',
      message: sanitizeStockMovementError(err, 'No se pudo registrar el ajuste de existencias.'),
    };
  }
}
