import React from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { formatCurrency, formatDateTime } from '@/lib/formatters';
import { differenceKind } from '../cashMath';
import { useCashHistory } from '../hooks/useCashHistory';

const DIFF_CLASS = { exact: 'text-emerald-400', surplus: 'text-warning', shortage: 'text-danger' } as const;

/** Cajas cerradas con su arqueo: esperado, contado y diferencia. */
export const CashHistoryTable: React.FC<{ companyId: string }> = ({ companyId }) => {
  const { sessions, total, hasMore, isLoading, isLoadingMore, error, reload, loadMore } = useCashHistory(companyId);

  return (
    <Card>
      <CardContent className="p-5 text-xs space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-text-primary">Cajas cerradas</h2>
          <span className="text-text-muted">{total} en total</span>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger flex items-center gap-2">
            <AlertTriangle size={14} />
            <span className="flex-1">{error}</span>
            <Button variant="secondary" size="sm" onClick={() => void reload()}>Reintentar</Button>
          </div>
        )}

        {isLoading && sessions.length === 0 ? (
          <p className="py-6 text-center text-text-muted">
            <Loader2 size={14} className="inline animate-spin mr-2 text-primary" />
            Cargando historial de cajas...
          </p>
        ) : sessions.length === 0 ? (
          !error && <p className="py-6 text-center text-text-muted">Todavía no se cerró ninguna caja.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="text-[11px] uppercase tracking-wide text-text-muted">
                <tr>
                  <th className="py-2 pr-3 font-semibold">Apertura</th>
                  <th className="py-2 pr-3 font-semibold">Cierre</th>
                  <th className="py-2 pr-3 font-semibold text-right">Esperado</th>
                  <th className="py-2 pr-3 font-semibold text-right">Contado</th>
                  <th className="py-2 pr-3 font-semibold text-right">Diferencia</th>
                  <th className="py-2 font-semibold">Observación</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => {
                  const difference = s.differenceAmount ?? 0;
                  return (
                    <tr key={s.id} className="border-t border-border/50 align-top">
                      <td className="py-2 pr-3 whitespace-nowrap">
                        <div className="text-text-primary">{formatDateTime(s.openedAt)}</div>
                        <div className="text-[11px] text-text-muted">{s.openedByName}</div>
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        <div className="text-text-primary">{s.closedAt ? formatDateTime(s.closedAt) : '—'}</div>
                        <div className="text-[11px] text-text-muted">{s.closedByName ?? ''}</div>
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{formatCurrency(s.expectedAmount ?? 0)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{formatCurrency(s.countedAmount ?? 0)}</td>
                      <td className={`py-2 pr-3 text-right tabular-nums font-semibold ${DIFF_CLASS[differenceKind(difference)]}`}>
                        {formatCurrency(difference)}
                      </td>
                      <td className="py-2 text-text-secondary break-words">{s.closingNotes ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {hasMore && !isLoading && (
          <div className="flex justify-center">
            <Button variant="secondary" size="sm" onClick={() => void loadMore()} disabled={isLoadingMore}>
              {isLoadingMore ? 'Cargando...' : 'Cargar más'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
