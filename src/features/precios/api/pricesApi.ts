import { supabase } from '@/lib/supabase';
import { isNetworkOrUncertainError, toUserMessage } from '@/lib/errorMessages';
import { ROUNDING_STEPS } from '../types';
import type { AppliedChange, PreviewRow, PriceBatch, PriceChangeParams, PriceResult, RevertedChange } from '../types';

const MAX_HISTORY = 50;
const UNCERTAIN_MESSAGE =
  'No pudimos confirmar si el cambio se aplicó por un problema de conexión. Revisá el historial antes de reintentar.';

const num = (value: unknown): number => Number(value ?? 0);
const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const rpcArgs = (p: PriceChangeParams) => ({
  p_percent: p.percent,
  p_step: p.step,
  p_category_ids: p.categoryIds,
  p_supplier_ids: p.supplierIds,
});

function mapPreviewRow(raw: unknown): PreviewRow | null {
  if (!isRecord(raw) || typeof raw.productId !== 'string') return null;
  return {
    productId: raw.productId, sku: String(raw.sku ?? ''), name: String(raw.name ?? ''),
    categoryId: str(raw.categoryId), supplierId: str(raw.supplierId),
    oldPrice: num(raw.oldPrice), newPrice: num(raw.newPrice),
  };
}

/** Calcula en la base qué precios cambiarían (no modifica nada). */
export async function previewPriceChange(companyId: string, params: PriceChangeParams): Promise<PreviewRow[]> {
  const { data, error } = await supabase.rpc('preview_price_change', { p_company_id: companyId, ...rpcArgs(params) });
  if (error) throw new Error(toUserMessage(error, 'No se pudo calcular la vista previa.'));
  if (!Array.isArray(data)) return [];
  return data.map(mapPreviewRow).filter((row): row is PreviewRow => row !== null);
}

export async function applyPriceChange(
  companyId: string, batchId: string, params: PriceChangeParams, excludedIds: string[], note: string
): Promise<PriceResult<AppliedChange>> {
  try {
    const { data, error } = await supabase.rpc('apply_price_change', {
      p_company_id: companyId, p_batch_id: batchId, ...rpcArgs(params), p_excluded_ids: excludedIds, p_note: note.trim(),
    });
    if (error) {
      if (isNetworkOrUncertainError(error.message)) return { ok: false, message: UNCERTAIN_MESSAGE, uncertain: true };
      return { ok: false, message: toUserMessage(error, 'No se pudo aplicar el cambio de precios.') };
    }
    const r = isRecord(data) ? data : {};
    return { ok: true, value: { updated: num(r.updated), duplicate: r.duplicate === true } };
  } catch (err) {
    if (isNetworkOrUncertainError(err instanceof Error ? err.message : '')) return { ok: false, message: UNCERTAIN_MESSAGE, uncertain: true };
    return { ok: false, message: 'No se pudo aplicar el cambio de precios. Intentá de nuevo.' };
  }
}

export async function revertPriceChange(companyId: string, batchId: string): Promise<PriceResult<RevertedChange>> {
  const { data, error } = await supabase.rpc('revert_price_change', { p_company_id: companyId, p_batch_id: batchId });
  if (error) return { ok: false, message: toUserMessage(error, 'No se pudo revertir el cambio de precios.') };
  const r = isRecord(data) ? data : {};
  return { ok: true, value: { reverted: num(r.reverted), skipped: num(r.skipped) } };
}

export async function fetchPriceBatches(companyId: string): Promise<PriceBatch[]> {
  const { data, error } = await supabase
    .from('price_change_batches')
    .select('id, percent, rounding_step, category_ids, supplier_ids, note, items_count, status, reverted_items, created_at, reverted_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(MAX_HISTORY);
  if (error) throw new Error('No se pudo cargar el historial de cambios de precios.');
  return (data ?? []).map((b) => ({
    id: b.id, percent: num(b.percent), roundingStep: ROUNDING_STEPS.find((s) => s === num(b.rounding_step)) ?? 0.01,
    categoryIds: b.category_ids, supplierIds: b.supplier_ids, note: b.note, itemsCount: b.items_count,
    status: b.status === 'reverted' ? 'reverted' : 'applied', revertedItems: b.reverted_items,
    createdAt: b.created_at, revertedAt: b.reverted_at,
  }));
}
