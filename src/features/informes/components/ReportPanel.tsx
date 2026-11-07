import { AlertTriangle, Download, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { downloadCsv, toCsv } from '../csv';
import type { ReportColumn } from '../types';

interface ReportPanelProps<T> {
  rows: T[] | null;
  isLoading: boolean;
  error: string | null;
  columns: ReportColumn<T>[];
  /** Texto de cada columna en la fila de totales (por clave); las que faltan quedan vacías. */
  totals?: Record<string, string>;
  rowKey: (row: T) => string;
  filename: string;
  emptyText: string;
  onReload: () => void;
}

/** Tabla de un informe con estados de carga, vacío y error, y exportación a CSV. */
export function ReportPanel<T>({ rows, isLoading, error, columns, totals, rowKey, filename, emptyText, onReload }: ReportPanelProps<T>) {
  const exportCsv = () => {
    if (!rows) return;
    const body = rows.map((row) => columns.map((c) => c.csv(row)));
    if (totals) body.push(columns.map((c, i) => (i === 0 ? 'TOTAL' : totals[c.key] ?? '')));
    downloadCsv(filename, toCsv(columns.map((c) => c.header), body));
  };

  return (
    <div className="space-y-3">
      {error && (
        <div role="alert" className="p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs flex items-center gap-2">
          <AlertTriangle size={14} />
          <span className="flex-1">{error}</span>
          <Button variant="secondary" size="sm" onClick={onReload}>Reintentar</Button>
        </div>
      )}
      {rows === null ? (
        !error && (
          <p className="py-12 text-center text-xs text-text-muted">
            <Loader2 size={16} className="inline animate-spin mr-2 text-primary" />
            Generando el informe...
          </p>
        )
      ) : rows.length === 0 ? (
        <p className="py-12 text-center text-xs text-text-muted">{emptyText}</p>
      ) : (
        <>
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span>{rows.length} {rows.length === 1 ? 'fila' : 'filas'}{isLoading && ' · actualizando...'}</span>
            <Button variant="secondary" size="sm" onClick={exportCsv} className="gap-1.5 h-8">
              <Download size={13} />
              <span>Exportar CSV</span>
            </Button>
          </div>
          <Card className="border-border bg-surface overflow-x-auto">
            <table className="w-full text-xs min-w-[560px]">
              <thead>
                <tr className="text-text-muted border-b border-border">
                  {columns.map((c) => (
                    <th key={c.key} className={`p-3 font-semibold ${c.align === 'right' ? 'text-right' : 'text-left'}`}>{c.header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={rowKey(row)} className="border-b border-border/60">
                    {columns.map((c) => (
                      <td key={c.key} className={`p-3 text-text-secondary ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}>{c.render(row)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {totals && (
                <tfoot>
                  <tr className="font-bold text-text-primary">
                    {columns.map((c, i) => (
                      <td key={c.key} className={`p-3 ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}>{i === 0 ? 'Total' : totals[c.key] ?? ''}</td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
