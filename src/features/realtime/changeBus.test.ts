import { describe, expect, it, vi } from 'vitest';
import { affectsTables, emitDataChange, subscribeToDataChanges } from './changeBus';

describe('changeBus', () => {
  it('avisa a los oyentes y deja de avisar al desuscribirse', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToDataChanges(listener);

    emitDataChange('sales');
    expect(listener).toHaveBeenCalledWith('sales');

    unsubscribe();
    emitDataChange('products');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('filtra por las tablas que le importan a cada hook', () => {
    expect(affectsTables(['sales'], 'sales')).toBe(true);
    expect(affectsTables(['sales'], 'purchases')).toBe(false);
  });

  it('"all" afecta a cualquier hook', () => {
    expect(affectsTables(['suppliers'], 'all')).toBe(true);
  });
});
