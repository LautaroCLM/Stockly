import React, { useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { FileSpreadsheet, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/feedback/ToastProvider';
import { downloadSpreadsheet } from '@/features/inventario/excel/excelIO';
import { useCommissionReport } from '../hooks/useCommissionReport';
import { useSellers } from '../hooks/useSellers';
import type { SellerSummary } from '../types';
import { CommissionsTable } from './CommissionsTable';
import { PayCommissionModal } from './PayCommissionModal';
import { SellerRatesCard } from './SellerRatesCard';

interface Props {
  companyId: string;
  employees: { id: string; fullName: string; status: string }[];
  canOperate: boolean;
}

const DATE_FIELD = 'h-8 px-2 text-xs bg-surface-2 border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary';

/** Personal → Comisiones: porcentajes, informe del período y pago por vendedor. */
export const CommissionsTab: React.FC<Props> = ({ companyId, employees, canOperate }) => {
  const report = useCommissionReport(companyId);
  const sellers = useSellers(companyId);
  const { notify } = useToast();
  const [paying, setPaying] = useState<SellerSummary | null>(null);
  const percentOf = new Map(sellers.sellers.map((s) => [s.id, s.percent]));
  const rates = employees.filter((e) => e.status === 'active').map((e) => ({ id: e.id, fullName: e.fullName, percent: percentOf.get(e.id) ?? null }));

  const exportExcel = async () => {
    const rows = (report.summaries ?? []).map((s) => [s.employeeName, s.salesCount, s.salesTotal, s.deductions, s.commission, s.paid, s.pending]);
    try {
      const outcome = await downloadSpreadsheet(
        { headers: ['Vendedor', 'Ventas', 'Total vendido', 'Devoluciones y anulaciones', 'Comisión', 'Pagado', 'Pendiente'], rows },
        `comisiones_${report.period.from}_${report.period.to}.xlsx`
      );
      if (outcome !== 'cancelled') notify({ message: 'Comisiones exportadas', detail: `${rows.length} vendedores` });
    } catch {
      notify({ message: 'No se pudo generar el Excel', detail: 'Probá de nuevo.' });
    }
  };

  return (
    <div className="space-y-4">
      <SellerRatesCard companyId={companyId} employees={rates} canOperate={canOperate} onSaved={() => { void sellers.reload(); void report.reload(); }} />

      <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
        <label htmlFor="com-from">Desde</label>
        <input id="com-from" type="date" value={report.period.from} className={DATE_FIELD}
          onChange={(e) => report.setPeriod((p) => ({ ...p, from: e.target.value }))} />
        <label htmlFor="com-to">hasta</label>
        <input id="com-to" type="date" value={report.period.to} className={DATE_FIELD}
          onChange={(e) => report.setPeriod((p) => ({ ...p, to: e.target.value }))} />
        <Button size="sm" variant="secondary" className="h-8 gap-1.5 ml-auto" disabled={!report.summaries?.length} onClick={() => void exportExcel()}>
          <FileSpreadsheet size={14} /><span>Exportar Excel</span>
        </Button>
      </div>

      {report.error && <p role="alert" className="text-xs text-danger">{report.error}</p>}
      {report.summaries === null ? (
        !report.error && <p className="py-10 text-center text-xs text-text-muted"><Loader2 size={14} className="inline animate-spin mr-2" />Calculando comisiones...</p>
      ) : report.summaries.length === 0 ? (
        <p className="py-10 text-center text-xs text-text-muted">No hay ventas con vendedor en este período. El vendedor se elige al cobrar.</p>
      ) : (
        <CommissionsTable summaries={report.summaries} canPay={canOperate} onPay={setPaying} />
      )}

      <AnimatePresence>
        {paying && (
          <PayCommissionModal companyId={companyId} summary={paying} period={report.period} onClose={() => setPaying(null)}
            onPaid={() => { setPaying(null); void report.reload(); notify({ message: `Comisión de ${paying.employeeName} pagada` }); }} />
        )}
      </AnimatePresence>
    </div>
  );
};
