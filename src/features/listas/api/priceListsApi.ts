import { supabase } from '@/lib/supabase';
import { toUserMessage } from '@/lib/errorMessages';
import { toRoundingStep } from '../priceListForm';
import type { ListActionResult, ListPrice, PriceList, RoundingStep } from '../types';

export async function fetchPriceLists(companyId: string): Promise<PriceList[]> {
  const { data, error } = await supabase
    .from('price_lists')
    .select('id, name, adjustment_percent, rounding_step, is_active')
    .eq('company_id', companyId)
    .order('name');
  if (error) throw new Error('No se pudieron cargar las listas de precios.');
  return (data ?? []).map((l) => ({
    id: l.id, name: l.name, adjustmentPercent: Number(l.adjustment_percent), roundingStep: toRoundingStep(l.rounding_step),
    isActive: l.is_active,
  }));
}

/** Precio de cada producto en la lista, calculado por la base (la misma regla que usa la venta). */
export async function fetchListPrices(companyId: string, priceListId: string): Promise<Map<string, ListPrice>> {
  const { data, error } = await supabase.rpc('price_list_prices', { p_company_id: companyId, p_price_list_id: priceListId });
  if (error) throw new Error('No se pudieron cargar los precios de la lista.');
  return new Map((data ?? []).map((r) => [r.product_id, { price: Number(r.price), isFixed: r.is_fixed }]));
}

export async function savePriceListRpc(
  companyId: string, id: string | null, v: { name: string; percent: number; roundingStep: RoundingStep; isActive: boolean }
): Promise<ListActionResult<string>> {
  const { data, error } = await supabase.rpc('save_price_list', {
    p_company_id: companyId, p_price_list_id: id as string, p_name: v.name, p_adjustment_percent: v.percent,
    p_rounding_step: v.roundingStep, p_is_active: v.isActive,
  });
  if (error || typeof data !== 'string') return { ok: false, message: toUserMessage(error, 'No se pudo guardar la lista.') };
  return { ok: true, value: data };
}

/** Fija el precio de un producto en la lista; null quita la excepción. */
export async function setListItemRpc(companyId: string, priceListId: string, productId: string, price: number | null): Promise<ListActionResult> {
  const { error } = await supabase.rpc('set_price_list_item', {
    p_company_id: companyId, p_price_list_id: priceListId, p_product_id: productId, p_price: price as number,
  });
  if (error) return { ok: false, message: toUserMessage(error, 'No se pudo guardar el precio.') };
  return { ok: true };
}

export async function setCustomerPriceListRpc(companyId: string, customerId: string, priceListId: string | null): Promise<void> {
  const { error } = await supabase.rpc('set_customer_price_list', {
    p_company_id: companyId, p_customer_id: customerId, p_price_list_id: priceListId as string,
  });
  if (error) throw new Error(toUserMessage(error, 'No se pudo guardar la lista de precios del cliente.'));
}
