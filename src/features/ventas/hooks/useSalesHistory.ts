import { useCallback, useRef, useState } from 'react';
import type { Sale } from '@/features/inventario/types';
import type { Customer } from '@/features/clientes/types';
import type { DataTable } from '@/features/realtime/changeBus';
import { usePagedQuery } from '@/hooks/usePagedQuery';
import { SALES_PAGE_SIZE, fetchSalesPage } from '../api/salesHistoryApi';

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
 * búsqueda, "cargar más" para las siguientes y refresco en vivo sin perder lo cargado.
 */
export function useSalesHistory(companyId: string, customers: Customer[]) {
  const [search, setSearch] = useState('');
  const customersRef = useRef(customers);
  customersRef.current = customers;

  const fetchPage = useCallback(
    (offset: number, limit: number) =>
      fetchSalesPage(
        companyId,
        { search, matchingCustomerIds: matchCustomerIds(customersRef.current, search) },
        offset,
        limit
      ),
    [companyId, search]
  );

  const query = usePagedQuery<Sale>({
    queryKey: `${companyId}|${search}`,
    enabled: Boolean(companyId),
    pageSize: SALES_PAGE_SIZE,
    fetchPage,
    realtimeTables: REALTIME_TABLES,
    errorFallback: 'No se pudieron cargar las ventas.',
  });

  return {
    sales: query.rows,
    total: query.total,
    hasMore: query.hasMore,
    isLoading: query.isLoading,
    isLoadingMore: query.isLoadingMore,
    error: query.error,
    search,
    setSearch,
    loadMore: query.loadMore,
    reload: query.refresh,
  };
}
