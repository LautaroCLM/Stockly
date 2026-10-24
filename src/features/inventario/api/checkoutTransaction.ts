import { TenantId } from '@/types';
import { CartItem, PaymentEntry, Sale } from '../types';
import { processSaleRpc, ProcessSaleParams } from './salesApi';

export interface ExecuteSaleParams {
  tenantId: TenantId;
  clientName: string;
  payments: PaymentEntry[];
  cartItems: CartItem[];
  cartSubtotal: number;
  discountPercent: number;
  discountAmount: number;
  cartTotal: number;
  idempotencyKey?: string;
  notes?: string;
}

export interface CheckoutTransactionResult {
  success: boolean;
  error?: string;
  isNetworkError?: boolean;
  sale?: Sale;
}

/**
 * Ejecuta la venta transaccional contra Supabase mediante la RPC autoritativa public.process_sale.
 * El backend es la única fuente de verdad para existencias, precios históricos y correlatividad.
 */
export async function executeSaleTransaction(
  params: ExecuteSaleParams
): Promise<CheckoutTransactionResult> {
  const {
    tenantId,
    clientName,
    payments,
    cartItems,
    discountAmount,
    idempotencyKey,
    notes,
  } = params;

  if (!cartItems || cartItems.length === 0) {
    return { success: false, error: 'El carrito no contiene productos.' };
  }

  // Generar o reusar la clave de intención de venta
  const effectiveIdempotencyKey = idempotencyKey || crypto.randomUUID();

  // Mapear items a payload esperado por process_sale
  const rpcItems = cartItems.map((item) => ({
    product_id: item.productId,
    quantity: item.quantity,
  }));

  // Mapear medios de pago
  const rpcPayments = payments.map((p) => ({
    method: p.method,
    amount: p.amount,
  }));

  const rpcParams: ProcessSaleParams = {
    companyId: tenantId,
    idempotencyKey: effectiveIdempotencyKey,
    items: rpcItems,
    discount: discountAmount > 0 ? discountAmount : 0,
    payments: rpcPayments,
    notes: notes || (clientName ? `Cliente: ${clientName}` : undefined),
  };

  try {
    const rpcResponse = await processSaleRpc(rpcParams);

    // Mapear la respuesta de PostgreSQL al objeto Sale consumido por la UI y el comprobante
    const mappedSale: Sale = {
      id: rpcResponse.sale_id,
      tenantId,
      saleNumber: rpcResponse.sale_number,
      createdAt: rpcResponse.created_at,
      clientName: clientName || 'Consumidor Final',
      items: cartItems.map((ci) => ({
        ...ci,
      })),
      subtotal: rpcResponse.subtotal,
      discountPercent: params.discountPercent,
      discountAmount: rpcResponse.discount,
      total: rpcResponse.total_amount,
      payments,
      status: 'completada',
    };

    return {
      success: true,
      sale: mappedSale,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido al registrar la venta.';

    // Detectar si el fallo puede ser de red/transporte
    const isNetworkError =
      message.toLowerCase().includes('failed to fetch') ||
      message.toLowerCase().includes('network') ||
      message.toLowerCase().includes('timeout');

    return {
      success: false,
      error: message,
      isNetworkError,
    };
  }
}
