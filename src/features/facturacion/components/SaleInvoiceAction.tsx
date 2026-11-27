import React from 'react';
import { FileCheck2, FileClock, FileX2, ReceiptText } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { InvoiceSummary } from '../invoiceTypes';
import { invoiceLabel } from '../invoiceFormat';

interface Props {
  invoice: InvoiceSummary | undefined;
  /** La venta se puede facturar (completada, sin devoluciones). */
  canInvoiceSale: boolean;
  /** El usuario puede facturar y la empresa emite factura electrónica. */
  canInvoice: boolean;
  onOpen: (invoiceId: string | null) => void;
}

const BUTTON = 'h-7 px-2.5 text-xs gap-1';

/** Estado de la factura de una venta en el historial: ver, reintentar o facturar. */
export const SaleInvoiceAction: React.FC<Props> = ({ invoice, canInvoiceSale, canInvoice, onOpen }) => {
  if (invoice?.status === 'authorized') {
    return (
      <Button variant="secondary" size="sm" className={BUTTON} title={invoiceLabel(invoice)} onClick={() => onOpen(invoice.id)}>
        <FileCheck2 size={13} className="text-success" /><span>Factura {invoice.letter}</span>
      </Button>
    );
  }
  if (!canInvoice) return null;
  if (invoice?.status === 'pending') {
    return (
      <Button variant="secondary" size="sm" className={`${BUTTON} text-warning`} title={invoice.arcaMessage ?? 'Factura sin CAE'} onClick={() => onOpen(invoice.id)}>
        <FileClock size={13} /><span>Factura pendiente</span>
      </Button>
    );
  }
  if (!canInvoiceSale) return null;
  const rejected = invoice?.status === 'rejected';
  return (
    <Button variant="secondary" size="sm" className={BUTTON} title={rejected ? `Rechazada: ${invoice?.arcaMessage ?? ''}` : 'Emitir factura electrónica'}
      onClick={() => onOpen(null)}>
      {rejected ? <FileX2 size={13} className="text-danger" /> : <ReceiptText size={13} />}
      <span>Facturar</span>
    </Button>
  );
};
