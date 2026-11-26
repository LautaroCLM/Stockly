import { useCallback } from 'react';
import { prefersReducedMotion, readCartEffect } from '@/lib/cartEffects';
import { flyToCart } from '@/lib/motion/flyToCart';
import { playAddToCartSound } from '@/lib/sounds/cart';

/**
 * Respuesta visual y sonora al agregar un producto al carrito: una chispa que vuela hasta el botón
 * del carrito y un toque suave. Cada persona puede apagarlos en Mis preferencias.
 * El origen es el elemento que tiene el foco (el botón apretado, la fila o el buscador del lector).
 */
export function useCartFeedback() {
  return useCallback(() => {
    if (readCartEffect('fly') && !prefersReducedMotion()) {
      const origin = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
      flyToCart(origin);
    }
    if (readCartEffect('sound')) playAddToCartSound();
  }, []);
}
