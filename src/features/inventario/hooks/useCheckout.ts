import { useCallback, useRef, useState } from 'react';
import type { Customer } from '@/features/clientes/types';
import { toUserMessage } from '@/lib/errorMessages';
import { buildSaleRequest, executeSaleTransaction } from '../api/checkoutTransaction';
import type { CartItem, PaymentEntry, Product, Sale } from '../types';
import { useSaleIntent } from './useSaleIntent';

interface CheckoutCart {
  items: CartItem[];
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  total: number;
  clearCart: () => void;
}

interface UseCheckoutOptions {
  companyId: string;
  cart: CheckoutCart;
  products: Product[];
  customers: Customer[];
  reloadProducts: () => Promise<void>;
  /** Se llama tras una venta confirmada (cerrar carrito y cobro, mostrar ticket). */
  onSaleCompleted: (sale: Sale | null) => void;
}

/**
 * Cobro de la venta del carrito: valida, evita envíos concurrentes y reintentos duplicados
 * (misma clave de idempotencia para el mismo cobro) y ejecuta process_sale en el servidor.
 */
export function useCheckout({ companyId, cart, products, customers, reloadProducts, onSaleCompleted }: UseCheckoutOptions) {
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const isProcessingSaleRef = useRef(false);
  const { acquireKey, markUncertain, reset } = useSaleIntent();

  const confirmSale = useCallback(
    async (clientName: string, payments: PaymentEntry[], customerId?: string | null) => {
      if (cart.items.length === 0) {
        return { success: false, error: 'El carrito está vacío.' };
      }
      if (isProcessingSaleRef.current) {
        return { success: false, error: 'Ya se está procesando una operación de venta.' };
      }

      // Defensa en profundidad: no vender productos desactivados
      const inactiveItems = cart.items.filter((item) => {
        const prod = products.find((p) => p.id === item.productId);
        return prod && prod.isActive === false;
      });
      if (inactiveItems.length > 0) {
        const names = inactiveItems.map((i) => `"${i.name}" (${i.sku})`).join(', ');
        return {
          success: false,
          error: `No se puede confirmar la venta porque el carrito contiene productos desactivados:\n${names}\n\nPor favor, quítalos del carrito o reactívalos en el catálogo antes de continuar.`,
        };
      }

      isProcessingSaleRef.current = true;
      try {
        const found = customerId ? customers.find((c) => c.id === customerId) : undefined;
        const customerDoc = found?.taxId ? `${found.identificationType} ${found.taxId}` : null;

        const saleParams = {
          tenantId: companyId,
          customerId,
          customerDoc,
          clientName,
          payments,
          cartItems: cart.items,
          cartSubtotal: cart.subtotal,
          discountPercent: cart.discountPercent,
          discountAmount: cart.discountAmount,
          cartTotal: cart.total,
        };
        const saleRequest = buildSaleRequest(saleParams);

        // Misma clave en los reintentos del mismo cobro: el servidor no duplica la venta
        const idempotencyKey = acquireKey(companyId, JSON.stringify(saleRequest));
        const result = await executeSaleTransaction(saleParams, saleRequest, idempotencyKey);

        if (!result.success) {
          if (result.isNetworkError) markUncertain();
          else if (result.isIdempotencyConflict) reset();
          return { success: false, error: result.error || 'No se pudo completar la venta.' };
        }

        reset();
        reloadProducts().catch((err) => console.warn('Error al recargar productos:', err));
        cart.clearCart();
        setIsCheckoutOpen(false);
        onSaleCompleted(result.sale || null);
        return { success: true };
      } catch (err) {
        return { success: false, error: toUserMessage(err, 'Error inesperado al procesar la venta.') };
      } finally {
        isProcessingSaleRef.current = false;
      }
    },
    [companyId, cart, products, customers, reloadProducts, onSaleCompleted, acquireKey, markUncertain, reset]
  );

  return { isCheckoutOpen, setIsCheckoutOpen, confirmSale };
}
