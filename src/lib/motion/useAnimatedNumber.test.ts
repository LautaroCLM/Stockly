import { describe, expect, it } from 'vitest';
import { easeOutCubic } from './useAnimatedNumber';

describe('easeOutCubic', () => {
  it('va de 0 a 1 sin retroceder', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    let previous = 0;
    for (let t = 0.05; t <= 1; t += 0.05) {
      const value = easeOutCubic(t);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it('con tiempo negativo daría valores bajo 0: por eso el progreso se acota antes de usarla', () => {
    expect(easeOutCubic(-0.1)).toBeLessThan(0);
  });
});
