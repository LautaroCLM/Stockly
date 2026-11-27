import React from 'react';
import { CalendarPlus, Pencil, Split, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { describeDaysLeft, formatLotDate, lotStatus } from '../lotStatus';
import type { LotStatus, StockLot } from '../types';
import type { LotAction } from './LotActionModal';

interface Props {
  lots: StockLot[];
  warningDays: number;
  canOperate: boolean;
  onAction: (lot: StockLot, action: LotAction) => void;
}

const STATUS_CLASS: Record<LotStatus, string> = {
  expired: 'bg-danger/15 text-danger border-danger/30',
  soon: 'bg-warning/15 text-warning border-warning/30',
  ok: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  undated: 'bg-surface-2 text-text-muted border-border',
};

const formatQty = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 2 });

/** Lotes con lo que queda, del que vence primero al último; "sin fecha" al final. */
export const LotsTable: React.FC<Props> = ({ lots, warningDays, canOperate, onAction }) => (
  <div className="overflow-x-auto border border-border rounded-xl">
    <table className="w-full text-xs min-w-[640px]">
      <thead>
        <tr className="text-text-muted border-b border-border text-left">
          <th className="p-2.5">Producto</th>
          <th className="p-2.5">Lote</th>
          <th className="p-2.5">Vence</th>
          <th className="p-2.5 text-right">Queda</th>
          {canOperate && <th className="p-2.5" aria-label="Acciones" />}
        </tr>
      </thead>
      <tbody>
        {lots.map((lot) => {
          const status = lotStatus(lot, warningDays);
          return (
            <tr key={lot.id} className="border-b border-border/60">
              <td className="p-2.5">
                <div className="font-medium text-text-primary">{lot.productName}</div>
                <div className="text-text-muted font-mono">{lot.sku}</div>
              </td>
              <td className="p-2.5 text-text-secondary">
                <div>{lot.lotCode ?? '—'}</div>
                {lot.purchaseNumber && <div className="text-[10px] text-text-muted">{lot.purchaseNumber}</div>}
              </td>
              <td className="p-2.5">
                <div className="text-text-primary tabular-nums">{formatLotDate(lot.expiresOn)}</div>
                <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded border text-[10px] font-semibold ${STATUS_CLASS[status]}`}>
                  {describeDaysLeft(lot.daysLeft)}
                </span>
              </td>
              <td className="p-2.5 text-right tabular-nums font-semibold text-text-primary whitespace-nowrap">
                {formatQty(lot.remaining)} {lot.unit}
              </td>
              {canOperate && (
                <td className="p-2.5 text-right whitespace-nowrap space-x-1.5">
                  <Button size="sm" variant="secondary" className="h-7 px-2" title={lot.expiresOn ? 'Editar fecha y lote' : 'Cargar fecha'}
                    onClick={() => onAction(lot, 'edit')}>
                    {lot.expiresOn ? <Pencil size={13} /> : <CalendarPlus size={13} />}
                  </Button>
                  <Button size="sm" variant="secondary" className="h-7 px-2" title="Separar unidades con otra fecha" onClick={() => onAction(lot, 'split')}>
                    <Split size={13} />
                  </Button>
                  <Button size="sm" variant="secondary" className="h-7 px-2 hover:text-danger" title="Dar de baja (pérdida)" onClick={() => onAction(lot, 'writeOff')}>
                    <Trash2 size={13} />
                  </Button>
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);
