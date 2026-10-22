import React, { useEffect } from 'react';
import { Sale } from '../types';
import { Company } from '@/types';
import { formatCurrency, formatDateTime } from '@/lib/formatters';
import { Button } from '@/components/ui/Button';
import {
  X,
  Printer,
  CheckCircle,
} from 'lucide-react';

interface ReceiptModalProps {
  isOpen: boolean;
  sale: Sale | null;
  company: Company;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  isOpen,
  sale,
  company,
  onClose,
}) => {
  // Handle escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !sale) return null;

  function handlePrint() {
    window.print();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/85 backdrop-blur-sm print:hidden"
        onClick={onClose}
      />

      <div className="relative w-full max-w-lg bg-surface border border-border rounded-2xl shadow-2xl shadow-black/90 z-10 overflow-hidden print:border-none print:shadow-none print:p-0 print:bg-white print:text-black">
        {/* Modal Toolbar (hidden in print) */}
        <div className="p-4 px-6 border-b border-border flex items-center justify-between bg-surface-2/60 print:hidden">
          <div className="flex items-center gap-2">
            <CheckCircle size={18} className="text-emerald-400" />
            <h2 className="text-sm font-bold text-text-primary">
              Venta Registrada Exitosamente
            </h2>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2"
          >
            <X size={18} />
          </button>
        </div>

        {/* Printable Ticket Content Container (80mm Thermal simulator) */}
        <div className="p-6 overflow-y-auto max-h-[75vh] print:max-h-none print:overflow-visible">
          <div
            id="thermal-receipt"
            className="bg-white text-zinc-900 font-mono text-[11px] p-6 rounded-xl border border-zinc-300 shadow-md max-w-[340px] mx-auto print:border-none print:shadow-none print:max-w-full print:p-0"
          >
            {/* Header */}
            <div className="text-center pb-3 border-b border-dashed border-zinc-400 space-y-1">
              <div className="text-base font-extrabold uppercase tracking-wider">
                STOCKLY
              </div>
              <div className="text-xs font-bold uppercase">{company.name}</div>
              <div className="text-[10px] text-zinc-600">
                CUIT: {company.cuit} • {company.industry}
              </div>
              <div className="pt-1 text-[9px] uppercase font-bold text-rose-700 bg-rose-50 border border-rose-200 py-0.5 px-2 rounded">
                COMPROBANTE NO FISCAL - USO INTERNO
              </div>
            </div>

            {/* Sale Meta */}
            <div className="py-2.5 border-b border-dashed border-zinc-400 text-[10px] space-y-1">
              <div className="flex justify-between">
                <span className="font-bold">NRO VENTA:</span>
                <span className="font-bold text-zinc-900">{sale.saleNumber}</span>
              </div>
              <div className="flex justify-between">
                <span>FECHA:</span>
                <span>{formatDateTime(sale.createdAt)}</span>
              </div>
              <div className="flex justify-between">
                <span>CLIENTE:</span>
                <span className="font-medium truncate max-w-[170px]">{sale.clientName}</span>
              </div>
            </div>

            {/* Items Table */}
            <div className="py-2.5 border-b border-dashed border-zinc-400">
              <div className="grid grid-cols-12 text-[10px] font-bold pb-1 text-zinc-700">
                <span className="col-span-2">CANT</span>
                <span className="col-span-6">DETALLE</span>
                <span className="col-span-4 text-right">TOTAL</span>
              </div>

              <div className="space-y-1.5 pt-1">
                {sale.items.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 text-[10px] leading-tight">
                    <span className="col-span-2 font-bold">{item.quantity}</span>
                    <div className="col-span-6 pr-1">
                      <div className="truncate font-medium">{item.name}</div>
                      <div className="text-[9px] text-zinc-500">@{formatCurrency(item.unitPrice)}</div>
                    </div>
                    <span className="col-span-4 text-right font-bold tabular-nums">
                      {formatCurrency(item.subtotal)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Totals & Payments */}
            <div className="py-2.5 border-b border-dashed border-zinc-400 space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span className="tabular-nums">{formatCurrency(sale.subtotal)}</span>
              </div>

              {sale.discountAmount > 0 && (
                <div className="flex justify-between text-zinc-700">
                  <span>Descuento ({sale.discountPercent}%):</span>
                  <span className="tabular-nums">-{formatCurrency(sale.discountAmount)}</span>
                </div>
              )}

              <div className="flex justify-between text-sm font-extrabold pt-1 border-t border-zinc-300">
                <span>TOTAL:</span>
                <span className="tabular-nums">{formatCurrency(sale.total)}</span>
              </div>
            </div>

            {/* Payment breakdown */}
            <div className="py-2.5 border-b border-dashed border-zinc-400 text-[10px] space-y-1">
              <span className="font-bold uppercase">Medios de Pago:</span>
              {sale.payments.map((p, idx) => (
                <div key={idx} className="flex justify-between text-zinc-700">
                  <span className="capitalize">{p.method}:</span>
                  <span className="font-bold tabular-nums">{formatCurrency(p.amount)}</span>
                </div>
              ))}

              {sale.payments.some((p) => p.cashChange && p.cashChange > 0) && (
                <div className="flex justify-between text-zinc-600 pt-1 text-[9px]">
                  <span>Vuelto entregado:</span>
                  <span className="tabular-nums">
                    {formatCurrency(sale.payments.find((p) => p.cashChange)?.cashChange || 0)}
                  </span>
                </div>
              )}
            </div>

            {/* Footer barcode/greeting */}
            <div className="pt-3 text-center space-y-1 text-[9px] text-zinc-500">
              <div>¡Gracias por su compra!</div>
              <div className="font-mono text-[8px] tracking-widest text-zinc-400">
                * {sale.id} *
              </div>
            </div>
          </div>
        </div>

        {/* Modal actions (hidden in print) */}
        <div className="p-4 px-6 border-t border-border bg-surface-2/60 flex items-center justify-between gap-3 print:hidden">
          <Button variant="secondary" size="md" onClick={onClose}>
            Volver a Inventario
          </Button>

          <Button
            variant="primary"
            size="md"
            onClick={handlePrint}
            className="gap-2 shadow-md shadow-primary/25"
          >
            <Printer size={16} />
            <span>Imprimir Ticket (80mm)</span>
          </Button>
        </div>
      </div>
    </div>
  );
};
