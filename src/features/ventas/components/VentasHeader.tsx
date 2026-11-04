import React from 'react';
import { Info, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/formatters';

interface VentasHeaderProps {
  companyName: string;
  completedCount: number;
  completedTotal: number;
  onNewSale: () => void;
}

/** Título del historial de ventas, regla de anulación y total de lo mostrado. */
export const VentasHeader: React.FC<VentasHeaderProps> = ({ companyName, completedCount, completedTotal, onNewSale }) => (
  <>
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border/60">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/25 flex items-center justify-center text-accent">
          <Receipt size={22} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-text-primary">Historial de Ventas y Comprobantes</h1>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-surface-2 text-text-muted border border-border">{companyName}</span>
          </div>
          <p className="text-xs text-text-muted mt-0.5">Registro inmutable de transacciones completadas y reimpresión de comprobantes.</p>
        </div>
      </div>
      <Button variant="primary" size="sm" onClick={onNewSale} className="shadow-sm">
        <span>Nueva Venta</span>
      </Button>
    </div>

    <div className="bg-surface-2/60 border border-border rounded-xl p-3 px-4 flex items-center justify-between gap-3 text-xs">
      <div className="flex items-center gap-2 text-text-secondary">
        <Info size={15} className="text-primary shrink-0" />
        <span>
          <strong>Control Inmutable:</strong> Las ventas no se editan. Un administrador puede anularlas indicando el motivo: el stock
          se repone y la venta queda en el historial como anulada.
        </span>
      </div>
      <span className="text-[11px] text-text-muted font-mono shrink-0">
        Total de las {completedCount} ventas completadas mostradas: {formatCurrency(completedTotal)}
      </span>
    </div>
  </>
);
