import { playSound, type SoundSpec } from './engine';

/**
 * Venta confirmada (~0,8 s): dos notas brillantes que suben (Mi → La), con un armónico
 * suave encima. Se siente como "cobrado" sin ser una caja registradora.
 */
const SALE: SoundSpec = {
  volume: 0.2,
  echo: { delay: 0.12, feedback: 0.2, wet: 0.25 },
  voices: [
    { frequency: 659.25, start: 0, duration: 0.45, gain: 0.3, type: 'sine', attack: 0.008 },
    { frequency: 1318.51, start: 0, duration: 0.3, gain: 0.06, type: 'sine', attack: 0.008 },
    { frequency: 880, start: 0.09, duration: 0.7, gain: 0.32, type: 'sine', attack: 0.008 },
    { frequency: 1760, start: 0.09, duration: 0.45, gain: 0.07, type: 'sine', attack: 0.008 },
    { frequency: 440, start: 0.09, duration: 0.6, gain: 0.12, type: 'triangle', attack: 0.01 },
  ],
};

export function playSaleSound(): void {
  void playSound(SALE);
}
