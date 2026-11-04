import React from 'react';
import { Badge } from '@/components/ui/Badge';
import { formatDateTime } from '@/lib/formatters';
import { AUDIT_ACTION_LABELS, describeRecord, diffAuditData, tableLabel } from '../auditDescribe';
import type { AuditAction, AuditEntry } from '../types';

const ACTION_BADGE: Record<AuditAction, 'primary' | 'warning' | 'accent'> = {
  INSERT: 'primary',
  UPDATE: 'accent',
  DELETE: 'warning',
};

const ROLE_LABELS: Record<string, string> = {
  master_admin: 'Administrador',
  employee: 'Empleado',
};

/** Fila del registro de auditoría: quién, cuándo, qué registro y qué cambió. */
export const AuditEntryRow: React.FC<{ entry: AuditEntry }> = ({ entry }) => {
  const record = describeRecord(entry);
  const changes = entry.action === 'UPDATE' ? diffAuditData(entry.oldData, entry.newData) : [];

  return (
    <tr className="border-b border-border/50 align-top hover:bg-surface-2/40">
      <td className="px-4 py-3 text-xs text-text-secondary whitespace-nowrap">
        {formatDateTime(entry.createdAt)}
      </td>
      <td className="px-4 py-3 text-xs">
        <div className="text-text-primary font-medium">{entry.actorName}</div>
        {entry.actorRole && (
          <div className="text-[11px] text-text-muted">{ROLE_LABELS[entry.actorRole] ?? entry.actorRole}</div>
        )}
      </td>
      <td className="px-4 py-3 text-xs">
        <Badge variant={ACTION_BADGE[entry.action]}>{AUDIT_ACTION_LABELS[entry.action]}</Badge>
      </td>
      <td className="px-4 py-3 text-xs">
        <div className="text-text-primary">{tableLabel(entry.tableName)}</div>
        {record && <div className="text-[11px] text-text-muted break-all">{record}</div>}
      </td>
      <td className="px-4 py-3 text-[11px] text-text-secondary">
        {entry.action !== 'UPDATE' && <span className="text-text-muted">—</span>}
        {entry.action === 'UPDATE' && changes.length === 0 && (
          <span className="text-text-muted">Sin cambios visibles</span>
        )}
        {changes.length > 0 && (
          <ul className="space-y-0.5">
            {changes.slice(0, 6).map((change) => (
              <li key={change.field}>
                <span className="text-text-muted">{change.field}:</span>{' '}
                <span className="line-through text-text-muted/80 break-all">{change.before}</span>{' '}
                → <span className="text-text-primary break-all">{change.after}</span>
              </li>
            ))}
            {changes.length > 6 && <li className="text-text-muted">y {changes.length - 6} cambios más</li>}
          </ul>
        )}
      </td>
    </tr>
  );
};
