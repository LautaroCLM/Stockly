import { useRef } from 'react';
import { animate, useMotionValue } from 'motion/react';

/** Deslizar más que esto hacia la derecha borra el aviso. */
const DISMISS_PX = 90;
/** Menos que esto es un clic, no un arrastre. */
const CLICK_SLOP_PX = 6;

/**
 * Deslizar a la derecha para borrar, con eventos de puntero (la app carga Motion sin el módulo de
 * arrastre para pesar menos). Devuelve el valor x para el estilo y los manejadores del elemento.
 */
export function useSwipeToDismiss(enabled: boolean, onDismiss: () => void) {
  const x = useMotionValue(0);
  const start = useRef<number | null>(null);
  const dragged = useRef(false);

  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (!enabled || e.button !== 0) return;
    start.current = e.clientX;
    dragged.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (start.current === null) return;
    const dx = Math.max(0, e.clientX - start.current);
    if (dx > CLICK_SLOP_PX) dragged.current = true;
    x.set(dx);
  };

  const finish = () => {
    if (start.current === null) return;
    start.current = null;
    if (x.get() > DISMISS_PX) {
      onDismiss();
    } else {
      void animate(x, 0, { type: 'spring', stiffness: 500, damping: 32 });
    }
  };

  /** Si hubo arrastre, el clic que llega al soltar no debe abrir el aviso. */
  const consumeClick = (): boolean => {
    const was = dragged.current;
    dragged.current = false;
    return was;
  };

  const shake = () => void animate(x, [0, -7, 6, -4, 3, 0], { duration: 0.45 });

  return {
    x,
    shake,
    consumeClick,
    handlers: { onPointerDown, onPointerMove, onPointerUp: finish, onPointerCancel: finish },
  };
}
