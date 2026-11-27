import React from 'react';
import { FileCheck2, FileClock, FileMinus2, FileX2, ReceiptText } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/formatters';
import type { CreditNoteNeed, SaleInvoicesState } from '../invoiceTypes';
import { invoiceLabel } from '../invoiceFormat';

interface Props {
  state: SaleInvoicesState | undefined;
  /** La venta se puede facturar (completada, sin devoluciones). */
  canInvoiceSale: boolean;
  /** El usuario puede facturar y la empresa emite factura electrónica. */
  canInvoice: boolean;
  /** Abrir la factura (null: prepararla). */
  onOpenInvoice: (invoiceId: string | null) => void;
  /** Abrir una nota de crédito existente o preparar la que falta. */
  onOpenCreditNote: (invoiceId: string | null, need: CreditNoteNeed | null) => void;
}

const BUTTON = 'h-7 px-2.5 text-xs gap-1';

/** Factura y notas de crédito de una venta en el historial: ver, reintentar, facturar o acreditar. */
export const SaleInvoiceAction: React.FC<Props> = ({ state, canInvoiceSale, canInvoice, onOpenInvoice, onOpenCreditNote }) => {
  const invoice = state?.invoice;
  const notes = state?.creditNotes ?? [];
  const needs = canInvoice ? (state?.needs ?? []) : [];

  let main: React.ReactNode = null;
  if (invoice?.status === 'authorized') {
    main = (
      <Button variant="secondary" size="sm" className={BUTTON} title={invoiceLabel(invoice)} onClick={() => onOpenInvoice(invoice.id)}>
        <FileCheck2 size={13} className="text-success" /><span>Factura {invoice.letter}</span>
      </Button>
    );
  } else if (canInvoice && invoice?.status === 'pending') {
    main = (
      <Button variant="secondary" size="sm" className={`${BUTTON} text-warning`} title={invoice.arcaMessage ?? 'Factura sin CAE'} onClick={() => onOpenInvoice(invoice.id)}>
        <FileClock size={13} /><span>Factura pendiente</span>
      </Button>
    );
  } else if (canInvoice && canInvoiceSale) {
    const rejected = invoice?.status === 'rejected';
    main = (
      <Button variant="secondary" size="sm" className={BUTTON} title={rejected ? `Rechazada: ${invoice?.arcaMessage ?? ''}` : 'Emitir factura electrónica'}
        onClick={() => onOpenInvoice(null)}>
        {rejected ? <FileX2 size={13} className="text-danger" /> : <ReceiptText size={13} />}
        <span>Facturar</span>
      </Button>
    );
  }

  return (
    <>
      {main}
      {notes.map((nc) => (
        <Button key={nc.id} variant="secondary" size="sm" className={`${BUTTON} ${nc.status === 'pending' ? 'text-warning' : ''}`}
          title={nc.status === 'pending' ? (nc.arcaMessage ?? 'Nota de crédito sin CAE') : invoiceLabel(nc)} onClick={() => onOpenCreditNote(nc.id, null)}>
          <FileMinus2 size={13} className={nc.status === 'authorized' ? 'text-success' : ''} />
          <span>{nc.status === 'pending' ? 'NC pendiente' : `NC ${nc.letter}`}</span>
        </Button>
      ))}
      {needs.map((need) => (
        <Button key={need.saleReturnId ?? 'anulacion'} variant="secondary" size="sm" className={`${BUTTON} text-warning`}
          title={`${need.saleReturnId ? `Devolución ${need.returnNumber}` : 'Venta anulada'}: falta acreditar ${formatCurrency(need.amount)}`}
          onClick={() => onOpenCreditNote(null, need)}>
          <FileMinus2 size={13} /><span>Emitir nota de crédito</span>
        </Button>
      ))}
    </>
  );
};
