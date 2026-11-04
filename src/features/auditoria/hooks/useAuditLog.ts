import { useCallback, useState } from 'react';
import type { DataTable } from '@/features/realtime/changeBus';
import { usePagedQuery } from '@/hooks/usePagedQuery';
import { AUDIT_PAGE_SIZE, fetchAuditPage } from '../api/auditLogApi';
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
  'cash_sessions',
  'cash_movements',
];

const INITIAL_FILTERS: AuditFilters = { tableName: 'all', action: 'all' };

/** Registro de auditoría de la empresa (solo master_admin), paginado y en vivo. */
export function useAuditLog(companyId: string, enabled: boolean) {
  const [filters, setFilters] = useState<AuditFilters>(INITIAL_FILTERS);

  const fetchPage = useCallback(
    (offset: number, limit: number) => fetchAuditPage(companyId, filters, offset, limit),
    [companyId, filters]
  );

  const query = usePagedQuery<AuditEntry>({
    queryKey: `${companyId}|${filters.tableName}|${filters.action}`,
    enabled: enabled && Boolean(companyId),
    pageSize: AUDIT_PAGE_SIZE,
    fetchPage,
    realtimeTables: REALTIME_TABLES,
    errorFallback: 'No se pudo cargar el registro de auditoría.',
  });

  return {
    entries: query.rows,
    total: query.total,
    hasMore: query.hasMore,
    filters,
    setFilters,
    isLoading: query.isLoading,
    isLoadingMore: query.isLoadingMore,
    error: query.error,
    reload: query.refresh,
    loadMore: query.loadMore,
  };
}
