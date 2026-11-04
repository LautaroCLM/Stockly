import { useCallback, useEffect, useRef, useState } from 'react';
import { toUserMessage } from '@/lib/errorMessages';
import { useOnDataChange } from '@/features/realtime/hooks/useOnDataChange';
import type { DataTable } from '@/features/realtime/changeBus';

export interface PagedResult<T> {
  rows: T[];
  total: number;
}

interface PagedQueryOptions<T> {
  /** Identifica la consulta (empresa + filtros). Si cambia, se descarta lo cargado. */
  queryKey: string;
  /** Si es false no se consulta nada (por ejemplo, rol sin permiso). */
  enabled: boolean;
  pageSize: number;
  fetchPage: (offset: number, limit: number) => Promise<PagedResult<T>>;
  /** Tablas cuyos cambios (de cualquier usuario) refrescan la lista. */
  realtimeTables: readonly DataTable[];
  errorFallback: string;
}

/**
 * Lista paginada en el servidor con tres reglas:
 * 1. Al cambiar empresa o filtros se descarta lo anterior y se carga la primera página.
 * 2. Un refresco (botón Actualizar, cambios en vivo, operación propia) vuelve a pedir
 *    todas las filas ya cargadas, así no se pierde lo que el usuario fue cargando.
 * 3. Si un refresco falla, los datos visibles se mantienen y solo se muestra el aviso.
 * Descarta respuestas de pedidos viejos.
 */
export function usePagedQuery<T extends { id: string }>(options: PagedQueryOptions<T>) {
  const { queryKey, enabled, pageSize, realtimeTables, errorFallback } = options;
  const [rows, setRows] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(enabled);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  const fetchPageRef = useRef(options.fetchPage);
  fetchPageRef.current = options.fetchPage;
  const loadedCountRef = useRef(0);
  loadedCountRef.current = rows.length;
  const hadEverythingRef = useRef(false);
  hadEverythingRef.current = rows.length > 0 && rows.length >= total;

  const load = useCallback(
    async (mode: 'reset' | 'refresh') => {
      const requestId = ++requestIdRef.current;
      if (!enabled) {
        setRows([]);
        setTotal(0);
        setError(null);
        setIsLoading(false);
        return;
      }
      if (mode === 'reset') {
        setRows([]);
        setTotal(0);
      }
      setIsLoading(true);
      setIsLoadingMore(false);
      setError(null);
      // Refresco: se vuelven a pedir las filas ya cargadas; si el usuario tenía la lista
      // completa, se deja lugar para las filas nuevas que pudieron entrar arriba.
      const loaded = loadedCountRef.current;
      const limit =
        mode === 'refresh'
          ? Math.max(pageSize, hadEverythingRef.current ? loaded + pageSize : loaded)
          : pageSize;
      try {
        const page = await fetchPageRef.current(0, limit);
        if (requestId !== requestIdRef.current) return;
        setRows(page.rows);
        setTotal(page.total);
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        setError(toUserMessage(err, errorFallback));
      } finally {
        if (requestId === requestIdRef.current) setIsLoading(false);
      }
    },
    [enabled, pageSize, errorFallback]
  );

  useEffect(() => {
    void load('reset');
    return () => {
      requestIdRef.current += 1;
    };
  }, [load, queryKey]);

  const refresh = useCallback(() => load('refresh'), [load]);

  const loadMore = useCallback(async () => {
    if (!enabled || isLoading || isLoadingMore || rows.length >= total) return;
    const requestId = requestIdRef.current;
    setIsLoadingMore(true);
    try {
      const page = await fetchPageRef.current(rows.length, pageSize);
      if (requestId !== requestIdRef.current) return;
      // Si entraron filas nuevas, el desplazamiento repite filas ya vistas: se descartan por id
      setRows((prev) => {
        const seen = new Set(prev.map((row) => row.id));
        return [...prev, ...page.rows.filter((row) => !seen.has(row.id))];
      });
      setTotal(page.total);
    } catch (err) {
      if (requestId === requestIdRef.current) setError(toUserMessage(err, errorFallback));
    } finally {
      if (requestId === requestIdRef.current) setIsLoadingMore(false);
    }
  }, [enabled, isLoading, isLoadingMore, rows.length, total, pageSize, errorFallback]);

  useOnDataChange(realtimeTables, () => {
    void refresh();
  });

  return { rows, total, hasMore: rows.length < total, isLoading, isLoadingMore, error, refresh, loadMore };
}
