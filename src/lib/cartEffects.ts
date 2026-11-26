/**
 * Efectos al agregar al carrito (vuelo hasta el carrito y sonido). Son una comodidad de cada equipo:
 * se guardan en el navegador y, si no se puede guardar o leer, quedan los valores por defecto.
 */
export type CartEffect = 'fly' | 'sound';

const DEFAULTS: Record<CartEffect, boolean> = { fly: true, sound: true };
const storageKey = (effect: CartEffect) => `stockly_cart_effect_${effect}`;

export function readCartEffect(effect: CartEffect): boolean {
  try {
    const raw = localStorage.getItem(storageKey(effect));
    return raw === null ? DEFAULTS[effect] : raw === '1';
  } catch {
    return DEFAULTS[effect];
  }
}

export function writeCartEffect(effect: CartEffect, enabled: boolean): void {
  try {
    localStorage.setItem(storageKey(effect), enabled ? '1' : '0');
  } catch {
    // Sin almacenamiento disponible, el cambio vale solo hasta recargar
  }
}

/** Quien usa "reducir movimiento" en su sistema no ve animaciones de recorrido. */
export const prefersReducedMotion = (): boolean =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
