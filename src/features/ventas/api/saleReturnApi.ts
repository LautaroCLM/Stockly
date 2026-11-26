import { supabase } from '@/lib/supabase';
import { isNetworkOrUncertainError, toUserMessage } from '@/lib/errorMessages';

export type SaleReturnResult =
  | { ok: true; returnNumber: string; refundAmount: number }
  | { ok: false; message: string; uncertain?: boolean };

/** Cuánto ya se devolvió de cada línea de la venta (id de línea → cantidad). */
export async function fetchReturnedQuantities(companyId: string, saleId: string): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('sale_return_items')
    .select('sale_item_id, quantity, sale_returns!inner ( sale_id )')
    .eq('company_id', companyId)
    .eq('sale_returns.sale_id', saleId);
  if (error) throw new Error(toUserMessage(error, 'No se pudo leer lo ya devuelto de esta venta.'));
  const map = new Map<string, number>();
  for (const row of data ?? []) map.set(row.sale_item_id, (map.get(row.sale_item_id) ?? 0) + Number(row.quantity));
  return map;
}

/** Registra una devolución parcial (reintegro en efectivo desde la caja abierta). Reintentar con la misma clave es seguro. */
export async function processSaleReturnRpc(
  companyId: string,
  saleId: string,
  items: { saleItemId: string; quantity: number }[],
  reason: string,
  idempotencyKey: string
): Promise<SaleReturnResult> {
  try {
    const { data, error } = await supabase.rpc('process_sale_return', {
      p_company_id: companyId,
      p_sale_id: saleId,
      p_items: items.map((i) => ({ sale_item_id: i.saleItemId, quantity: i.quantity })),
      p_reason: reason,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw error;
    const r = (data ?? {}) as Record<string, unknown>;
    return { ok: true, returnNumber: String(r.return_number ?? ''), refundAmount: Number(r.refund_amount ?? 0) };
  } catch (err) {
    if (isNetworkOrUncertainError(err)) {
      return { ok: false, uncertain: true, message: 'No pudimos confirmar la devolución por un problema de conexión. Reintentá: no se va a duplicar.' };
    }
    return { ok: false, message: toUserMessage(err, 'No se pudo registrar la devolución.') };
  }
}
