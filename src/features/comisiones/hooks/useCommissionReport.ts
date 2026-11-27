import { useCallback, useEffect, useMemo, useState } from 'react';
import { toUserMessage } from '@/lib/errorMessages';
import { localDateInputValue } from '@/lib/localDate';
import { useOnDataChange } from '@/features/realtime/hooks/useOnDataChange';
import type { DataTable } from '@/features/realtime/changeBus';
import { fetchCommissionReport } from '../api/commissionsApi';
import { monthRange, summarizeCommissions } from '../commissionSummary';
import type { CommissionEntry } from '../types';

const REALTIME_TABLES: readonly DataTable[] = ['sales', 'expenses', 'employees'];

/** Informe de comisiones de un período (por defecto, el mes en curso). */
export function useCommissionReport(companyId: string) {
  const [period, setPeriod] = useState(() => monthRange(localDateInputValue()));
  const [entries, setEntries] = useState<CommissionEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!period.from || !period.to || period.from > period.to) return;
    try {
      setEntries(await fetchCommissionReport(companyId, period.from, period.to));
      setError(null);
    } catch (err) {
      setError(toUserMessage(err, 'No se pudo cargar el informe de comisiones.'));
    }
  }, [companyId, period]);

  useEffect(() => {
    setEntries(null);
    void reload();
  }, [reload]);
  useOnDataChange(REALTIME_TABLES, () => void reload());

  const summaries = useMemo(() => (entries ? summarizeCommissions(entries) : null), [entries]);
  return { period, setPeriod, summaries, error, reload };
}
