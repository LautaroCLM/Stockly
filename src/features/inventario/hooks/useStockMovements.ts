import { useState, useEffect, useCallback, useRef } from 'react';
import type { TenantId } from '@/types';
import type { StockMovement } from '../types';
import { fetchStockMovements } from '../api/stockMovementsApi';

export function getMovementStorageKey(tenantId: TenantId): string {
  return `stockly_movements_${tenantId}_v1`;
}

/**
 * Helper transitorio de compatibilidad para transacciones locales de checkout (ventas mock).
 */
export function loadMovementsFromStorage(tenantId: TenantId): StockMovement[] {
  try {
    const raw = localStorage.getItem(getMovementStorageKey(tenantId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.warn(`Error al leer movimientos locales para ${tenantId}:`, err);
  }
  return [];
}

/**
 * Hook para la gestión del libro mayor inmutable de movimientos de stock.
 * Consulta directamente public.stock_movements en PostgreSQL bajo RLS.
 */
export function useStockMovements(tenantId: TenantId) {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef<boolean>(true);
  const currentCompanyIdRef = useRef<string>(tenantId);

  currentCompanyIdRef.current = tenantId;

  const loadMovements = useCallback(
    async (targetCompanyId: string) => {
      if (!targetCompanyId) {
        setMovements([]);
        setIsLoading(false);
        setError(null);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const fresh = await fetchStockMovements(targetCompanyId);
        if (isMountedRef.current && currentCompanyIdRef.current === targetCompanyId) {
          setMovements(fresh);
          setError(null);
        }
      } catch (err) {
        if (isMountedRef.current && currentCompanyIdRef.current === targetCompanyId) {
          const message =
            err instanceof Error ? err.message : 'Error al cargar el historial de movimientos de stock.';
          setError(message);
        }
      } finally {
        if (isMountedRef.current && currentCompanyIdRef.current === targetCompanyId) {
          setIsLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    isMountedRef.current = true;
    loadMovements(tenantId);
    return () => {
      isMountedRef.current = false;
    };
  }, [tenantId, loadMovements]);

  // Sincronización en memoria con transacciones locales de venta (checkout en mostrador)
  // Permite preview local transitorio sin persistir saldos ficticios en PostgreSQL
  const syncMovementsFromTransaction = useCallback((newMovements: StockMovement[]) => {
    setMovements((prev) => [...newMovements, ...prev]);
  }, []);

  return {
    movements,
    isLoading,
    error,
    reloadMovements: () => loadMovements(tenantId),
    syncMovementsFromTransaction,
  };
}
