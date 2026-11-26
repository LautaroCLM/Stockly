import { useEffect, useRef } from 'react';
import { isCheckoutKey } from '../saleShortcuts';

/** Etiquetas sobre las que Enter conserva su función normal (apretar un botón, abrir una lista). */
const ENTER_KEEPS_DEFAULT = ['BUTTON', 'SELECT', 'TEXTAREA', 'A'];

/**
 * Teclado del cobro: Esc cancela; Enter o F4 confirman la venta.
 * Enter no confirma sobre botones, listas ni dentro de un bloque marcado con `data-enter-ignore`
 * (el buscador de clientes). Devuelve una referencia que el modal actualiza con su acción de confirmar.
 */
export function useCheckoutKeyboard(isOpen: boolean, isSubmitting: boolean, onClose: () => void) {
  const confirmRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen || isSubmitting) return;
      if (e.key === 'Escape') return onClose();
      const target = e.target instanceof HTMLElement ? e.target : null;
      const enterIgnored =
        target !== null && (ENTER_KEEPS_DEFAULT.includes(target.tagName) || target.closest('[data-enter-ignore]') !== null);
      if (isCheckoutKey(e) || (e.key === 'Enter' && !enterIgnored)) {
        e.preventDefault();
        confirmRef.current();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  return confirmRef;
}
