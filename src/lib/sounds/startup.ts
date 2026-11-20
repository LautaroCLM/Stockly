import { playSound, type SoundSpec } from './engine';

/**
 * Bienvenida (~2 s): golpe grave suave, acorde de La mayor en arpegio rápido y un brillo agudo final.
 * En la app de escritorio suena aunque no haya interacción (ver tauri.conf.json).
 */
const STARTUP: SoundSpec = {
  volume: 0.22,
  echo: { delay: 0.19, feedback: 0.32, wet: 0.35 },
  sweep: { from: 500, to: 7000, time: 0.45 },
  voices: [
    { frequency: 110, start: 0, duration: 1.4, gain: 0.55, type: 'sine' },
    { frequency: 220, start: 0.02, duration: 1.8, gain: 0.22, type: 'triangle' },
    { frequency: 329.63, start: 0.06, duration: 1.8, gain: 0.18, type: 'triangle', detune: 4 },
    { frequency: 440, start: 0.1, duration: 1.8, gain: 0.16, type: 'sine', detune: -4 },
    { frequency: 554.37, start: 0.14, duration: 1.7, gain: 0.13, type: 'sine', detune: 3 },
    { frequency: 659.25, start: 0.18, duration: 1.7, gain: 0.12, type: 'sine', detune: -3 },
    { frequency: 1318.51, start: 0.3, duration: 1.3, gain: 0.05, type: 'sine' },
  ],
};

const PLAYED_KEY = 'stockly.startupSoundPlayed';

/** Una vez por apertura: recargar la página dentro de la misma sesión no lo repite. */
function alreadyPlayed(): boolean {
  try {
    if (sessionStorage.getItem(PLAYED_KEY)) return true;
    sessionStorage.setItem(PLAYED_KEY, '1');
    return false;
  } catch {
    return false;
  }
}

export function playStartupSound(): void {
  if (alreadyPlayed()) return;
  void playSound(STARTUP);
}
