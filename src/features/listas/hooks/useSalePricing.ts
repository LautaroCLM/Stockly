import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Customer } from '@/features/clientes/types';
import type { Product } from '@/features/inventario/types';
import { fetchListPrices } from '../api/priceListsApi';
import type { ListPrice } from '../types';
import { usePriceLists } from './usePriceLists';

/** Lo que viaja a process_sale. */
export interface SalePricingArgs {
  priceListId: string | null;
  /** true: lista elegida por el admin (null = precio normal); false: la del cliente. */
  overridePriceList: boolean;
  priceListName: string | null;
}

interface Options {
  companyId: string;
  products: Product[];
  customers: Customer[];
  isAdmin: boolean;
  /** Cobro abierto: al abrirse arranca sin cliente y con precio normal. */
  active: boolean;
  applyPrices: (priceOf: (productId: string) => number | undefined) => void;
}

/**
 * Lista de precios de la venta: la del cliente elegido, o la que elija el admin.
 * Los precios los da la base (price_list_prices), la misma regla con la que cobra process_sale.
 */
export function useSalePricing({ companyId, products, customers, isAdmin, active, applyPrices }: Options) {
  const { lists } = usePriceLists(companyId, active);
  const [customerId, setCustomerId] = useState<string | null>(null);
  // undefined: se usa la lista del cliente; string | null: la eligió el admin (null = precio normal)
  const [override, setOverride] = useState<string | null | undefined>(undefined);
  const [isRepricing, setIsRepricing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cache = useRef(new Map<string, Map<string, ListPrice>>());

  useEffect(() => {
    if (!active) return;
    setCustomerId(null);
    setOverride(undefined);
    cache.current.clear();
  }, [active]);

  const customerListId = customers.find((c) => c.id === customerId)?.priceListId ?? null;
  const activeLists = useMemo(() => lists.filter((l) => l.isActive), [lists]);
  const wanted = override !== undefined ? override : customerListId;
  // Una lista desactivada no se aplica: la venta cobra el precio normal
  const list = activeLists.find((l) => l.id === wanted) ?? null;
  const basePrice = useMemo(() => new Map(products.map((p) => [p.id, p.salePrice])), [products]);

  useEffect(() => {
    // Fuera del cobro (o si se cierra sin cobrar) el carrito muestra el precio normal
    if (!active || !list) {
      applyPrices((id) => basePrice.get(id));
      setError(null);
      return;
    }
    let alive = true;
    setIsRepricing(true);
    void (async () => {
      try {
        const prices = cache.current.get(list.id) ?? (await fetchListPrices(companyId, list.id));
        cache.current.set(list.id, prices);
        if (!alive) return;
        applyPrices((id) => prices.get(id)?.price ?? basePrice.get(id));
        setError(null);
      } catch {
        if (alive) setError('No se pudieron cargar los precios de la lista. La venta igual se cobra con la lista correcta.');
      } finally {
        if (alive) setIsRepricing(false);
      }
    })();
    return () => { alive = false; };
  }, [active, list, companyId, basePrice, applyPrices]);

  const chooseList = useCallback((listId: string | null | undefined) => setOverride(listId), [setOverride]);

  const saleArgs: SalePricingArgs = {
    priceListId: override !== undefined ? override : null,
    overridePriceList: override !== undefined,
    priceListName: list?.name ?? null,
  };

  return {
    list, lists: activeLists, canChange: isAdmin, isOverride: override !== undefined, isRepricing, error,
    selectCustomer: setCustomerId, chooseList, saleArgs,
  };
}

export type SalePricing = ReturnType<typeof useSalePricing>;
