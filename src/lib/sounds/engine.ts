/**
 * Motor mínimo de sonidos sintetizados con Web Audio (sin archivos de audio).
 * Cada sonido es una lista de "voces": un oscilador con su envolvente.
 * Si el navegador bloquea el audio (no hubo interacción todavía) o falla, no suena y la app sigue igual.
 */

export interface Voice {
  frequency: number;
  /** Segundos desde el inicio del sonido. */
  start: number;
  duration: number;
  gain: number;
  type: OscillatorType;
  detune?: number;
  /** Segundos que tarda en llegar al volumen máximo. */
  attack?: number;
}

export interface SoundSpec {
  voices: readonly Voice[];
  volume: number;
  /** Eco corto para dar sensación de espacio. */
  echo?: { delay: number; feedback: number; wet: number };
  /** Filtro que se abre al inicio: el sonido "despierta" en vez de arrancar de golpe. */
  sweep?: { from: number; to: number; time: number };
}

let sharedContext: AudioContext | null = null;

async function getContext(): Promise<AudioContext | null> {
  if (typeof window.AudioContext !== 'function') return null;
  sharedContext ??= new AudioContext();
  if (sharedContext.state === 'suspended') await sharedContext.resume();
  return sharedContext.state === 'running' ? sharedContext : null;
}

function playVoice(ctx: AudioContext, output: AudioNode, voice: Voice, at: number): void {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  const t0 = at + voice.start;

  osc.type = voice.type;
  osc.frequency.value = voice.frequency;
  osc.detune.value = voice.detune ?? 0;

  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(voice.gain, t0 + (voice.attack ?? 0.04));
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + voice.duration);

  osc.connect(env).connect(output);
  osc.start(t0);
  osc.stop(t0 + voice.duration + 0.05);
}

function createEcho(ctx: AudioContext, destination: AudioNode, echo: NonNullable<SoundSpec['echo']>): AudioNode {
  const input = ctx.createGain();
  const delay = ctx.createDelay();
  const feedback = ctx.createGain();
  const tone = ctx.createBiquadFilter();
  const wet = ctx.createGain();

  delay.delayTime.value = echo.delay;
  feedback.gain.value = echo.feedback;
  tone.type = 'lowpass';
  tone.frequency.value = 2200;
  wet.gain.value = echo.wet;

  input.connect(destination);
  input.connect(delay);
  delay.connect(tone).connect(feedback).connect(delay);
  tone.connect(wet).connect(destination);
  return input;
}

export async function playSound(spec: SoundSpec): Promise<void> {
  try {
    const ctx = await getContext();
    if (!ctx) return;

    const now = ctx.currentTime + 0.02;
    const master = ctx.createGain();
    master.gain.value = spec.volume;
    master.connect(ctx.destination);

    let input: AudioNode = spec.echo ? createEcho(ctx, master, spec.echo) : master;

    if (spec.sweep) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(spec.sweep.from, now);
      filter.frequency.exponentialRampToValueAtTime(spec.sweep.to, now + spec.sweep.time);
      filter.connect(input);
      input = filter;
    }

    spec.voices.forEach((voice) => playVoice(ctx, input, voice, now));
  } catch {
    // El sonido es decorativo: si el audio falla, la app sigue igual.
  }
}
