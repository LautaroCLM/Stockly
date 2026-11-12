import { useCallback, useEffect, useRef, useState } from 'react';
import { toUserMessage } from '@/lib/errorMessages';
import { useOnDataChange } from '@/features/realtime/hooks/useOnDataChange';
import type { DataTable } from '@/features/realtime/changeBus';
import { applyPriceChange, fetchPriceBatches, revertPriceChange } from '../api/pricesApi';
import type { AppliedChange, PriceBatch, PriceChangeParams, PriceResult, RevertedChange } from '../types';

const REALTIME_TABLES: readonly DataTable[] = ['price_change_batches'];

/** Historial de cambios de precios de la empresa (en vivo), con aplicar y revertir. */
export function usePriceHistory(companyId: string, enabled: boolean) {
  const [batches, setBatches] = useState<PriceBatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!enabled || !companyId) return;
    try {
      const list = await fetchPriceBatches(companyId);
      if (requestId === requestIdRef.current) {
        setBatches(list);
        setError(null);
      }
    } catch (err) {
      if (requestId === requestIdRef.current) setError(toUserMessage(err, 'No se pudo cargar el historial.'));
    }
  }, [companyId, enabled]);

  useEffect(() => {
    setBatches(null);
    void load();
  }, [load]);

  useOnDataChange(REALTIME_TABLES, () => {
    void load();
  });

  const apply = useCallback(
    async (batchId: string, params: PriceChangeParams, excludedIds: string[], note: string): Promise<PriceResult<AppliedChange>> => {
      const result = await applyPriceChange(companyId, batchId, params, excludedIds, note);
      // También tras un resultado incierto: puede haberse aplicado igual
      if (result.ok || result.uncertain) await load();
      return result;
    },
    [companyId, load]
  );

  const revert = useCallback(
    async (batchId: string): Promise<PriceResult<RevertedChange>> => {
      const result = await revertPriceChange(companyId, batchId);
      if (result.ok) await load();
      return result;
    },
    [companyId, load]
  );

  return { batches, error, reload: load, apply, revert };
}
