import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Product,
  StockMovement,
  StockMovementDirection,
  StockMovementReason,
} from '@/features/inventario/types';
import {
  fetchMovementDirectionCounts,
  fetchMovementsPage,
  type MovementFilters,
} from '../api/movementsHistoryApi';

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
 * los filtros, y "cargar más" para las siguientes. Descarta respuestas de pedidos viejos.
 */
export function useMovementsHistory(companyId: string, products: Product[]) {
  const [filters, setFilters] = useState<MovementFilterInputs>(INITIAL_FILTERS);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<{ entries: number; exits: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  const productsRef = useRef(products);
  productsRef.current = products;

  const toQueryFilters = useCallback(
    (inputs: MovementFilterInputs): MovementFilters => ({
      ...inputs,
      matchingProductIds: matchProductIds(productsRef.current, inputs.search),
    }),
    []
  );

  const reload = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setIsLoadingMore(false);
    setError(null);

    try {
      const queryFilters = toQueryFilters(filters);
      const [page, directionCounts] = await Promise.all([
        fetchMovementsPage(companyId, queryFilters, 0),
        fetchMovementDirectionCounts(companyId, queryFilters),
      ]);
      if (requestId !== requestIdRef.current) return;
      setMovements(page.rows);
      setTotal(page.total);
      setCounts(directionCounts);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err instanceof Error ? err.message : 'Error al cargar el historial de movimientos de stock.');
      setMovements([]);
      setTotal(0);
      setCounts(null);
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, [companyId, filters, toQueryFilters]);

  useEffect(() => {
    reload();
    return () => {
      // Invalida respuestas pendientes al desmontar o antes de la próxima recarga
      requestIdRef.current += 1;
    };
  }, [reload]);

  const loadMore = useCallback(async () => {
    if (isLoading || isLoadingMore) return;
    const requestId = requestIdRef.current;
    setIsLoadingMore(true);

    try {
      const page = await fetchMovementsPage(companyId, toQueryFilters(filters), movements.length);
      if (requestId !== requestIdRef.current) return;
      // Si entraron movimientos nuevos, el desplazamiento repite filas ya vistas: se descartan por id
      setMovements((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        return [...prev, ...page.rows.filter((row) => !seen.has(row.id))];
      });
      setTotal(page.total);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err instanceof Error ? err.message : 'Error al cargar más movimientos.');
    } finally {
      if (requestId === requestIdRef.current) setIsLoadingMore(false);
    }
  }, [companyId, filters, isLoading, isLoadingMore, movements.length, toQueryFilters]);

  return {
    movements,
    total,
    counts,
    hasMore: movements.length < total,
    isLoading,
    isLoadingMore,
    error,
    filters,
    setFilters,
    loadMore,
    reload,
  };
}
