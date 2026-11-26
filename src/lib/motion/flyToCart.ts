import { prefersReducedMotion } from '../cartEffects';
import { bumpElement } from './flash';

const DURATION_MS = 520;
const GHOST_SIZE = 18;

/**
 * Una chispa de color viaja desde donde se agregó el producto hasta el botón del carrito, en arco.
 * Es solo decoración: se hace con la API de animaciones del navegador (sin librerías), no bloquea
 * nada (pointer-events: none) y se limpia sola. Si no hay origen o destino, no hace nada.
 */
export function flyToCart(origin: Element | null): void {
  const target = document.querySelector<HTMLElement>('[data-cart-target]');
  if (!origin || !target || prefersReducedMotion() || typeof document.body.animate !== 'function') return;

  const from = origin.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  if (from.width === 0 || to.width === 0) return; // elementos ocultos

  const startX = from.left + from.width / 2 - GHOST_SIZE / 2;
  const startY = from.top + from.height / 2 - GHOST_SIZE / 2;
  const dx = to.left + to.width / 2 - GHOST_SIZE / 2 - startX;
  const dy = to.top + to.height / 2 - GHOST_SIZE / 2 - startY;

  const ghost = document.createElement('div');
  ghost.setAttribute('aria-hidden', 'true');
  Object.assign(ghost.style, {
    position: 'fixed', left: `${startX}px`, top: `${startY}px`, width: `${GHOST_SIZE}px`, height: `${GHOST_SIZE}px`,
    borderRadius: '9999px', pointerEvents: 'none', zIndex: '90', willChange: 'transform, opacity',
    background: 'radial-gradient(circle at 35% 35%, #27d3f5, #2f6bff)', boxShadow: '0 0 14px 3px rgba(47, 107, 255, 0.65)',
  });
  document.body.appendChild(ghost);

  // Arco: sube un poco a mitad de camino y llega achicándose
  const lift = Math.min(90, Math.abs(dy) * 0.35 + 24);
  const animation = ghost.animate(
    [
      { transform: 'translate(0, 0) scale(1.1)', opacity: 0.95 },
      { transform: `translate(${dx * 0.55}px, ${dy * 0.55 - lift}px) scale(0.9)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.35)`, opacity: 0.25 },
    ],
    { duration: DURATION_MS, easing: 'cubic-bezier(0.45, 0, 0.2, 1)' }
  );
  const finish = () => {
    ghost.remove();
    bumpElement(target);
  };
  animation.onfinish = finish;
  animation.oncancel = () => ghost.remove();
}
