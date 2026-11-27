import type { Notice } from './types';

/**
 * Avisos borrados en esta PC. Se guarda la "huella" de cada aviso (id + lo que dice): si el texto
 * cambia (ej. de 3 a 5 productos para reponer) el aviso vuelve. Al cambiar el día, vuelven todos.
 * Los avisos fijos nunca se borran.
 */
export interface DismissalStore {
  day: string;
  keys: string[];
}

export const fingerprint = (n: Pick<Notice, 'id' | 'title' | 'detail'>): string => `${n.id}|${n.title}|${n.detail}`;

export const canDismiss = (n: Notice): boolean => !n.pinned;

/** Lo guardado de otro día no cuenta. */
export function currentStore(store: DismissalStore | null, today: string): DismissalStore {
  return store && store.day === today ? store : { day: today, keys: [] };
}

export function visibleNotices(notices: Notice[], store: DismissalStore): Notice[] {
  const hidden = new Set(store.keys);
  return notices.filter((n) => !canDismiss(n) || !hidden.has(fingerprint(n)));
}

/** Borra los avisos indicados (los fijos se ignoran). Solo guarda huellas de avisos que siguen existiendo. */
export function dismissNotices(store: DismissalStore, current: Notice[], toDismiss: Notice[]): DismissalStore {
  const alive = new Set(current.map(fingerprint));
  const keys = new Set(store.keys.filter((k) => alive.has(k)));
  for (const n of toDismiss) if (canDismiss(n)) keys.add(fingerprint(n));
  return { day: store.day, keys: [...keys] };
}

export function parseStore(raw: string | null): DismissalStore | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      value && typeof value === 'object' && 'day' in value && 'keys' in value &&
      typeof value.day === 'string' && Array.isArray(value.keys) && value.keys.every((k) => typeof k === 'string')
    ) {
      return { day: value.day, keys: value.keys };
    }
  } catch {
    // Dato roto: se empieza de cero
  }
  return null;
}
