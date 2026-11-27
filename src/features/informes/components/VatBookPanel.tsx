import React from 'react';
import { FlaskConical } from 'lucide-react';
import { useToast } from '@/components/feedback/ToastProvider';
import { downloadSpreadsheet } from '@/features/inventario/excel/excelIO';
import type { VatBookRow } from '../types';
import { VAT_BOOK_COLUMNS, vatBookTable, vatBookTotals } from '../vatBookColumns';
import { ReportPanel } from './ReportPanel';

interface Props {
  report: { rows: VatBookRow[] | null; isLoading: boolean; error: string | null; reload: () => Promise<void> };
  /** Nombre base del archivo (sin extensión). */
  filename: string;
}

/** Libro IVA Ventas: comprobantes autorizados por ARCA, con IVA por alícuota, para el contador. */
export const VatBookPanel: React.FC<Props> = ({ report, filename }) => {
  const { notify } = useToast();
  const rows = report.rows ?? [];
  const isTest = rows.some((r) => r.environment === 'homologacion');

  const exportExcel = async () => {
    try {
      const outcome = await downloadSpreadsheet(vatBookTable(rows), `${filename}.xlsx`);
      if (outcome !== 'cancelled') notify({ message: 'Libro IVA Ventas exportado', detail: `${rows.length} comprobantes` });
    } catch {
      notify({ message: 'No se pudo generar el Excel', detail: 'Probá de nuevo o exportá en CSV.' });
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-text-muted">
        Solo comprobantes autorizados por ARCA, por fecha de emisión. Las notas de crédito restan.
      </p>
      {isTest && (
        <p className="text-[11px] text-warning flex items-center gap-1.5">
          <FlaskConical size={13} /> Ambiente de prueba (homologación): estos comprobantes no tienen validez fiscal.
        </p>
      )}
      <ReportPanel rows={report.rows} isLoading={report.isLoading} error={report.error} columns={VAT_BOOK_COLUMNS}
        totals={vatBookTotals(rows)} rowKey={(r) => r.invoiceId} filename={`${filename}.csv`}
        onReload={() => void report.reload()} onExportExcel={() => void exportExcel()}
        emptyText="No hay comprobantes autorizados por ARCA en este período." />
    </div>
  );
};
