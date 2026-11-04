import { useCallback, useEffect, useRef, useState } from 'react';
import { useOnDataChange } from '@/features/realtime/hooks/useOnDataChange';
import type { DataTable } from '@/features/realtime/changeBus';
import { fetchClosedSessions } from '../api/cashApi';
import type { CashSession } from '../types';

const REALTIME_TABLES: readonly DataTable[] = ['cash_sessions'];

/** Historial de cajas cerradas de la empresa, paginado. */
export function useCashHistory(companyId: string) {
  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const reload = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const page = await fetchClosedSessions(companyId, 0);
      if (requestId !== requestIdRef.current) return;
      setSessions(page.rows);
      setTotal(page.total);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err instanceof Error ? err.message : 'No se pudo cargar el historial de cajas.');
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    setSessions([]);
    void reload();
    return () => {
      requestIdRef.current += 1;
    };
  }, [reload]);

  const loadMore = useCallback(async () => {
    if (isLoading || isLoadingMore || sessions.length >= total) return;
    const requestId = requestIdRef.current;
    setIsLoadingMore(true);
    try {
      const page = await fetchClosedSessions(companyId, sessions.length);
      if (requestId !== requestIdRef.current) return;
      setSessions((prev) => [...prev, ...page.rows]);
      setTotal(page.total);
    } catch (err) {
      if (requestId === requestIdRef.current) {
        setError(err instanceof Error ? err.message : 'No se pudieron cargar más cajas.');
      }
    } finally {
      setIsLoadingMore(false);
    }
  }, [companyId, isLoading, isLoadingMore, sessions.length, total]);

  useOnDataChange(REALTIME_TABLES, () => {
    void reload();
  });

  return { sessions, total, hasMore: sessions.length < total, isLoading, isLoadingMore, error, reload, loadMore };
}
