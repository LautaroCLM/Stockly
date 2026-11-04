import React from 'react';
import { AlertTriangle, Loader2, RotateCcw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import type { Company } from '@/types';
import { useAuditLog } from './hooks/useAuditLog';
import { AuditEntryRow } from './components/AuditEntryRow';
import { AUDIT_ACTION_LABELS, AUDIT_TABLE_LABELS } from './auditDescribe';
import type { AuditAction } from './types';

interface AuditLogPageProps {
  company: Company;
  isMasterAdmin: boolean;
}

const SELECT_CLASS =
  'h-8 px-2.5 text-xs bg-surface-2 border border-border rounded-lg text-text-primary focus:outline-none cursor-pointer';

export const AuditLogPage: React.FC<AuditLogPageProps> = ({ company, isMasterAdmin }) => {
  const { entries, total, hasMore, filters, setFilters, isLoading, isLoadingMore, error, reload, loadMore } =
    useAuditLog(company.id, isMasterAdmin);

  if (!isMasterAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center gap-2 text-text-muted">
        <ShieldAlert size={32} className="text-warning" />
        <p className="text-sm font-semibold text-text-primary">Solo los administradores pueden ver la auditoría</p>
        <p className="text-xs">Pedile a un administrador de {company.name} que revise el registro.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-surface-2 border border-border flex items-center justify-center">
            <ShieldCheck size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary">Auditoría</h1>
            <p className="text-xs text-text-muted">
              Registro de altas, modificaciones y bajas hechas por los usuarios de {company.name}.
            </p>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void reload()} disabled={isLoading} className="gap-1.5">
          <RotateCcw size={14} className={isLoading ? 'animate-spin' : ''} />
          <span>Actualizar</span>
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-3 text-xs">
          <select
            aria-label="Filtrar por sección"
            className={SELECT_CLASS}
            value={filters.tableName}
            onChange={(e) => setFilters((prev) => ({ ...prev, tableName: e.target.value }))}
          >
            <option value="all">Todas las secciones</option>
            {Object.entries(AUDIT_TABLE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <select
            aria-label="Filtrar por acción"
            className={SELECT_CLASS}
            value={filters.action}
            onChange={(e) => setFilters((prev) => ({ ...prev, action: e.target.value as 'all' | AuditAction }))}
          >
            <option value="all">Todas las acciones</option>
            {(Object.keys(AUDIT_ACTION_LABELS) as AuditAction[]).map((action) => (
              <option key={action} value={action}>{AUDIT_ACTION_LABELS[action]}</option>
            ))}
          </select>
          <span className="ml-auto text-text-muted">
            Mostrando {entries.length} de {total} registros
          </span>
        </CardContent>
      </Card>

      {error && (
        <div className="p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs flex items-center gap-2">
          <AlertTriangle size={14} />
          <span className="flex-1">{error}</span>
          <Button variant="secondary" size="sm" onClick={() => void reload()}>Reintentar</Button>
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-surface-2/60 text-[11px] uppercase tracking-wide text-text-muted">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Fecha y hora</th>
                <th className="px-4 py-2.5 font-semibold">Usuario</th>
                <th className="px-4 py-2.5 font-semibold">Acción</th>
                <th className="px-4 py-2.5 font-semibold">Registro</th>
                <th className="px-4 py-2.5 font-semibold">Cambios</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && entries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-xs text-text-muted">
                    <Loader2 size={16} className="inline animate-spin mr-2 text-primary" />
                    Cargando registro de auditoría...
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-xs text-text-muted">
                    {!error && 'No hay registros con estos filtros.'}
                  </td>
                </tr>
              ) : (
                entries.map((entry) => <AuditEntryRow key={entry.id} entry={entry} />)
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {hasMore && !isLoading && (
        <div className="flex justify-center">
          <Button variant="secondary" size="sm" onClick={() => void loadMore()} disabled={isLoadingMore}>
            {isLoadingMore ? 'Cargando...' : 'Cargar más'}
          </Button>
        </div>
      )}
    </div>
  );
};
