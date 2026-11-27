import { supabase } from '@/lib/supabase';
import type { VatRate } from '@/features/facturacion/vat';
import { sanitizeProductError } from './productsApi';

/** Cambia la alícuota de IVA de un producto (public.set_product_vat_rate). */
export async function setProductVatRateRpc(companyId: string, productId: string, vatRate: VatRate): Promise<void> {
  const { error } = await supabase.rpc('set_product_vat_rate', {
    p_company_id: companyId,
    p_product_id: productId,
    p_vat_rate: vatRate,
  });
  if (error) throw new Error(sanitizeProductError(error, 'No se pudo guardar la alícuota de IVA.'));
}

/** Mensaje cuando el producto se guardó pero su IVA no. */
export function vatNotSavedMessage(detail: string): string {
  return `El producto se guardó, pero no su alícuota de IVA (${detail}). Editalo para corregirla.`;
}
