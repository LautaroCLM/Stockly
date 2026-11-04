import React from 'react';
import { Ban, Eye, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, formatDateShort } from '@/lib/formatters';
import type { Purchase } from '../types';

interface PurchasesTableProps {
  purchases: Purchase[];
  total: number;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  onViewDetail: (purchase: Purchase) => void;
  onCancel: (purchase: Purchase) => void;
}

/** Listado de compras con detalle, anulación y "cargar más". */
export const PurchasesTable: React.FC<PurchasesTableProps> = ({
  purchases,
  total,
  hasMore,
  isLoadingMore,
  onLoadMore,
  onViewDetail,
  onCancel,
}) => (
  <div className="border border-border rounded-xl bg-surface overflow-hidden shadow-sm">
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="bg-surface-2/70 border-b border-border text-[11px] font-semibold text-text-muted uppercase tracking-wider">
          <tr>
            <th className="py-3 px-4">Nro. Compra</th>
            <th className="py-3 px-4">Fecha</th>
            <th className="py-3 px-4">Proveedor</th>
            <th className="py-3 px-4">Factura / Remito</th>
            <th className="py-3 px-4 text-center">Ítems</th>
            <th className="py-3 px-4 text-right">Total</th>
            <th className="py-3 px-4 text-center">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {purchases.map((p) => (
            <tr key={p.id} className="hover:bg-surface-2/40 transition-colors">
              <td className="py-3 px-4">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-semibold text-text-primary">{p.purchaseNumber}</span>
                  {p.status === 'cancelled' && (
                    <Badge variant="danger" size="sm" title={p.cancelReason ?? undefined}>Anulada</Badge>
                  )}
                </div>
              </td>
              <td className="py-3 px-4 text-text-secondary whitespace-nowrap">{formatDateShort(p.purchaseDate || p.createdAt)}</td>
              <td className="py-3 px-4">
                <div className="font-medium text-text-primary">{p.supplier?.name || '-'}</div>
                {p.supplier?.taxId && <div className="text-[10px] text-text-muted font-mono">CUIT: {p.supplier.taxId}</div>}
              </td>
              <td className="py-3 px-4 text-text-secondary font-mono">{p.invoiceNumber || <span className="text-text-muted">-</span>}</td>
              <td className="py-3 px-4 text-center">
                <Badge variant="neutral" size="sm">{p.items?.length || 0}</Badge>
              </td>
              <td className={`py-3 px-4 text-right font-bold font-mono whitespace-nowrap ${
                p.status === 'cancelled' ? 'text-text-muted line-through' : 'text-text-primary'
              }`}>
                {formatCurrency(p.totalAmount)}
              </td>
              <td className="py-3 px-4">
                <div className="flex items-center justify-center gap-1.5">
                  <Button variant="secondary" size="sm" onClick={() => onViewDetail(p)} className="h-7 px-2.5 text-[11px]">
                    <Eye size={13} className="mr-1" /> Detalle
                  </Button>
                  {p.status === 'completed' && (
                    <Button variant="secondary" size="sm" onClick={() => onCancel(p)} className="h-7 px-2.5 text-[11px] hover:text-danger" title="Anular compra">
                      <Ban size={13} className="mr-1" /> Anular
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    <div className="p-3 border-t border-border/60 flex items-center justify-between gap-3 text-[11px] text-text-muted">
      <span>
        Mostrando <strong className="text-text-primary tabular-nums">{purchases.length}</strong> de{' '}
        <strong className="text-text-primary tabular-nums">{total}</strong> compras
      </span>
      {hasMore && (
        <Button variant="secondary" size="sm" onClick={onLoadMore} disabled={isLoadingMore}>
          {isLoadingMore ? <Loader2 size={14} className="animate-spin" /> : <span>Cargar más ({total - purchases.length} restantes)</span>}
        </Button>
      )}
    </div>
  </div>
);
