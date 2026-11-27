import { useCallback, useEffect, useMemo, useState } from 'react';
import { toUserMessage } from '@/lib/errorMessages';
import { useOnDataChange } from '@/features/realtime/hooks/useOnDataChange';
import type { DataTable } from '@/features/realtime/changeBus';
import { fetchExpiryWarningDays, fetchStockLots } from '../api/stockLotsApi';
import { summarizeLots } from '../lotStatus';
import { DEFAULT_EXPIRY_WARNING_DAYS, type StockLot } from '../types';

const REALTIME_TABLES: readonly DataTable[] = ['stock_movements', 'products', 'companies'];

/**
 * Lotes con unidades de la empresa y su resumen (vencidos, por vencer, próximo vencimiento).
 * Se recarga solo cuando cambia el stock (ventas, compras, ajustes) desde cualquier equipo.
 */
export function useStockLots(companyId: string, enabled = true) {
  const [lots, setLots] = useState<StockLot[]>([]);
  const [warningDays, setWarningDays] = useState(DEFAULT_EXPIRY_WARNING_DAYS);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) return;
    try {
      const [nextLots, days] = await Promise.all([fetchStockLots(companyId), fetchExpiryWarningDays(companyId)]);
      setLots(nextLots);
      setWarningDays(days);
      setError(null);
    } catch (err) {
      setError(toUserMessage(err, 'No se pudieron cargar los vencimientos.'));
    } finally {
      setIsLoaded(true);
    }
  }, [companyId, enabled]);

  useEffect(() => {
    setLots([]);
    setIsLoaded(false);
    void reload();
  }, [reload]);

  useOnDataChange(REALTIME_TABLES, () => void reload());

  const summary = useMemo(() => summarizeLots(lots, warningDays), [lots, warningDays]);
  return { lots, summary, warningDays, isLoaded, error, reload };
}

export type StockLotsState = ReturnType<typeof useStockLots>;
