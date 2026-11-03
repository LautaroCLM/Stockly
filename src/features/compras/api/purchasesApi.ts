import { supabase } from '@/lib/supabase';
import { buildSearchOrFilter } from '@/lib/postgrestSearch';
import { isNetworkOrUncertainError } from '@/features/inventario/api/stockMovementsApi';
import type { Purchase, CreatePurchaseInput } from '../types';

export const PURCHASES_PAGE_SIZE = 50;

export interface PurchaseFilters {
  /** Número de compra o factura/remito (se busca en el servidor). */
  search: string;
  /** Proveedores cuyo nombre o CUIT coinciden con la búsqueda (resueltos contra el catálogo). */
  matchingSupplierIds: string[];
}

export interface PurchasesPage {
  rows: Purchase[];
  total: number;
}

const PURCHASE_COLUMNS = `
  id, company_id, purchase_number, supplier_id, invoice_number, purchase_date, status,
  subtotal, total_amount, notes, created_by, created_at, cancelled_at, cancel_reason,
  supplier:suppliers ( id, name, tax_id, email, phone ),
  purchase_items (
    id, company_id, purchase_id, product_id, quantity, unit_cost, subtotal, created_at,
    product:products ( name, sku, unit )
  )
`;

/**
 * Página de compras de la empresa, de la más reciente a la más antigua, con el total que
 * coincide con la búsqueda. Exclusivo master_admin (RLS).
 */
export async function fetchPurchasesPage(
  companyId: string,
  filters: PurchaseFilters,
  offset: number,
  limit: number = PURCHASES_PAGE_SIZE
): Promise<PurchasesPage> {
  let query = supabase
    .from('purchases')
    .select(PURCHASE_COLUMNS, { count: 'exact' })
    .eq('company_id', companyId);

  const search = buildSearchOrFilter(filters.search, ['purchase_number', 'invoice_number'], {
    column: 'supplier_id',
    ids: filters.matchingSupplierIds,
  });
  if (search) query = query.or(search);

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(error.message || 'Error al cargar las compras.');
  }

  const rows = data ?? [];
  return {
    total: count ?? rows.length,
    rows: rows.map((row) => ({
      id: row.id,
      companyId: row.company_id,
      purchaseNumber: row.purchase_number,
      supplierId: row.supplier_id,
      invoiceNumber: row.invoice_number,
      purchaseDate: row.purchase_date,
      status: row.status === 'cancelled' ? 'cancelled' : 'completed',
      subtotal: Number(row.subtotal),
      totalAmount: Number(row.total_amount),
      notes: row.notes,
      createdBy: row.created_by,
      createdAt: row.created_at,
      cancelledAt: row.cancelled_at,
      cancelReason: row.cancel_reason,
      supplier: row.supplier
        ? {
            id: row.supplier.id,
            name: row.supplier.name,
            taxId: row.supplier.tax_id,
            email: row.supplier.email,
            phone: row.supplier.phone,
          }
        : undefined,
      items: row.purchase_items.map((item) => ({
        id: item.id,
        companyId: item.company_id,
        purchaseId: item.purchase_id,
        productId: item.product_id,
        quantity: Number(item.quantity),
        unitCost: Number(item.unit_cost),
        subtotal: Number(item.subtotal),
        createdAt: item.created_at,
        product: item.product
          ? { name: item.product.name, sku: item.product.sku, unit: item.product.unit }
          : undefined,
      })),
    })),
  };
}

/** Cantidad y total de compras completadas (sin anuladas), calculados en el servidor. */
export async function fetchPurchasesSummary(companyId: string): Promise<{ count: number; total: number }> {
  const { data, error } = await supabase.rpc('purchases_summary', { p_company_id: companyId });
  if (error) {
    throw new Error(error.message || 'Error al calcular el resumen de compras.');
  }
  const row = data?.[0];
  return { count: Number(row?.completed_count ?? 0), total: Number(row?.completed_total ?? 0) };
}

/**
 * Invoca la RPC transaccional autoritativa public.process_purchase.
 * Los errores de red y de clave reutilizada se traducen a mensajes claros: ante un corte,
 * reintentar con la misma clave no duplica la compra.
 */
export async function processPurchaseRpc(
  companyId: string,
  input: CreatePurchaseInput
): Promise<{ purchaseId: string; purchaseNumber: string }> {
  const { data, error } = await supabase.rpc('process_purchase', {
    p_company_id: companyId,
    p_idempotency_key: input.idempotencyKey || crypto.randomUUID(),
    p_supplier_id: input.supplierId,
    p_items: input.items.map((item) => ({
      product_id: item.productId,
      quantity: item.quantity,
      unit_cost: item.unitCost,
    })),
    p_invoice_number: input.invoiceNumber?.trim() || undefined,
    p_purchase_date: input.purchaseDate || undefined,
    p_notes: input.notes?.trim() || undefined,
  });

  if (error) {
    if (isNetworkOrUncertainError(error.message)) {
      throw new Error(
        'No pudimos confirmar si la compra se registró por un problema de conexión. Reintentá: si ya se registró, no se va a duplicar.'
      );
    }
    if (error.message.includes('Idempotency key mismatch')) {
      throw new Error(
        'Un intento anterior de esta compra ya quedó registrado con otros datos. Revisá el listado antes de volver a cargarla.'
      );
    }
    throw new Error(error.message.replace(/^(P0001|error):\s*/i, '').trim());
  }

  const payload = data as { purchase_id: string; purchase_number: string };
  return { purchaseId: payload.purchase_id, purchaseNumber: payload.purchase_number };
}
