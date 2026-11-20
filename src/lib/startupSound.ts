/**
 * Sonido de bienvenida de Stockly, sintetizado con Web Audio (sin archivos de audio).
 * Un golpe grave suave, un acorde de La mayor que se abre en arpegio rápido y un brillo
 * agudo final, con un eco corto. Dura unos 2 segundos.
 *
 * Los navegadores bloquean el audio antes de que la persona interactúe con la página:
 * en ese caso no suena y no pasa nada. En la app de escritorio sí suena (ver tauri.conf.json).
 */

const PLAYED_KEY = 'stockly.startupSoundPlayed';
const MASTER_VOLUME = 0.22;

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

interface Voice {
  frequency: number;
  start: number;
  duration: number;
  gain: number;
  type: OscillatorType;
  detune?: number;
}

const VOICES: readonly Voice[] = [
  // Golpe grave
  { frequency: 110, start: 0, duration: 1.4, gain: 0.55, type: 'sine' },
  // Acorde La mayor (A3, E4, A4, C#5, E5) en arpegio rápido
  { frequency: 220, start: 0.02, duration: 1.8, gain: 0.22, type: 'triangle' },
  { frequency: 329.63, start: 0.06, duration: 1.8, gain: 0.18, type: 'triangle', detune: 4 },
  { frequency: 440, start: 0.1, duration: 1.8, gain: 0.16, type: 'sine', detune: -4 },
  { frequency: 554.37, start: 0.14, duration: 1.7, gain: 0.13, type: 'sine', detune: 3 },
  { frequency: 659.25, start: 0.18, duration: 1.7, gain: 0.12, type: 'sine', detune: -3 },
  // Brillo final
  { frequency: 1318.51, start: 0.3, duration: 1.3, gain: 0.05, type: 'sine' },
];

function playVoice(ctx: AudioContext, output: AudioNode, voice: Voice, at: number): void {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  const t0 = at + voice.start;

  osc.type = voice.type;
  osc.frequency.value = voice.frequency;
  osc.detune.value = voice.detune ?? 0;

  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(voice.gain, t0 + 0.04);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + voice.duration);

  osc.connect(env).connect(output);
  osc.start(t0);
  osc.stop(t0 + voice.duration + 0.05);
}

/** Eco corto y oscuro que da sensación de espacio. */
function createEcho(ctx: AudioContext, destination: AudioNode): AudioNode {
  const input = ctx.createGain();
  const delay = ctx.createDelay();
  const feedback = ctx.createGain();
  const tone = ctx.createBiquadFilter();
  const wet = ctx.createGain();

  delay.delayTime.value = 0.19;
  feedback.gain.value = 0.32;
  tone.type = 'lowpass';
  tone.frequency.value = 2200;
  wet.gain.value = 0.35;

  input.connect(destination);
  input.connect(delay);
  delay.connect(tone).connect(feedback).connect(delay);
  tone.connect(wet).connect(destination);
  return input;
}

export async function playStartupSound(): Promise<void> {
  if (alreadyPlayed()) return;
  if (typeof window.AudioContext !== 'function') return;

  try {
    const ctx = new AudioContext();
    if (ctx.state === 'suspended') await ctx.resume();
    if (ctx.state !== 'running') {
      await ctx.close();
      return;
    }

    const master = ctx.createGain();
    master.gain.value = MASTER_VOLUME;
    master.connect(ctx.destination);

    // El filtro se abre al principio: el sonido "despierta" en vez de arrancar de golpe
    const sweep = ctx.createBiquadFilter();
    sweep.type = 'lowpass';
    const now = ctx.currentTime + 0.02;
    sweep.frequency.setValueAtTime(500, now);
    sweep.frequency.exponentialRampToValueAtTime(7000, now + 0.45);
    sweep.connect(createEcho(ctx, master));

    VOICES.forEach((voice) => playVoice(ctx, sweep, voice, now));
    window.setTimeout(() => void ctx.close(), 3500);
  } catch {
    // El sonido es decorativo: si el audio falla, la app sigue igual.
  }
}
