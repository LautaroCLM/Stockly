import { useCallback, useMemo, useState } from 'react';
import { localDateInputValue } from '@/lib/localDate';
import { currentStore, dismissNotices, parseStore, visibleNotices, type DismissalStore } from '../dismissals';
import type { Notice } from '../types';

const storageKey = (companyId: string) => `stockly:dismissed-notices:${companyId}`;

/** Avisos borrados en esta PC para esta empresa (vuelven si cambian o al día siguiente). */
export function useNoticeDismissals(companyId: string, notices: Notice[]) {
  const [raw, setRaw] = useState<{ companyId: string; store: DismissalStore | null }>(() => ({
    companyId, store: parseStore(localStorage.getItem(storageKey(companyId))),
  }));
  // Al cambiar de empresa se lee lo de esa empresa
  const loaded = raw.companyId === companyId ? raw.store : parseStore(localStorage.getItem(storageKey(companyId)));
  const store = currentStore(loaded, localDateInputValue());

  const save = useCallback((next: DismissalStore) => {
    localStorage.setItem(storageKey(companyId), JSON.stringify(next));
    setRaw({ companyId, store: next });
  }, [companyId]);

  const visible = useMemo(() => visibleNotices(notices, store), [notices, store]);
  const dismiss = useCallback((list: Notice[]) => save(dismissNotices(store, notices, list)), [save, store, notices]);

  return { visible, dismiss };
}
