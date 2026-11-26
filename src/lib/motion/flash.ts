import { prefersReducedMotion } from '../cartEffects';

/** Destello azul breve sobre un elemento (por ejemplo, una línea del carrito a la que se le sumó una unidad). */
export function flashElement(el: HTMLElement | null): void {
  if (!el || prefersReducedMotion() || typeof el.animate !== 'function') return;
  el.animate(
    [
      { boxShadow: '0 0 0 0 rgba(47, 107, 255, 0.45)', backgroundColor: 'rgba(47, 107, 255, 0.18)' },
      { boxShadow: '0 0 0 10px rgba(47, 107, 255, 0)', backgroundColor: 'rgba(47, 107, 255, 0)' },
    ],
    { duration: 650, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
  );
}

/** Pequeño rebote de un elemento (por ejemplo, el botón del carrito cuando le llega un producto). */
export function bumpElement(el: HTMLElement | null): void {
  if (!el || prefersReducedMotion() || typeof el.animate !== 'function') return;
  el.animate(
    [{ transform: 'scale(1)' }, { transform: 'scale(1.1)', offset: 0.35 }, { transform: 'scale(1)' }],
    { duration: 380, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
  );
}
