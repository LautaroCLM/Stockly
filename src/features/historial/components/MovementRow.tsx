import React from 'react';
import { FileText, User } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { formatDateTime } from '@/lib/formatters';
import type { StockMovement } from '@/features/inventario/types';

type BadgeVariant = 'success' | 'danger' | 'warning' | 'primary' | 'neutral';

export const REASON_LABELS: Record<string, { label: string; badge: BadgeVariant }> = {
  initial_load: { label: 'Carga Inicial', badge: 'primary' },
  import: { label: 'Importación Excel', badge: 'primary' },
  purchase: { label: 'Entrada / Compra', badge: 'success' },
  physical_count: { label: 'Conteo Físico', badge: 'warning' },
  loss_damage: { label: 'Merma / Rotura', badge: 'danger' },
  internal_use: { label: 'Consumo Interno', badge: 'danger' },
  sale: { label: 'Venta Mostrador', badge: 'neutral' },
  cancellation: { label: 'Anulación Venta', badge: 'warning' },
  purchase_cancellation: { label: 'Anulación Compra', badge: 'warning' },
};

/** Un movimiento de stock: fecha, producto, motivo, variación, saldo, comprobante y autor. */
export const MovementRow: React.FC<{ movement: StockMovement }> = ({ movement: mov }) => {
  const reason = REASON_LABELS[mov.reason] || { label: mov.reason, badge: 'neutral' as const };
  const isIncrease = mov.direction === 'increase';
  const reference = mov.referenceDoc || mov.referenceSaleId;

  return (
    <tr className="hover:bg-surface-2/50 transition-colors">
      <td className="py-3 px-4 text-text-secondary whitespace-nowrap">{formatDateTime(mov.createdAt)}</td>
      <td className="py-3 px-3">
        <div className="flex flex-col min-w-0 max-w-xs">
          <span className="font-medium text-text-primary truncate">{mov.productName}</span>
          <span className="font-mono text-[11px] text-text-muted">{mov.productSku}</span>
        </div>
      </td>
      <td className="py-3 px-3">
        <Badge variant={reason.badge} size="sm">{reason.label}</Badge>
      </td>
      <td className="py-3 px-3 text-right font-mono font-bold tabular-nums">
        <span className={isIncrease ? 'text-emerald-400' : 'text-danger'}>
          {isIncrease ? '+' : '-'}{mov.quantity}
        </span>
      </td>
      <td className="py-3 px-3 text-center font-mono text-[11px] tabular-nums text-text-muted">
        <span>{mov.previousStock}</span>
        <span className="mx-1 text-text-muted/60">&rarr;</span>
        <span className={`font-bold ${mov.newStock < 0 ? 'text-danger font-extrabold' : 'text-text-primary'}`}>{mov.newStock}</span>
      </td>
      <td className="py-3 px-3">
        {reference ? (
          <span className="inline-flex items-center gap-1 font-mono text-[11px] px-2 py-0.5 rounded bg-surface-2 text-text-secondary border border-border">
            <FileText size={11} className="text-text-muted" />
            {reference}
          </span>
        ) : (
          <span className="text-text-muted">—</span>
        )}
      </td>
      <td className="py-3 px-3 text-[11px] text-text-secondary whitespace-nowrap">
        <span className="inline-flex items-center gap-1">
          <User size={11} className="text-text-muted" />
          <span>{mov.createdBy || 'Usuario'}</span>
        </span>
      </td>
      <td className="py-3 px-4 text-[11px] text-text-muted max-w-xs truncate">{mov.notes || '—'}</td>
    </tr>
  );
};
