import { useCallback, useEffect, useRef, useState } from 'react';
import { localDateInputValue } from '@/lib/localDate';
import { toUserMessage } from '@/lib/errorMessages';
import { useOnDataChange } from '@/features/realtime/hooks/useOnDataChange';
import type { DataTable } from '@/features/realtime/changeBus';
import { fetchFinancialSummary } from '../api/financeApi';
import { periodRange, previousRange } from '../financeMath';
import type { DateRange, FinancialSummary, PeriodKey } from '../types';

const REALTIME_TABLES: readonly DataTable[] = ['sales', 'purchases', 'stock_movements', 'product_costs', 'products'];

/** Resumen del período elegido y del anterior (para comparar), en vivo. */
export function useFinancialSummary(companyId: string, enabled: boolean, period: PeriodKey) {
  const [current, setCurrent] = useState<FinancialSummary | null>(null);
  const [previous, setPrevious] = useState<FinancialSummary | null>(null);
  const [range, setRange] = useState<DateRange | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!enabled || !companyId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    const nextRange = periodRange(period, localDateInputValue());
    try {
      const [now, before] = await Promise.all([
        fetchFinancialSummary(companyId, nextRange),
        fetchFinancialSummary(companyId, previousRange(nextRange)),
      ]);
      if (requestId !== requestIdRef.current) return;
      setCurrent(now);
      setPrevious(before);
      setRange(nextRange);
    } catch (err) {
      // Se conservan los números ya visibles: un corte breve no debe borrar el resumen
      if (requestId === requestIdRef.current) setError(toUserMessage(err, 'No se pudo calcular el resumen financiero.'));
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, [companyId, enabled, period]);

  useEffect(() => {
    // Al cambiar de empresa no deben quedar a la vista los números de la anterior
    setCurrent(null);
    setPrevious(null);
    setRange(null);
  }, [companyId]);

  useEffect(() => {
    void load();
    return () => {
      requestIdRef.current += 1;
    };
  }, [load]);

  useOnDataChange(REALTIME_TABLES, () => {
    void load();
  });

  return { current, previous, range, isLoading, error, reload: load };
}
