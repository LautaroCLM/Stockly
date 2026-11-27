import { supabase } from '@/lib/supabase';
import { toUserMessage } from '@/lib/errorMessages';
import { DEFAULT_EXPIRY_WARNING_DAYS, type LotActionResult, type StockLot } from '../types';

/** Lotes con unidades de los productos que controlan vencimiento, ordenados por fecha. */
export async function fetchStockLots(companyId: string): Promise<StockLot[]> {
  const { data, error } = await supabase.rpc('stock_lots_list', { p_company_id: companyId });
  if (error) throw new Error(toUserMessage(error, 'No se pudieron cargar los vencimientos.'));
  return (data ?? []).map((r) => ({
    id: r.lot_id,
    productId: r.product_id,
    productName: r.product_name,
    sku: r.sku,
    unit: r.unit,
    lotCode: r.lot_code,
    expiresOn: r.expires_on,
    remaining: Number(r.remaining_quantity),
    initial: Number(r.initial_quantity),
    purchaseNumber: r.purchase_number,
    daysLeft: r.days_left,
  }));
}

/** Días de anticipación del aviso de vencimiento de la empresa. */
export async function fetchExpiryWarningDays(companyId: string): Promise<number> {
  const { data, error } = await supabase.from('companies').select('expiry_warning_days').eq('id', companyId).single();
  if (error || !data) return DEFAULT_EXPIRY_WARNING_DAYS;
  return data.expiry_warning_days;
}

async function run(call: PromiseLike<{ error: unknown }>, fallback: string): Promise<LotActionResult> {
  const { error } = await call;
  return error ? { ok: false, message: toUserMessage(error, fallback) } : { ok: true };
}

export function setProductTracksExpiryRpc(companyId: string, productId: string, enabled: boolean) {
  return run(
    supabase.rpc('set_product_tracks_expiry', { p_company_id: companyId, p_product_id: productId, p_enabled: enabled }),
    'No se pudo cambiar el control de vencimiento.'
  );
}

export function updateStockLotRpc(companyId: string, lotId: string, lotCode: string, expiresOn: string) {
  return run(
    supabase.rpc('update_stock_lot', { p_company_id: companyId, p_lot_id: lotId, p_lot_code: lotCode, p_expires_on: expiresOn }),
    'No se pudo guardar el lote.'
  );
}

export function splitStockLotRpc(companyId: string, lotId: string, quantity: number, lotCode: string, expiresOn: string) {
  return run(
    supabase.rpc('split_stock_lot', {
      p_company_id: companyId, p_lot_id: lotId, p_quantity: quantity, p_lot_code: lotCode, p_expires_on: expiresOn,
    }),
    'No se pudo separar el lote.'
  );
}

export function writeOffStockLotRpc(companyId: string, lotId: string, idempotencyKey: string) {
  return run(
    supabase.rpc('write_off_stock_lot', { p_company_id: companyId, p_idempotency_key: idempotencyKey, p_lot_id: lotId }),
    'No se pudo dar de baja el lote.'
  );
}

export function setExpiryWarningDaysRpc(companyId: string, days: number) {
  return run(
    supabase.rpc('set_expiry_warning_days', { p_company_id: companyId, p_days: days }),
    'No se pudieron guardar los días de aviso.'
  );
}
