import { describe, expect, it } from 'vitest';
import { localDateInputValue } from './localDate';

describe('localDateInputValue', () => {
  it('usa el calendario local y no el UTC', () => {
    // 23:30 local del 3 de noviembre: en UTC-3 ya sería 4 de noviembre
    const lateNight = new Date(2026, 10, 3, 23, 30);
    expect(localDateInputValue(lateNight)).toBe('2026-11-03');
  });

  it('completa mes y día con dos dígitos', () => {
    expect(localDateInputValue(new Date(2026, 0, 5, 10, 0))).toBe('2026-01-05');
  });
});
