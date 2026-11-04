import { useCallback, useEffect, useRef, useState } from 'react';
import type { Sale } from '@/features/inventario/types';
import type { Customer } from '@/features/clientes/types';
import { fetchSalesPage } from '../api/salesHistoryApi';
import { useOnDataChange } from '@/features/realtime/hooks/useOnDataChange';
import type { DataTable } from '@/features/realtime/changeBus';

/** Tablas cuyos cambios (de cualquier usuario de la empresa) recargan este hook. */
const REALTIME_TABLES: readonly DataTable[] = ['sales', 'customers'];

/** Clientes cuyo nombre o documento contienen el texto buscado. */
export function matchCustomerIds(customers: Customer[], search: string): string[] {
  const q = search.toLowerCase().trim();
  if (!q) return [];
  return customers
    .filter((c) => c.name.toLowerCase().includes(q) || (c.taxId ?? '').toLowerCase().includes(q))
    .map((c) => c.id);
}

/**
 * Historial de ventas paginado en el servidor: primera página al montar o al cambiar la
 * búsqueda, y "cargar más" para las siguientes. Descarta respuestas de pedidos viejos.
 */
export function useSalesHistory(companyId: string, customers: Customer[]) {
  const [search, setSearch] = useState('');
  const [sales, setSales] = useState<Sale[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  const customersRef = useRef(customers);
  customersRef.current = customers;

  const toFilters = useCallback(
    (text: string) => ({ search: text, matchingCustomerIds: matchCustomerIds(customersRef.current, text) }),
    []
  );

  const reload = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setIsLoadingMore(false);
    setError(null);

    try {
      const page = await fetchSalesPage(companyId, toFilters(search), 0);
      if (requestId !== requestIdRef.current) return;
      setSales(page.rows);
      setTotal(page.total);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err instanceof Error ? err.message : 'Error al cargar ventas desde el servidor.');
      setSales([]);
      setTotal(0);
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, [companyId, search, toFilters]);

  useEffect(() => {
    reload();
    return () => {
      requestIdRef.current += 1;
    };
  }, [reload]);

  const loadMore = useCallback(async () => {
    if (isLoading || isLoadingMore) return;
    const requestId = requestIdRef.current;
    setIsLoadingMore(true);

    try {
      const page = await fetchSalesPage(companyId, toFilters(search), sales.length);
      if (requestId !== requestIdRef.current) return;
      // Si entraron ventas nuevas, el desplazamiento repite filas ya vistas: se descartan por id
      setSales((prev) => {
        const seen = new Set(prev.map((s) => s.id));
        return [...prev, ...page.rows.filter((row) => !seen.has(row.id))];
      });
      setTotal(page.total);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err instanceof Error ? err.message : 'Error al cargar más ventas.');
    } finally {
      if (requestId === requestIdRef.current) setIsLoadingMore(false);
    }
  }, [companyId, search, isLoading, isLoadingMore, sales.length, toFilters]);

  useOnDataChange(REALTIME_TABLES, () => {
    void reload();
  });

  return {
    sales,
    total,
    hasMore: sales.length < total,
    isLoading,
    isLoadingMore,
    error,
    search,
    setSearch,
    loadMore,
    reload,
  };
}
