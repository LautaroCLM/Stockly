import { useCallback, useEffect, useRef, useState } from 'react';
import { useOnDataChange } from '@/features/realtime/hooks/useOnDataChange';
import type { DataTable } from '@/features/realtime/changeBus';
import { fetchAuditPage } from '../api/auditLogApi';
import type { AuditEntry, AuditFilters } from '../types';

/** Cualquier cambio auditado puede sumar una fila al registro. */
const REALTIME_TABLES: readonly DataTable[] = [
  'audit_log',
  'companies',
  'company_members',
  'company_invitations',
  'categories',
  'products',
  'product_costs',
  'sales',
  'purchases',
  'suppliers',
  'customers',
];

const INITIAL_FILTERS: AuditFilters = { tableName: 'all', action: 'all' };

export function useAuditLog(companyId: string, enabled: boolean) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<AuditFilters>(INITIAL_FILTERS);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const reload = useCallback(async () => {
    if (!enabled) return;
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const page = await fetchAuditPage(companyId, filters, 0);
      if (requestId !== requestIdRef.current) return;
      setEntries(page.rows);
      setTotal(page.total);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err instanceof Error ? err.message : 'No se pudo cargar el registro de auditoría.');
      setEntries([]);
      setTotal(0);
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, [companyId, filters, enabled]);

  useEffect(() => {
    void reload();
    return () => {
      requestIdRef.current += 1;
    };
  }, [reload]);

  const loadMore = useCallback(async () => {
    if (!enabled || isLoading || isLoadingMore || entries.length >= total) return;
    const requestId = requestIdRef.current;
    setIsLoadingMore(true);
    try {
      const page = await fetchAuditPage(companyId, filters, entries.length);
      if (requestId !== requestIdRef.current) return;
      setEntries((prev) => [...prev, ...page.rows]);
      setTotal(page.total);
    } catch (err) {
      if (requestId === requestIdRef.current) {
        setError(err instanceof Error ? err.message : 'No se pudieron cargar más registros.');
      }
    } finally {
      setIsLoadingMore(false);
    }
  }, [companyId, filters, enabled, isLoading, isLoadingMore, entries.length, total]);

  useOnDataChange(REALTIME_TABLES, () => {
    void reload();
  });

  return {
    entries,
    total,
    hasMore: entries.length < total,
    filters,
    setFilters,
    isLoading,
    isLoadingMore,
    error,
    reload,
    loadMore,
  };
}
