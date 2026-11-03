import { supabase } from '@/lib/supabase';
import { cancelExceptionResult, toCancelResult, type CancelDocumentResult } from '@/lib/documentCancellation';

/**
 * Anula una venta mediante public.cancel_sale (repone stock y registra el motivo).
 * La RPC es idempotente: reintentar después de un corte de red es seguro.
 */
export async function cancelSaleRpc(
  companyId: string,
  saleId: string,
  reason: string
): Promise<CancelDocumentResult> {
  try {
    const { data, error } = await supabase.rpc('cancel_sale', {
      p_company_id: companyId,
      p_sale_id: saleId,
      p_reason: reason,
    });
    return toCancelResult(data, error);
  } catch (err) {
    return cancelExceptionResult(err, 'No se pudo anular la venta.');
  }
}
