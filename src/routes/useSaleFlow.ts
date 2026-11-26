import { useCallback, useState } from 'react';
import type { Customer } from '@/features/clientes/types';
import type { Product, Sale } from '@/features/inventario/types';
import type { useCart } from '@/features/inventario/hooks/useCart';
import { useCheckout } from '@/features/inventario/hooks/useCheckout';
import { useOpenCartShortcut } from '@/features/inventario/hooks/useOpenCartShortcut';
import { useSaleNotice } from '@/features/ventas/hooks/useSaleNotice';

interface SaleFlowOptions {
  companyId: string;
  cart: ReturnType<typeof useCart>;
  products: Product[];
  customers: Customer[];
  reloadProducts: () => Promise<void>;
  /** Quien puede anular ventas ve "Deshacer" en el aviso de venta. */
  canCancelSales: boolean;
}

/** Venta en mostrador: carrito abierto/cerrado, cobro, comprobante, aviso con Deshacer y atajo F4. */
export function useSaleFlow({ companyId, cart, products, customers, reloadProducts, canCancelSales }: SaleFlowOptions) {
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [receiptSale, setReceiptSale] = useState<Sale | null>(null);

  const closeReceiptAndReload = useCallback(() => {
    setReceiptSale(null);
    void reloadProducts();
  }, [reloadProducts]);
  const notifySale = useSaleNotice({ companyId, canCancel: canCancelSales, onUndone: closeReceiptAndReload });
  const showReceipt = useCallback((sale: Sale | null) => {
    setIsCartOpen(false);
    setReceiptSale(sale);
    if (sale) notifySale(sale);
  }, [notifySale]);

  const checkout = useCheckout({ companyId, cart, products, customers, reloadProducts, onSaleCompleted: showReceipt });

  const openCart = useCallback(() => setIsCartOpen(true), []);
  const closeCart = useCallback(() => setIsCartOpen(false), []);
  useOpenCartShortcut(openCart);

  const getItemQuantityInCart = useCallback(
    (productId: string) => cart.items.find((i) => i.productId === productId)?.quantity ?? 0,
    [cart.items]
  );

  return { isCartOpen, openCart, closeCart, receiptSale, setReceiptSale, checkout, getItemQuantityInCart };
}
