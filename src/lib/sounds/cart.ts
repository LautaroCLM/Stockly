import { playSound, type SoundSpec } from './engine';

/**
 * Producto agregado al carrito (~0,12 s): un toque corto y suave, mucho más tenue que el de venta
 * para que se pueda escuchar decenas de veces sin cansar.
 */
const ADD_TO_CART: SoundSpec = {
  volume: 0.1,
  voices: [
    { frequency: 1174.66, start: 0, duration: 0.11, gain: 0.22, type: 'sine', attack: 0.004 },
    { frequency: 1567.98, start: 0.035, duration: 0.1, gain: 0.1, type: 'sine', attack: 0.004 },
  ],
};

export function playAddToCartSound(): void {
  void playSound(ADD_TO_CART);
}
