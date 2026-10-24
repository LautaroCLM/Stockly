import { supabase } from '@/lib/supabase';
import type { StockMovement, StockMovementDirection, StockMovementReason } from '../types';

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

/**
 * Determina si una falla se debe a pérdida de conectividad o error de transporte,
 * dejando en incertidumbre si PostgreSQL ejecutó o no la mutación.
 */
export function isNetworkOrUncertainError(err: unknown): boolean {
  if (!err) return false;
  const str = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    str.includes('failed to fetch') ||
    str.includes('networkerror') ||
    str.includes('network') ||
    str.includes('timeout') ||
    str.includes('connection refused') ||
    str.includes('abort')
  );
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
 * Consulta los movimientos de stock reales de la empresa activa desde public.stock_movements.
 * Resuelve de forma segura el nombre y SKU del producto, y el nombre del autor desde profiles_public.
 */
export async function fetchStockMovements(companyId: string): Promise<StockMovement[]> {
  // 1. Consultar movimientos ordenados cronológicamente descendente
  const { data: movRows, error: movErr } = await supabase
    .from('stock_movements')
    .select('id, company_id, product_id, direction, reason, quantity, previous_stock, new_stock, reference_sale_id, reference_purchase_id, reference_doc, notes, created_by, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (movErr) {
    throw new Error(sanitizeStockMovementError(movErr, 'Error al consultar el historial de movimientos de stock.'));
  }

  if (!movRows || movRows.length === 0) {
    return [];
  }

  // 2. Resolver datos del producto (nombre y SKU) dentro de la misma empresa
  const { data: prodRows } = await supabase
    .from('products')
    .select('id, name, sku')
    .eq('company_id', companyId);

  const prodMap = new Map(
    (prodRows || []).map((p) => [p.id, { name: p.name, sku: p.sku }])
  );

  // 3. Resolver nombres de autores desde profiles_public (vista segura sin datos privados)
  const { data: profileRows } = await supabase
    .from('profiles_public')
    .select('id, full_name');

  const profileMap = new Map(
    (profileRows || []).filter((pr) => pr.id).map((pr) => [pr.id!, pr.full_name || 'Usuario'])
  );

  return movRows.map((row) => {
    const prodInfo = prodMap.get(row.product_id);
    const authorName = profileMap.get(row.created_by) || 'Personal autorizado';

    return {
      id: row.id,
      companyId: row.company_id,
      productId: row.product_id,
      productName: prodInfo ? prodInfo.name : 'Producto no identificado',
      productSku: prodInfo ? prodInfo.sku : '---',
      direction: row.direction as StockMovementDirection,
      reason: row.reason as StockMovementReason,
      quantity: Number(row.quantity),
      previousStock: Number(row.previous_stock),
      newStock: Number(row.new_stock),
      referenceSaleId: row.reference_sale_id || undefined,
      referenceDoc: row.reference_doc || undefined,
      notes: row.notes || undefined,
      createdBy: authorName,
      createdAt: row.created_at,
    };
  });
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
