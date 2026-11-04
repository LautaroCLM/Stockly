import { supabase } from '@/lib/supabase';
import type { AuditAction, AuditEntry, AuditFilters } from '../types';

export const AUDIT_PAGE_SIZE = 50;

export interface AuditPage {
  rows: AuditEntry[];
  total: number;
}

const AUDIT_COLUMNS =
  'id, table_name, record_id, action, old_data, new_data, performed_by, actor_role, created_at';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** Nombres de quienes hicieron los cambios de la página visible. */
async function fetchActorNames(userIds: string[]): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(userIds)];
  if (uniqueIds.length === 0) return new Map();
  const { data } = await supabase.from('profiles_public').select('id, full_name').in('id', uniqueIds);
  return new Map(
    (data ?? [])
      .filter((profile) => profile.id)
      .map((profile) => [profile.id as string, profile.full_name || 'Usuario'])
  );
}

/**
 * Página del registro de auditoría de la empresa, del más reciente al más antiguo.
 * RLS solo deja leerlo a los master_admin activos de la empresa.
 */
export async function fetchAuditPage(
  companyId: string,
  filters: AuditFilters,
  offset: number,
  limit: number = AUDIT_PAGE_SIZE
): Promise<AuditPage> {
  let query = supabase
    .from('audit_log')
    .select(AUDIT_COLUMNS, { count: 'exact' })
    .eq('company_id', companyId);

  if (filters.tableName !== 'all') query = query.eq('table_name', filters.tableName);
  if (filters.action !== 'all') query = query.eq('action', filters.action);

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error('No se pudo cargar el registro de auditoría. Intentá de nuevo.');
  }

  const rows = data ?? [];
  const names = await fetchActorNames(
    rows.map((row) => row.performed_by).filter((id): id is string => Boolean(id))
  );

  return {
    total: count ?? 0,
    rows: rows.map((row) => ({
      id: row.id,
      tableName: row.table_name,
      recordId: row.record_id,
      action: row.action as AuditAction,
      oldData: asRecord(row.old_data),
      newData: asRecord(row.new_data),
      performedBy: row.performed_by,
      actorName: row.performed_by ? names.get(row.performed_by) ?? 'Usuario' : 'Sistema',
      actorRole: row.actor_role,
      createdAt: row.created_at,
    })),
  };
}
