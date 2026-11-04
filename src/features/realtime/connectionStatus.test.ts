import { describe, expect, it, vi } from 'vitest';
import {
  getRealtimeState,
  resolveConnectionStatus,
  setRealtimeState,
  subscribeToRealtimeState,
} from './connectionStatus';

describe('resolveConnectionStatus', () => {
  it('sin internet siempre es "offline"', () => {
    expect(resolveConnectionStatus(false, 'connected')).toBe('offline');
  });

  it('con internet refleja el estado de Realtime', () => {
    expect(resolveConnectionStatus(true, 'connected')).toBe('online');
    expect(resolveConnectionStatus(true, 'connecting')).toBe('connecting');
    expect(resolveConnectionStatus(true, 'error')).toBe('degraded');
  });
});

describe('estado de Realtime', () => {
  it('avisa solo cuando el estado cambia', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToRealtimeState(listener);

    setRealtimeState('connected');
    setRealtimeState('connected');
    expect(getRealtimeState()).toBe('connected');
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    setRealtimeState('error');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
