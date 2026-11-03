import { supabase } from '@/lib/supabase';
import type { Purchase, PurchaseItem, CreatePurchaseInput } from '../types';

interface RawPurchaseItemRow {
  id: string;
  company_id: string;
  purchase_id: string;
  product_id: string;
  quantity: number | string;
  unit_cost: number | string;
  subtotal: number | string;
  created_at: string;
  product?: {
    name: string;
    sku: string;
    unit?: string;
  } | null;
}

interface RawPurchaseRow {
  id: string;
  company_id: string;
  purchase_number: string;
  supplier_id: string;
  invoice_number: string | null;
  purchase_date: string;
  status: 'completed' | 'cancelled';
  subtotal: number | string;
  total_amount: number | string;
  notes: string | null;
  created_by: string;
  created_at: string;
  supplier?: {
    id: string;
    name: string;
    tax_id: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  purchase_items?: RawPurchaseItemRow[] | null;
}

interface ProcessPurchaseRpcResponse {
  success: boolean;
  purchase_id: string;
  purchase_number: string;
  company_id: string;
  supplier_id: string;
  invoice_number: string | null;
  purchase_date: string;
  subtotal: number;
  total_amount: number;
  status: 'completed';
  created_at: string;
}

function mapItemRow(row: RawPurchaseItemRow): PurchaseItem {
  return {
    id: row.id,
    companyId: row.company_id,
    purchaseId: row.purchase_id,
    productId: row.product_id,
    quantity: typeof row.quantity === 'number' ? row.quantity : parseFloat(row.quantity),
    unitCost: typeof row.unit_cost === 'number' ? row.unit_cost : parseFloat(row.unit_cost),
    subtotal: typeof row.subtotal === 'number' ? row.subtotal : parseFloat(row.subtotal),
    createdAt: row.created_at,
    product: row.product ? {
      name: row.product.name,
      sku: row.product.sku,
      unit: row.product.unit,
    } : undefined,
  };
}

function mapPurchaseRow(row: RawPurchaseRow): Purchase {
  return {
    id: row.id,
    companyId: row.company_id,
    purchaseNumber: row.purchase_number,
    supplierId: row.supplier_id,
    invoiceNumber: row.invoice_number,
    purchaseDate: row.purchase_date,
    status: row.status,
    subtotal: typeof row.subtotal === 'number' ? row.subtotal : parseFloat(row.subtotal),
    totalAmount: typeof row.total_amount === 'number' ? row.total_amount : parseFloat(row.total_amount),
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    supplier: row.supplier ? {
      id: row.supplier.id,
      name: row.supplier.name,
      taxId: row.supplier.tax_id,
      email: row.supplier.email,
      phone: row.supplier.phone,
    } : undefined,
    items: row.purchase_items ? row.purchase_items.map(mapItemRow) : [],
  };
}

/**
 * Consulta la lista de compras de la empresa con sus proveedores y líneas de compra.
 * Exclusivo master_admin (RLS enforced).
 */
export async function fetchPurchases(companyId: string): Promise<Purchase[]> {
  const { data, error } = await (supabase.from as unknown as (
    table: string
  ) => {
    select: (query: string) => {
      eq: (col: string, val: unknown) => {
        order: (col: string, opts: { ascending: boolean }) => Promise<{
          data: unknown;
          error: { message: string } | null;
        }>;
      };
    };
  })('purchases')
    .select(`
      id,
      company_id,
      purchase_number,
      supplier_id,
      invoice_number,
      purchase_date,
      status,
      subtotal,
      total_amount,
      notes,
      created_by,
      created_at,
      supplier:suppliers (
        id,
        name,
        tax_id,
        email,
        phone
      ),
      purchase_items (
        id,
        company_id,
        purchase_id,
        product_id,
        quantity,
        unit_cost,
        subtotal,
        created_at,
        product:products (
          name,
          sku,
          unit
        )
      )
    `)
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data || []) as RawPurchaseRow[];
  return rows.map(mapPurchaseRow);
}

/**
 * Invoca la RPC transaccional autoritativa public.process_purchase.
 */
export async function processPurchaseRpc(
  companyId: string,
  input: CreatePurchaseInput
): Promise<ProcessPurchaseRpcResponse> {
  const effectiveIdempotencyKey = input.idempotencyKey || crypto.randomUUID();

  const rpcItems = input.items.map((item) => ({
    product_id: item.productId,
    quantity: item.quantity,
    unit_cost: item.unitCost,
  }));

  const { data, error } = await (supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message: string } | null }>)(
    'process_purchase',
    {
      p_company_id: companyId,
      p_idempotency_key: effectiveIdempotencyKey,
      p_supplier_id: input.supplierId,
      p_items: rpcItems,
      p_invoice_number: input.invoiceNumber?.trim() || null,
      p_purchase_date: input.purchaseDate || null,
      p_notes: input.notes?.trim() || null,
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  return data as ProcessPurchaseRpcResponse;
}
