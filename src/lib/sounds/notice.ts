import { playSound, type SoundSpec } from './engine';

/**
 * Aviso nuevo (~0,6 s): dos toques suaves que bajan (La → Mi), como una campanita discreta.
 * Más tenue que el de venta para no sobresaltar.
 */
const NOTICE: SoundSpec = {
  volume: 0.16,
  echo: { delay: 0.15, feedback: 0.22, wet: 0.3 },
  voices: [
    { frequency: 1760, start: 0, duration: 0.35, gain: 0.18, type: 'sine', attack: 0.005 },
    { frequency: 880, start: 0, duration: 0.4, gain: 0.1, type: 'triangle', attack: 0.005 },
    { frequency: 1318.51, start: 0.13, duration: 0.5, gain: 0.18, type: 'sine', attack: 0.005 },
    { frequency: 659.25, start: 0.13, duration: 0.55, gain: 0.1, type: 'triangle', attack: 0.005 },
  ],
};

export function playNoticeSound(): void {
  void playSound(NOTICE);
}
