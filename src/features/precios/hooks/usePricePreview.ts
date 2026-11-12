import { useCallback, useEffect, useRef, useState } from 'react';
import { toUserMessage } from '@/lib/errorMessages';
import { previewPriceChange } from '../api/pricesApi';
import type { PreviewRow, PriceChangeParams } from '../types';

const DEBOUNCE_MS = 400;

/**
 * Vista previa del cambio: la calcula la base (la misma cuenta que al aplicar).
 * Con `params` en null no consulta nada. Espera un momento al cambiar los filtros.
 */
export function usePricePreview(companyId: string, enabled: boolean, params: PriceChangeParams | null) {
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  // Texto estable de los parámetros: evita recalcular si solo cambió la referencia
  const key = params ? JSON.stringify(params) : '';

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!enabled || !companyId || key === '') {
      setRows(null);
      setError(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const list = await previewPriceChange(companyId, JSON.parse(key) as PriceChangeParams);
      if (requestId === requestIdRef.current) setRows(list);
    } catch (err) {
      if (requestId === requestIdRef.current) {
        setRows(null);
        setError(toUserMessage(err, 'No se pudo calcular la vista previa.'));
      }
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, [companyId, enabled, key]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      requestIdRef.current += 1;
    };
  }, [load]);

  return { rows, isLoading, error, reload: load };
}
