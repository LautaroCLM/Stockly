import React from 'react';
import { Ban, Eye } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, formatDateTime } from '@/lib/formatters';
import type { Sale } from '@/features/inventario/types';
import { paymentMethodLabel } from '@/features/inventario/paymentMethods';

interface SaleRowProps {
  sale: Sale;
  canCancel: boolean;
  onViewReceipt: (sale: Sale) => void;
  onCancel: (sale: Sale) => void;
}

/** Una venta del historial: comprobante, cliente, ítems, medios de pago y total. */
export const SaleRow: React.FC<SaleRowProps> = ({ sale, canCancel, onViewReceipt, onCancel }) => {
  const isCancelled = sale.status === 'anulada';
  return (
    <tr className="hover:bg-surface-2/50 transition-colors group">
      <td className="py-3 px-4">
        <div className="flex items-center gap-1.5">
          <span className="font-mono font-bold text-text-primary text-xs">{sale.saleNumber}</span>
          {isCancelled && (
            <Badge variant="danger" size="sm" title={sale.cancelReason ?? undefined}>Anulada</Badge>
          )}
        </div>
      </td>
      <td className="py-3 px-3 text-text-secondary">{formatDateTime(sale.createdAt)}</td>
      <td className="py-3 px-3">
        <span className="font-medium text-text-primary">{sale.clientName}</span>
      </td>
      <td className="py-3 px-3 text-center">
        <Badge variant="neutral" size="sm">{sale.items.reduce((acc, i) => acc + i.quantity, 0)} u.</Badge>
      </td>
      <td className="py-3 px-3">
        <div className="flex flex-wrap gap-1">
          {sale.payments.map((p, pIdx) => (
            <Badge key={pIdx} variant={p.method === 'efectivo' ? 'success' : 'accent'} size="sm" className="text-[10px]">
              {paymentMethodLabel(p.method)}
            </Badge>
          ))}
        </div>
      </td>
      <td className={`py-3 px-4 text-right font-bold tabular-nums ${isCancelled ? 'text-text-muted line-through' : 'text-text-primary'}`}>
        {formatCurrency(sale.total)}
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center justify-center gap-1.5">
          <Button variant="secondary" size="sm" onClick={() => onViewReceipt(sale)} className="h-7 px-2.5 text-xs gap-1" title="Ver ticket de venta">
            <Eye size={13} />
            <span>Ticket</span>
          </Button>
          {canCancel && sale.status === 'completada' && (
            <Button variant="secondary" size="sm" onClick={() => onCancel(sale)} className="h-7 px-2.5 text-xs gap-1 hover:text-danger" title="Anular venta">
              <Ban size={13} />
              <span>Anular</span>
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
};
