import React, { useEffect } from 'react';
import { Sale } from '../types';
import { Company } from '@/types';
import { Button } from '@/components/ui/Button';
import { ReceiptTicket } from './ReceiptTicket';
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
              {sale.status === 'anulada' ? 'Comprobante de venta anulada' : 'Comprobante de venta'}
            </h2>
          </div>

          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2"
          >
            <X size={18} />
          </button>
        </div>

        {/* Printable Ticket Content Container (80mm Thermal simulator) */}
        <div className="p-6 overflow-y-auto max-h-[75vh] print:max-h-none print:overflow-visible">
          <ReceiptTicket sale={sale} company={company} />
        </div>

        {/* Modal actions (hidden in print) */}
        <div className="p-4 px-6 border-t border-border bg-surface-2/60 flex items-center justify-between gap-3 print:hidden">
          <Button variant="secondary" size="md" onClick={onClose}>
            Cerrar
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
