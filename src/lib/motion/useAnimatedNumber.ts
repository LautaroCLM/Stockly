import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../cartEffects';

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Número que cuenta hacia su nuevo valor en vez de cambiar de golpe (200 ms por defecto).
 * Con "reducir movimiento" cambia directo. Siempre termina exactamente en `target`.
 */
export function useAnimatedNumber(target: number, durationMs = 220, startFromZero = false): number {
  const [shown, setShown] = useState(startFromZero ? 0 : target);
  const shownRef = useRef(shown);
  shownRef.current = shown;

  useEffect(() => {
    if (prefersReducedMotion() || durationMs <= 0 || shownRef.current === target) {
      setShown(target);
      return;
    }
    const from = shownRef.current;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      // El primer cuadro puede traer una hora anterior a la de inicio: el progreso nunca baja de 0
      const progress = Math.min(1, Math.max(0, (now - start) / durationMs));
      setShown(progress >= 1 ? target : from + (target - from) * easeOutCubic(progress));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);

  return shown;
}
