import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatDateShort } from './formatters';

describe('formatDateShort', () => {
  beforeEach(() => {
    vi.stubEnv('TZ', 'America/Argentina/Buenos_Aires');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('muestra una fecha sin hora como el mismo día, sin correrla por UTC', () => {
    expect(formatDateShort('2026-11-03')).toBe('03/11/2026');
    expect(formatDateShort('2026-01-01')).toBe('01/01/2026');
  });

  it('sigue formateando timestamps completos', () => {
    expect(formatDateShort('2026-11-03T15:00:00-03:00')).toBe('03/11/2026');
  });
});
