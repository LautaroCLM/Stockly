import { supabase } from '@/lib/supabase';

export interface ProcessSaleItemPayload {
  product_id: string;
  quantity: number;
}

export interface ProcessSalePaymentPayload {
  method: string;
  amount: number;
}

export interface ProcessSaleParams {
  companyId: string;
  idempotencyKey: string;
  items: ProcessSaleItemPayload[];
  discount?: number;
  payments?: ProcessSalePaymentPayload[];
  notes?: string;
}

export interface ProcessSaleRpcResponse {
  success: boolean;
  sale_id: string;
  sale_number: string;
  company_id: string;
  subtotal: number;
  discount: number;
  total_amount: number;
  status: 'completed';
  created_at: string;
}

export interface SaleItemRow {
  id: string;
  company_id: string;
  sale_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  created_at: string;
  product?: {
    name: string;
    sku: string;
  };
}

export interface SaleRow {
  id: string;
  company_id: string;
  sale_number: string;
  customer_id: string | null;
  status: 'completed' | 'cancelled';
  subtotal: number;
  discount: number;
  total_amount: number;
  payments: Array<{ method: string; amount: number }>;
  notes: string | null;
  created_by: string;
  created_at: string;
  sale_items?: SaleItemRow[];
}

/**
 * Invoca la RPC transaccional autoritativa public.process_sale
 */
export async function processSaleRpc(params: ProcessSaleParams): Promise<ProcessSaleRpcResponse> {
  const { data, error } = await (supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message: string } | null }>)(
    'process_sale',
    {
      p_company_id: params.companyId,
      p_idempotency_key: params.idempotencyKey,
      p_items: params.items,
      p_discount: params.discount ?? 0,
      p_payments: params.payments ?? [],
      p_notes: params.notes ?? null,
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  return data as ProcessSaleRpcResponse;
}

/**
 * Obtiene el historial de ventas de una empresa con sus ítems asociados.
 */
export async function fetchSales(companyId: string): Promise<SaleRow[]> {
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
  })('sales')
    .select(`
      id,
      company_id,
      sale_number,
      customer_id,
      status,
      subtotal,
      discount,
      total_amount,
      payments,
      notes,
      created_by,
      created_at,
      sale_items (
        id,
        company_id,
        sale_id,
        product_id,
        quantity,
        unit_price,
        subtotal,
        created_at,
        product:products (
          name,
          sku
        )
      )
    `)
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data || []) as SaleRow[];
}

/**
 * Obtiene el detalle completo de una venta individual por ID
 */
export async function fetchSaleById(companyId: string, saleId: string): Promise<SaleRow | null> {
  const { data, error } = await (supabase.from as unknown as (
    table: string
  ) => {
    select: (query: string) => {
      eq: (col: string, val: unknown) => {
        eq: (col2: string, val2: unknown) => {
          maybeSingle: () => Promise<{
            data: unknown;
            error: { message: string } | null;
          }>;
        };
      };
    };
  })('sales')
    .select(`
      id,
      company_id,
      sale_number,
      customer_id,
      status,
      subtotal,
      discount,
      total_amount,
      payments,
      notes,
      created_by,
      created_at,
      sale_items (
        id,
        company_id,
        sale_id,
        product_id,
        quantity,
        unit_price,
        subtotal,
        created_at,
        product:products (
          name,
          sku
        )
      )
    `)
    .eq('company_id', companyId)
    .eq('id', saleId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data || null) as SaleRow | null;
}
