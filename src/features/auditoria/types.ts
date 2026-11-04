export type AuditAction = 'INSERT' | 'UPDATE' | 'DELETE';

/** Fila de audit_log ya traducida para la interfaz. */
export interface AuditEntry {
  id: string;
  tableName: string;
  recordId: string | null;
  action: AuditAction;
  oldData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
  performedBy: string | null;
  actorName: string;
  actorRole: string | null;
  createdAt: string;
}

export interface AuditFilters {
  tableName: 'all' | string;
  action: 'all' | AuditAction;
}

export interface AuditChange {
  field: string;
  before: string;
  after: string;
}
