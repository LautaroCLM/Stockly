import { useEffect } from 'react';
import { isCheckoutKey, isDialogOpen } from '../saleShortcuts';

/**
 * F4 abre el carrito desde cualquier pantalla. Con el carrito o el cobro abiertos,
 * F4 lo manejan ellos (pasar al cobro / confirmar), por eso acá solo actúa sin ventanas abiertas.
 */
export function useOpenCartShortcut(openCart: () => void) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isCheckoutKey(e) || isDialogOpen()) return;
      e.preventDefault();
      openCart();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openCart]);
}
