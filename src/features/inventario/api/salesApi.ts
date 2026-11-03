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
  customerId?: string | null;
}

export interface ProcessSaleRpcResponse {
  success: boolean;
  sale_id: string;
  sale_number: string;
  company_id: string;
  customer_id: string | null;
  subtotal: number;
  discount: number;
  total_amount: number;
  status: 'completed';
  created_at: string;
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
      p_customer_id: params.customerId || null,
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  return data as ProcessSaleRpcResponse;
}
