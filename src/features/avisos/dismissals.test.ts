import { describe, expect, it } from 'vitest';
import { currentStore, dismissNotices, parseStore, visibleNotices } from './dismissals';
import type { Notice } from './types';

const notice = (over: Partial<Notice>): Notice => ({
  id: 'restock', severity: 'warning', title: '3 productos para reponer', detail: 'A, B, C.', route: 'inventario', ...over,
});
const cash = notice({ id: 'cash-closed', title: 'La caja está cerrada', detail: 'Abrila.', route: 'caja', pinned: 'Se va al abrir la caja' });

describe('dismissals', () => {
  it('borra los comunes y nunca los fijos', () => {
    const list = [notice({}), cash];
    const store = dismissNotices(currentStore(null, '2026-11-27'), list, list);
    expect(visibleNotices(list, store).map((n) => n.id)).toEqual(['cash-closed']);
  });

  it('vuelve si cambia lo que dice', () => {
    const before = [notice({})];
    const store = dismissNotices(currentStore(null, '2026-11-27'), before, before);
    expect(visibleNotices(before, store)).toEqual([]);
    const after = [notice({ title: '5 productos para reponer' })];
    expect(visibleNotices(after, store)).toHaveLength(1);
  });

  it('al día siguiente vuelve todo', () => {
    const list = [notice({})];
    const store = dismissNotices(currentStore(null, '2026-11-27'), list, list);
    expect(visibleNotices(list, currentStore(store, '2026-11-28'))).toHaveLength(1);
  });

  it('no acumula huellas de avisos que ya no existen', () => {
    const a = notice({ id: 'a' });
    const b = notice({ id: 'b' });
    let store = dismissNotices(currentStore(null, 'd'), [a, b], [a]);
    store = dismissNotices(store, [b], [b]);
    expect(store.keys).toHaveLength(1);
  });

  it('lee lo guardado y descarta datos rotos', () => {
    expect(parseStore('{"day":"d","keys":["x"]}')).toEqual({ day: 'd', keys: ['x'] });
    expect(parseStore('{roto')).toBeNull();
    expect(parseStore('{"day":1,"keys":[]}')).toBeNull();
    expect(parseStore(null)).toBeNull();
  });
});
