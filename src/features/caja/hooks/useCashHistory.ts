import { useCallback } from 'react';
import type { DataTable } from '@/features/realtime/changeBus';
import { usePagedQuery } from '@/hooks/usePagedQuery';
import { CASH_HISTORY_PAGE_SIZE, fetchClosedSessions } from '../api/cashApi';
import type { CashSession } from '../types';

const REALTIME_TABLES: readonly DataTable[] = ['cash_sessions'];

/** Historial de cajas cerradas de la empresa, paginado y en vivo. */
export function useCashHistory(companyId: string) {
  const fetchPage = useCallback(
    (offset: number, limit: number) => fetchClosedSessions(companyId, offset, limit),
    [companyId]
  );

  const query = usePagedQuery<CashSession>({
    queryKey: companyId,
    enabled: Boolean(companyId),
    pageSize: CASH_HISTORY_PAGE_SIZE,
    fetchPage,
    realtimeTables: REALTIME_TABLES,
    errorFallback: 'No se pudo cargar el historial de cajas.',
  });

  return {
    sessions: query.rows,
    total: query.total,
    hasMore: query.hasMore,
    isLoading: query.isLoading,
    isLoadingMore: query.isLoadingMore,
    error: query.error,
    reload: query.refresh,
    loadMore: query.loadMore,
  };
}
