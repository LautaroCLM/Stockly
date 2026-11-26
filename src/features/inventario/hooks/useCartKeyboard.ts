import { useEffect, useState } from 'react';
import type { CartItem } from '../types';
import { isCheckoutKey, isMinusKey, isPlusKey, isTypingTarget, moveSelection } from '../saleShortcuts';

interface CartKeyboardOptions {
  isOpen: boolean;
  items: CartItem[];
  canCheckout: boolean;
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemoveItem: (productId: string) => void;
  onCheckout: () => void;
}

/**
 * Manejo del carrito con teclado. La línea elegida arranca en la última agregada.
 * Flechas eligen, + y − cambian la cantidad, Supr la quita y F4 pasa al cobro.
 */
export function useCartKeyboard({ isOpen, items, canCheckout, onUpdateQuantity, onRemoveItem, onCheckout }: CartKeyboardOptions) {
  const [selectedIndex, setSelectedIndex] = useState(items.length - 1);

  // Si la lista cambia de tamaño, la selección vuelve a la última línea
  useEffect(() => {
    setSelectedIndex(items.length - 1);
  }, [items.length]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isCheckoutKey(e)) {
        e.preventDefault();
        if (canCheckout) onCheckout();
        return;
      }
      // En el campo de cantidad o de descuento, las teclas escriben normalmente
      if (isTypingTarget(e.target)) return;
      const selected = items[selectedIndex];
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((index) => moveSelection(index, items.length, e.key === 'ArrowDown' ? 1 : -1));
      } else if (selected && isPlusKey(e)) {
        e.preventDefault();
        onUpdateQuantity(selected.productId, selected.quantity + 1);
      } else if (selected && isMinusKey(e)) {
        e.preventDefault();
        if (selected.quantity > 1) onUpdateQuantity(selected.productId, selected.quantity - 1);
      } else if (selected && e.key === 'Delete') {
        e.preventDefault();
        onRemoveItem(selected.productId);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, items, selectedIndex, canCheckout, onUpdateQuantity, onRemoveItem, onCheckout]);

  return selectedIndex;
}
