import { supabase } from '@/lib/supabase';
import { isNetworkOrUncertainError } from '@/features/inventario/api/stockMovementsApi';

export type CancelSaleResult =
  | { status: 'cancelled'; alreadyCancelled: boolean }
  | { status: 'uncertain'; message: string }
  | { status: 'failed'; message: string };

/**
 * Anula una venta mediante public.cancel_sale (repone stock y registra el motivo).
 * La RPC es idempotente: si la venta ya estaba anulada no repite efectos, así que
 * reintentar después de un corte de red es seguro.
 */
export async function cancelSaleRpc(
  companyId: string,
  saleId: string,
  reason: string
): Promise<CancelSaleResult> {
  const uncertain: CancelSaleResult = {
    status: 'uncertain',
    message:
      'No pudimos confirmar la anulación por un problema de conexión. Reintentá: si ya se aplicó, no se va a repetir.',
  };

  try {
    const { data, error } = await supabase.rpc('cancel_sale', {
      p_company_id: companyId,
      p_sale_id: saleId,
      p_reason: reason,
    });

    if (error) {
      if (isNetworkOrUncertainError(error.message)) return uncertain;
      return { status: 'failed', message: error.message.replace(/^(P0001|error):\s*/i, '').trim() };
    }

    const payload = data as { already_cancelled?: boolean } | null;
    return { status: 'cancelled', alreadyCancelled: Boolean(payload?.already_cancelled) };
  } catch (err) {
    if (isNetworkOrUncertainError(err)) return uncertain;
    return { status: 'failed', message: err instanceof Error ? err.message : 'No se pudo anular la venta.' };
  }
}
