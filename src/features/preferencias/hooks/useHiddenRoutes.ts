import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toUserMessage } from '@/lib/errorMessages';
import type { RouteId } from '@/types';
import { fetchHiddenRoutes, saveHiddenRoutes, type SavePreferencesResult } from '../api/preferencesApi';

/**
 * Módulos ocultos del menú de quien usa la app. Mientras carga o si falla, se muestra todo:
 * ocultar es una comodidad y nunca debe dejar a alguien sin ver su menú.
 * Los cambios se aplican al instante y se deshacen si no se pudieron guardar.
 */
export function useHiddenRoutes(userId: string) {
  const [hidden, setHidden] = useState<RouteId[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);
    fetchHiddenRoutes(userId)
      .then((routes) => {
        if (requestId === requestIdRef.current) setHidden(routes);
      })
      .catch((err: unknown) => {
        if (requestId === requestIdRef.current) setError(toUserMessage(err, 'No se pudieron cargar tus preferencias.'));
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setIsLoading(false);
      });
    return () => {
      requestIdRef.current += 1;
    };
  }, [userId]);

  // La lista vigente vive también en una referencia: así "Deshacer" (que se llama más tarde) no usa una copia vieja
  const currentRef = useRef<RouteId[]>([]);
  currentRef.current = hidden;

  const save = useCallback(
    async (next: RouteId[]): Promise<SavePreferencesResult> => {
      const previous = currentRef.current;
      currentRef.current = next;
      setHidden(next);
      const result = await saveHiddenRoutes(userId, next);
      if (!result.ok) {
        currentRef.current = previous;
        setHidden(previous);
      }
      return result;
    },
    [userId]
  );

  const hiddenSet = useMemo(() => new Set(hidden), [hidden]);

  return { hidden, hiddenSet, isLoading, error, save };
}

export type HiddenRoutesState = ReturnType<typeof useHiddenRoutes>;
