import { TenantId } from '@/types';
import { CartItem, PaymentEntry, Sale } from '../types';
import { isIdempotencyMismatchError } from '../saleIntent';
import { processSaleRpc, ProcessSaleParams } from './salesApi';
import { isNetworkOrUncertainError } from '@/lib/errorMessages';
import { toUserMessage } from '@/lib/errorMessages';

export interface ExecuteSaleParams {
  tenantId: TenantId;
  clientName: string;
  customerId?: string | null;
  customerDoc?: string | null;
  payments: PaymentEntry[];
  cartItems: CartItem[];
  cartSubtotal: number;
  discountPercent: number;
  discountAmount: number;
  cartTotal: number;
  notes?: string;
}

/** Parámetros de process_sale sin la clave: define la "huella" del pedido. */
export type SaleRequest = Omit<ProcessSaleParams, 'idempotencyKey'>;

export interface CheckoutTransactionResult {
  success: boolean;
  error?: string;
  /** No se sabe si la venta quedó registrada: reintentar con la misma clave. */
  isNetworkError?: boolean;
  /** La clave ya se usó con otros datos: un intento anterior quedó registrado. */
  isIdempotencyConflict?: boolean;
  sale?: Sale;
}

/**
 * Traduce el carrito al payload exacto que recibe process_sale.
 */
export function buildSaleRequest(params: ExecuteSaleParams): SaleRequest {
  const { tenantId, clientName, payments, cartItems, discountAmount, notes } = params;

  return {
    companyId: tenantId,
    items: cartItems.map((item) => ({
      product_id: item.productId,
      quantity: item.quantity,
    })),
    discount: discountAmount > 0 ? discountAmount : 0,
    payments: payments.map((p) => ({
      method: p.method,
      amount: p.amount,
    })),
    notes: notes || (clientName ? `Cliente: ${clientName}` : undefined),
    customerId: params.customerId || null,
  };
}

/**
 * Ejecuta la venta transaccional contra Supabase mediante la RPC autoritativa public.process_sale.
 * El backend es la única fuente de verdad para existencias, precios históricos y correlatividad.
 * La clave de idempotencia la provee quien llama, para poder reutilizarla en los reintentos.
 */
export async function executeSaleTransaction(
  params: ExecuteSaleParams,
  request: SaleRequest,
  idempotencyKey: string
): Promise<CheckoutTransactionResult> {
  const { tenantId, clientName, payments, cartItems } = params;

  if (!cartItems || cartItems.length === 0) {
    return { success: false, error: 'El carrito no contiene productos.' };
  }

  try {
    const rpcResponse = await processSaleRpc({ ...request, idempotencyKey });

    // Mapear la respuesta de PostgreSQL al objeto Sale consumido por la UI y el comprobante
    const mappedSale: Sale = {
      id: rpcResponse.sale_id,
      tenantId,
      saleNumber: rpcResponse.sale_number,
      createdAt: rpcResponse.created_at,
      clientName: clientName || 'Consumidor Final',
      customerId: params.customerId || null,
      customerDoc: params.customerDoc || null,
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
    const message = toUserMessage(err, 'Error desconocido al registrar la venta.');

    if (isIdempotencyMismatchError(message)) {
      return {
        success: false,
        isIdempotencyConflict: true,
        error:
          'Un intento anterior de esta venta ya quedó registrado con otros datos. Revisá el historial de Ventas antes de volver a cobrar.',
      };
    }

    if (isNetworkOrUncertainError(err)) {
      return {
        success: false,
        isNetworkError: true,
        error:
          'No pudimos confirmar si la venta se registró por un problema de conexión. Reintentá: si ya se registró, no se va a duplicar.',
      };
    }

    return {
      success: false,
      error: message,
    };
  }
}
