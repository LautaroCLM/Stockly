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
import { useOnDataChange } from '@/features/realtime/hooks/useOnDataChange';
import type { DataTable } from '@/features/realtime/changeBus';
import { toUserMessage } from '@/lib/errorMessages';

/** Tablas cuyos cambios (de cualquier usuario de la empresa) recargan este hook. */
const REALTIME_TABLES: readonly DataTable[] = ['sales', 'stock_movements', 'products', 'product_costs'];

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
      // Se conservan las métricas visibles de esta empresa: un corte breve no las borra
      setError(toUserMessage(err, 'No se pudo cargar el resumen operativo.'));
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    // Al cambiar de empresa no deben quedar a la vista los datos de la anterior
    setDailySales([]);
    setMovements([]);
    reload();
    return () => {
      requestIdRef.current += 1;
    };
  }, [reload]);

  const kpis = useMemo(() => buildKpis(dailySales, products), [dailySales, products]);
  const revenueHistory = useMemo(() => buildRevenueHistory(dailySales), [dailySales]);
  const criticalStock = useMemo(() => buildCriticalStock(products), [products]);
  const activity = useMemo(() => buildActivity(movements, new Date()), [movements]);

  useOnDataChange(REALTIME_TABLES, () => {
    void reload();
  });

  return { kpis, revenueHistory, criticalStock, activity, isLoading, error, reload };
}
