import { useCallback, useEffect, useRef, useState } from 'react';
import { toUserMessage } from '@/lib/errorMessages';
import { useOnDataChange } from '@/features/realtime/hooks/useOnDataChange';
import type { DataTable } from '@/features/realtime/changeBus';

const REALTIME_TABLES: readonly DataTable[] = ['sales', 'expenses', 'products', 'product_costs', 'stock_movements'];

/**
 * Carga un informe y lo mantiene al día cuando cambian los datos.
 * `fetcher` debe ser estable (useCallback): al cambiar, se vuelve a pedir el informe.
 * Si una recarga falla, se conservan las filas ya visibles y se muestra el aviso.
 */
export function useReport<T>(fetcher: () => Promise<T[]>, enabled: boolean) {
  const [rows, setRows] = useState<T[] | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!enabled) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      if (requestId === requestIdRef.current) setRows(result);
    } catch (err) {
      if (requestId === requestIdRef.current) setError(toUserMessage(err, 'No se pudo generar el informe.'));
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, [fetcher, enabled]);

  useEffect(() => {
    void load();
    return () => {
      requestIdRef.current += 1;
    };
  }, [load]);

  useOnDataChange(REALTIME_TABLES, () => {
    void load();
  });

  return { rows, isLoading, error, reload: load };
}
