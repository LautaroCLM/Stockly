import { useState, useEffect, useCallback } from 'react';
import { TenantId } from '@/types';
import { CartItem, Product, CartState } from '../types';

const USER_ID = 'admin';

function getStorageKey(tenantId: TenantId): string {
  return `stockly_cart_${tenantId}_${USER_ID}_v1`;
}

function calculateTotals(items: CartItem[], discountPercent: number): CartState {
  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const clampedDiscount = Math.max(0, Math.min(100, discountPercent));
  const discountAmount = Math.round((subtotal * clampedDiscount) / 100);
  const total = Math.max(0, subtotal - discountAmount);

  return {
    items,
    discountPercent: clampedDiscount,
    subtotal,
    discountAmount,
    total,
  };
}

function loadCartFromStorage(tenantId: TenantId): CartState {
  try {
    const raw = localStorage.getItem(getStorageKey(tenantId));
    if (!raw) return { items: [], discountPercent: 0, subtotal: 0, discountAmount: 0, total: 0 };

    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items)) {
      return { items: [], discountPercent: 0, subtotal: 0, discountAmount: 0, total: 0 };
    }

    // Validate item shapes
    const validItems: CartItem[] = parsed.items.filter(
      (item: unknown): item is CartItem =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as CartItem).productId === 'string' &&
        typeof (item as CartItem).unitPrice === 'number' &&
        typeof (item as CartItem).quantity === 'number' &&
        (item as CartItem).quantity > 0
    );

    const discount = typeof parsed.discountPercent === 'number' ? parsed.discountPercent : 0;
    return calculateTotals(validItems, discount);
  } catch (err) {
    console.warn(`Error al leer el carrito de ${tenantId} desde localStorage:`, err);
    return { items: [], discountPercent: 0, subtotal: 0, discountAmount: 0, total: 0 };
  }
}

function saveCartToStorage(tenantId: TenantId, state: CartState): void {
  try {
    localStorage.setItem(
      getStorageKey(tenantId),
      JSON.stringify({
        items: state.items,
        discountPercent: state.discountPercent,
      })
    );
  } catch (err) {
    console.warn(`Error al guardar el carrito de ${tenantId} en localStorage:`, err);
  }
}

export function useCart(tenantId: TenantId) {
  const [cartState, setCartState] = useState<CartState>(() => loadCartFromStorage(tenantId));

  // Reload when active company changes
  useEffect(() => {
    setCartState(loadCartFromStorage(tenantId));
  }, [tenantId]);

  // Persist whenever items or discount changes
  useEffect(() => {
    saveCartToStorage(tenantId, cartState);
  }, [tenantId, cartState]);

  const addItem = useCallback((product: Product, quantity = 1) => {
    if (product.isActive === false) {
      console.warn(`No se puede agregar al carrito el producto desactivado "${product.name}" (${product.sku})`);
      return;
    }

    setCartState((prev) => {
      const existingIndex = prev.items.findIndex((item) => item.productId === product.id);
      let updatedItems: CartItem[];

      if (existingIndex >= 0) {
        updatedItems = prev.items.map((item, index) => {
          if (index === existingIndex) {
            const newQty = item.quantity + quantity;
            return {
              ...item,
              quantity: newQty,
              subtotal: newQty * item.unitPrice,
            };
          }
          return item;
        });
      } else {
        const newItem: CartItem = {
          productId: product.id,
          sku: product.sku,
          name: product.name,
          unitPrice: product.salePrice,
          quantity: Math.max(1, quantity),
          subtotal: Math.max(1, quantity) * product.salePrice,
          currentStock: product.stock,
        };
        updatedItems = [...prev.items, newItem];
      }

      return calculateTotals(updatedItems, prev.discountPercent);
    });
  }, []);

  const updateQuantity = useCallback((productId: string, quantity: number) => {
    setCartState((prev) => {
      if (quantity <= 0) {
        const filtered = prev.items.filter((item) => item.productId !== productId);
        return calculateTotals(filtered, prev.discountPercent);
      }

      const updatedItems = prev.items.map((item) => {
        if (item.productId === productId) {
          return {
            ...item,
            quantity,
            subtotal: quantity * item.unitPrice,
          };
        }
        return item;
      });

      return calculateTotals(updatedItems, prev.discountPercent);
    });
  }, []);

  const removeItem = useCallback((productId: string) => {
    setCartState((prev) => {
      const filtered = prev.items.filter((item) => item.productId !== productId);
      return calculateTotals(filtered, prev.discountPercent);
    });
  }, []);

  const setDiscount = useCallback((percent: number) => {
    setCartState((prev) => calculateTotals(prev.items, percent));
  }, []);

  const clearCart = useCallback(() => {
    setCartState({
      items: [],
      discountPercent: 0,
      subtotal: 0,
      discountAmount: 0,
      total: 0,
    });
  }, []);

  const totalItemsCount = cartState.items.reduce((acc, curr) => acc + curr.quantity, 0);

  return {
    cartState,
    items: cartState.items,
    subtotal: cartState.subtotal,
    discountPercent: cartState.discountPercent,
    discountAmount: cartState.discountAmount,
    total: cartState.total,
    totalItemsCount,
    addItem,
    updateQuantity,
    removeItem,
    setDiscount,
    clearCart,
  };
}
