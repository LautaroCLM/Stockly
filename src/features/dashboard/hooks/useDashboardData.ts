import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Product, StockMovement } from '@/features/inventario/types';
import { fetchMovementsPage } from '@/features/historial/api/movementsHistoryApi';
import { fetchDailySales } from '../api/dashboardApi';
import {
  buildActivity,
  buildCriticalStock,
  buildKpis,
  buildRevenueHistory,
  type DailySales,
} from '../dashboardMetrics';

const RECENT_ACTIVITY_SIZE = 8;
const NO_FILTERS = { direction: 'all', reason: 'all', search: '', matchingProductIds: [] } as const;

/**
 * Métricas del dashboard: ventas diarias y últimos movimientos se consultan al servidor;
 * el stock crítico se calcula con el catálogo ya cargado.
 */
export function useDashboardData(companyId: string, products: Product[]) {
  const [dailySales, setDailySales] = useState<DailySales[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const reload = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const [days, page] = await Promise.all([
        fetchDailySales(companyId),
        fetchMovementsPage(companyId, { ...NO_FILTERS, matchingProductIds: [] }, 0, RECENT_ACTIVITY_SIZE),
      ]);
      if (requestId !== requestIdRef.current) return;
      setDailySales(days);
      setMovements(page.rows);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err instanceof Error ? err.message : 'Error al cargar el resumen operativo.');
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    reload();
    return () => {
      requestIdRef.current += 1;
    };
  }, [reload]);

  const kpis = useMemo(() => buildKpis(dailySales, products), [dailySales, products]);
  const revenueHistory = useMemo(() => buildRevenueHistory(dailySales), [dailySales]);
  const criticalStock = useMemo(() => buildCriticalStock(products), [products]);
  const activity = useMemo(() => buildActivity(movements, new Date()), [movements]);

  return { kpis, revenueHistory, criticalStock, activity, isLoading, error, reload };
}
