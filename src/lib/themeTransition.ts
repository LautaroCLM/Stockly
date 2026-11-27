import { prefersReducedMotion } from './cartEffects';

export interface ThemeOrigin {
  x: number;
  y: number;
}

const REVEAL_MS = 650;
const FADE_MS = 380;
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

/**
 * Cambia el tema con una animación: el tema nuevo se revela como un círculo que nace en `origin`
 * (el botón del tema) y crece hasta cubrir toda la pantalla.
 * - Con "reducir movimiento" el cambio es instantáneo.
 * - Si el navegador no tiene transiciones de vista, hace un fundido suave de colores.
 * `applyChange` debe cambiar el tema de forma síncrona (clases y color-scheme del <html>).
 */
export function transitionTheme(applyChange: () => void, origin?: ThemeOrigin): void {
  if (prefersReducedMotion()) {
    applyChange();
    return;
  }

  const root = document.documentElement;
  if (typeof document.startViewTransition !== 'function') {
    root.classList.add('theme-switching');
    applyChange();
    window.setTimeout(() => root.classList.remove('theme-switching'), FADE_MS + 50);
    return;
  }

  const x = origin?.x ?? window.innerWidth / 2;
  const y = origin?.y ?? 0;
  // Radio hasta la esquina más lejana: el círculo siempre termina cubriendo todo
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

  const transition = document.startViewTransition(applyChange);
  transition.ready
    .then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: REVEAL_MS, easing: EASE, pseudoElement: '::view-transition-new(root)' }
      );
    })
    .catch(() => {
      // Si la transición se cancela, el tema ya quedó aplicado por applyChange
    });
}
