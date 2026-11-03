import { supabase } from '@/lib/supabase';
import { cancelExceptionResult, toCancelResult, type CancelDocumentResult } from '@/lib/documentCancellation';

/**
 * Anula una compra mediante public.cancel_purchase (descuenta el stock ingresado y registra
 * el motivo). Se rechaza si la mercadería ya se vendió y la empresa no admite stock negativo.
 * La RPC es idempotente: reintentar después de un corte de red es seguro.
 */
export async function cancelPurchaseRpc(
  companyId: string,
  purchaseId: string,
  reason: string
): Promise<CancelDocumentResult> {
  try {
    const { data, error } = await supabase.rpc('cancel_purchase', {
      p_company_id: companyId,
      p_purchase_id: purchaseId,
      p_reason: reason,
    });
    return toCancelResult(data, error);
  } catch (err) {
    return cancelExceptionResult(err, 'No se pudo anular la compra.');
  }
}
