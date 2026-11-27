import React, { useState } from 'react';
import { ChevronDown, ChevronRight, HandCoins } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency } from '@/lib/formatters';
import { formatLotDate } from '@/features/vencimientos/lotStatus';
import type { CommissionKind, SellerSummary } from '../types';

interface Props {
  summaries: SellerSummary[];
  canPay: boolean;
  onPay: (summary: SellerSummary) => void;
}

const KIND_LABEL: Record<CommissionKind, string> = { sale: 'Venta', cancellation: 'Anulación', return: 'Devolución' };

/** Comisión por vendedor del período; cada fila se abre con el detalle de ventas, devoluciones y anulaciones. */
export const CommissionsTable: React.FC<Props> = ({ summaries, canPay, onPay }) => {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="overflow-x-auto border border-border rounded-xl">
      <table className="w-full text-xs min-w-[640px]">
        <thead>
          <tr className="text-text-muted border-b border-border">
            <th className="p-2.5 text-left">Vendedor</th>
            <th className="p-2.5 text-right">Ventas</th>
            <th className="p-2.5 text-right">Vendido</th>
            <th className="p-2.5 text-right" title="Devoluciones y anulaciones">Devol. y anul.</th>
            <th className="p-2.5 text-right">Comisión</th>
            <th className="p-2.5 text-right">Pagado</th>
            <th className="p-2.5 text-right">Pendiente</th>
            {canPay && <th className="p-2.5" aria-label="Acciones" />}
          </tr>
        </thead>
        <tbody>
          {summaries.map((s) => (
            <React.Fragment key={s.employeeId}>
              <tr className="border-b border-border/60 cursor-pointer hover:bg-surface-2/40" onClick={() => setOpen(open === s.employeeId ? null : s.employeeId)}>
                <td className="p-2.5 font-medium text-text-primary">
                  <span className="inline-flex items-center gap-1">
                    {open === s.employeeId ? <ChevronDown size={13} /> : <ChevronRight size={13} />}{s.employeeName}
                  </span>
                </td>
                <td className="p-2.5 text-right tabular-nums">{s.salesCount}</td>
                <td className="p-2.5 text-right tabular-nums">{formatCurrency(s.salesTotal)}</td>
                <td className="p-2.5 text-right tabular-nums text-text-secondary">{s.deductions > 0 ? `−${formatCurrency(s.deductions)}` : '—'}</td>
                <td className="p-2.5 text-right tabular-nums font-semibold text-text-primary">{formatCurrency(s.commission)}</td>
                <td className="p-2.5 text-right tabular-nums text-emerald-400">{s.paid !== 0 ? formatCurrency(s.paid) : '—'}</td>
                <td className="p-2.5 text-right tabular-nums font-bold text-warning">{s.pending !== 0 ? formatCurrency(s.pending) : '—'}</td>
                {canPay && (
                  <td className="p-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                    {s.paid === 0 && s.commission > 0 ? (
                      <Button size="sm" variant="primary" className="h-7 px-2.5 text-xs gap-1" onClick={() => onPay(s)}>
                        <HandCoins size={13} /><span>Pagar</span>
                      </Button>
                    ) : s.paid !== 0 && s.pending !== 0 ? (
                      <span className="text-[10px] text-text-muted" title="Elegí solo las fechas sin pagar para pagar el resto">Pago parcial</span>
                    ) : s.paid !== 0 ? <Badge variant="success" size="sm">Pagado</Badge> : null}
                  </td>
                )}
              </tr>
              {open === s.employeeId && s.entries.map((e, i) => (
                <tr key={`${e.saleId}-${e.kind}-${i}`} className="border-b border-border/40 bg-surface-2/30 text-text-secondary">
                  <td className="p-2 pl-8">{formatLotDate(e.date)} · {KIND_LABEL[e.kind]} {e.documentNumber}</td>
                  <td className="p-2" />
                  <td className="p-2 text-right tabular-nums">{e.kind === 'sale' ? formatCurrency(e.base) : ''}</td>
                  <td className="p-2 text-right tabular-nums">{e.kind !== 'sale' ? `−${formatCurrency(-e.base)}` : ''}</td>
                  <td className="p-2 text-right tabular-nums">{formatCurrency(e.commission)} <span className="text-text-muted">({e.percent} %)</span></td>
                  <td className="p-2 text-right" colSpan={canPay ? 3 : 2}>{e.isPaid ? <span className="text-emerald-400">pagado</span> : ''}</td>
                </tr>
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
};
