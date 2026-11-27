import { supabase } from '@/lib/supabase';
import { toUserMessage } from '@/lib/errorMessages';
import type { StockByWarehouse, StockTransfer, TransferLine, Warehouse, WarehouseActionResult } from '../types';

export async function fetchWarehouses(companyId: string): Promise<Warehouse[]> {
  const { data, error } = await supabase
    .from('warehouses')
    .select('id, name, is_default, is_active')
    .eq('company_id', companyId)
    .order('is_default', { ascending: false })
    .order('name');
  if (error) throw new Error(toUserMessage(error, 'No se pudieron cargar los depósitos.'));
  return (data ?? []).map((w) => ({ id: w.id, name: w.name, isDefault: w.is_default, isActive: w.is_active }));
}

export async function fetchStockByWarehouse(companyId: string): Promise<StockByWarehouse> {
  const { data, error } = await supabase
    .from('product_stock')
    .select('product_id, warehouse_id, quantity')
    .eq('company_id', companyId)
    .neq('quantity', 0);
  if (error) throw new Error(toUserMessage(error, 'No se pudo cargar el stock por depósito.'));
  const map: StockByWarehouse = new Map();
  for (const row of data ?? []) {
    const inner = map.get(row.product_id) ?? new Map<string, number>();
    inner.set(row.warehouse_id, Number(row.quantity));
    map.set(row.product_id, inner);
  }
  return map;
}

export async function saveWarehouseRpc(companyId: string, id: string | null, name: string, isActive: boolean): Promise<WarehouseActionResult<string>> {
  const { data, error } = await supabase.rpc('save_warehouse', {
    p_company_id: companyId, p_warehouse_id: id as string, p_name: name, p_is_active: isActive,
  });
  if (error || typeof data !== 'string') return { ok: false, message: toUserMessage(error, 'No se pudo guardar el depósito.') };
  return { ok: true, value: data };
}

export async function setDefaultWarehouseRpc(companyId: string, id: string): Promise<WarehouseActionResult> {
  const { error } = await supabase.rpc('set_default_warehouse', { p_company_id: companyId, p_warehouse_id: id });
  if (error) return { ok: false, message: toUserMessage(error, 'No se pudo cambiar el depósito principal.') };
  return { ok: true, value: undefined };
}

export async function createTransferRpc(
  companyId: string, key: string, fromId: string, toId: string, lines: TransferLine[], notes: string
): Promise<WarehouseActionResult<string>> {
  const { data, error } = await supabase.rpc('create_stock_transfer', {
    p_company_id: companyId, p_idempotency_key: key, p_from: fromId, p_to: toId,
    p_items: lines.map((l) => ({ product_id: l.productId, quantity: l.quantity })),
    p_notes: notes.trim() || undefined,
  });
  if (error) return { ok: false, message: toUserMessage(error, 'No se pudo registrar la transferencia.') };
  const number = data && typeof data === 'object' && !Array.isArray(data) ? String(data.transfer_number ?? '') : '';
  return { ok: true, value: number };
}

export async function fetchTransfers(companyId: string, limit = 50): Promise<StockTransfer[]> {
  const { data, error } = await supabase
    .from('stock_transfers')
    .select('id, transfer_number, from_warehouse_id, to_warehouse_id, notes, created_at, stock_transfer_items ( product_id, quantity, product:products ( name ) )')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(toUserMessage(error, 'No se pudieron cargar las transferencias.'));
  return (data ?? []).map((t) => ({
    id: t.id, number: t.transfer_number, fromId: t.from_warehouse_id, toId: t.to_warehouse_id, notes: t.notes, createdAt: t.created_at,
    items: t.stock_transfer_items.map((i) => ({ productId: i.product_id, name: i.product?.name ?? 'Producto', quantity: Number(i.quantity) })),
  }));
}
