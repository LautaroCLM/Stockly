import { useCallback, useEffect, useState } from 'react';
import { toUserMessage } from '@/lib/errorMessages';
import { fetchListPrices, setListItemRpc } from '../api/priceListsApi';
import type { ListActionResult, ListPrice } from '../types';

/** Precios de todos los productos en una lista, y fijar o quitar excepciones. */
export function useListPrices(companyId: string, priceListId: string | null) {
  const [prices, setPrices] = useState<Map<string, ListPrice> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!priceListId) return setPrices(null);
    try {
      setPrices(await fetchListPrices(companyId, priceListId));
      setError(null);
    } catch (err) {
      setError(toUserMessage(err, 'No se pudieron cargar los precios de la lista.'));
    }
  }, [companyId, priceListId]);

  useEffect(() => {
    setPrices(null);
    void reload();
  }, [reload]);

  const setFixed = useCallback(async (productId: string, price: number | null): Promise<ListActionResult> => {
    if (!priceListId) return { ok: false, message: 'Elegí una lista.' };
    const result = await setListItemRpc(companyId, priceListId, productId, price);
    if (result.ok) await reload();
    return result;
  }, [companyId, priceListId, reload]);

  return { prices, error, reload, setFixed };
}
