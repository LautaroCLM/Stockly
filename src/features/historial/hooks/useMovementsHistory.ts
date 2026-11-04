import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Product,
  StockMovement,
  StockMovementDirection,
  StockMovementReason,
} from '@/features/inventario/types';
import type { DataTable } from '@/features/realtime/changeBus';
import { useOnDataChange } from '@/features/realtime/hooks/useOnDataChange';
import { usePagedQuery } from '@/hooks/usePagedQuery';
import {
  MOVEMENTS_PAGE_SIZE,
  fetchMovementDirectionCounts,
  fetchMovementsPage,
  type MovementFilters,
} from '../api/movementsHistoryApi';

/** Tablas cuyos cambios (de cualquier usuario de la empresa) recargan este hook. */
const REALTIME_TABLES: readonly DataTable[] = ['stock_movements', 'products'];
const COUNT_TABLES: readonly DataTable[] = ['stock_movements'];

export interface MovementFilterInputs {
  direction: 'all' | StockMovementDirection;
  reason: 'all' | StockMovementReason;
  search: string;
}

const INITIAL_FILTERS: MovementFilterInputs = { direction: 'all', reason: 'all', search: '' };

/** Productos cuyo nombre, SKU o código de barras contienen el texto buscado. */
export function matchProductIds(products: Product[], search: string): string[] {
  const q = search.toLowerCase().trim();
  if (!q) return [];
  return products
    .filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q)
    )
    .map((p) => p.id);
}

/**
 * Historial de movimientos paginado en el servidor: primera página al montar o al cambiar
 * los filtros, "cargar más" para las siguientes y refresco en vivo sin perder lo cargado.
 */
export function useMovementsHistory(companyId: string, products: Product[]) {
  const [filters, setFilters] = useState<MovementFilterInputs>(INITIAL_FILTERS);
  const [counts, setCounts] = useState<{ entries: number; exits: number } | null>(null);
  const productsRef = useRef(products);
  productsRef.current = products;
  const filtersKey = `${companyId}|${filters.direction}|${filters.reason}|${filters.search}`;

  const toQueryFilters = useCallback(
    (): MovementFilters => ({ ...filters, matchingProductIds: matchProductIds(productsRef.current, filters.search) }),
    [filters]
  );

  const fetchPage = useCallback(
    (offset: number, limit: number) => fetchMovementsPage(companyId, toQueryFilters(), offset, limit),
    [companyId, toQueryFilters]
  );

  const query = usePagedQuery<StockMovement>({
    queryKey: filtersKey,
    enabled: Boolean(companyId),
    pageSize: MOVEMENTS_PAGE_SIZE,
    fetchPage,
    realtimeTables: REALTIME_TABLES,
    errorFallback: 'No se pudo cargar el historial de movimientos de stock.',
  });

  // Contadores de entradas y salidas: si un refresco falla se conservan los anteriores
  const loadCounts = useCallback(async () => {
    try {
      setCounts(await fetchMovementDirectionCounts(companyId, toQueryFilters()));
    } catch {
      // El aviso de error ya lo muestra la lista
    }
  }, [companyId, toQueryFilters]);

  useEffect(() => {
    setCounts(null);
    void loadCounts();
  }, [loadCounts]);

  useOnDataChange(COUNT_TABLES, () => {
    void loadCounts();
  });

  const { refresh } = query;
  const reload = useCallback(async () => {
    await Promise.all([refresh(), loadCounts()]);
  }, [refresh, loadCounts]);

  return {
    movements: query.rows,
    total: query.total,
    counts,
    hasMore: query.hasMore,
    isLoading: query.isLoading,
    isLoadingMore: query.isLoadingMore,
    error: query.error,
    filters,
    setFilters,
    loadMore: query.loadMore,
    reload,
  };
}
