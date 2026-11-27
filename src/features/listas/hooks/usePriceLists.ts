import { useCallback, useEffect, useState } from 'react';
import { toUserMessage } from '@/lib/errorMessages';
import { fetchPriceLists } from '../api/priceListsApi';
import type { PriceList } from '../types';

/** Listas de precios de la empresa. */
export function usePriceLists(companyId: string, enabled = true) {
  const [lists, setLists] = useState<PriceList[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!companyId || !enabled) return;
    try {
      setLists(await fetchPriceLists(companyId));
      setIsLoaded(true);
      setError(null);
    } catch (err) {
      setError(toUserMessage(err, 'No se pudieron cargar las listas de precios.'));
    }
  }, [companyId, enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { lists, isLoaded, error, reload };
}
