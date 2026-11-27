import React from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Loader2, Printer, ReceiptText, X } from 'lucide-react';
import { ModalFrame } from '@/components/motion/ModalFrame';
import { Button } from '@/components/ui/Button';
import type { Company } from '@/types';
import { useCompanyLogo } from '@/features/logo/hooks/useCompanyLogo';
import { useDocumentSettings } from '@/features/documentos/hooks/useDocumentSettings';
import { useArcaSettings } from '../hooks/useArcaSettings';
import { useInvoiceDialog } from '../hooks/useInvoiceDialog';
import { invoiceLabel } from '../invoiceFormat';
import type { InvoiceValueResult } from '../invoiceTypes';
import { InvoicePreview } from './InvoicePreview';
import { InvoiceTicket } from './InvoiceTicket';

interface Props {
  company: Company;
  saleNumber: string;
  /** Comprobante ya creado (pendiente, rechazado o autorizado); null para prepararlo con `prepare`. */
  invoiceId: string | null;
  prepare: () => Promise<InvoiceValueResult<string>>;
  onClose: () => void;
  onChanged: () => void;
}

/** Factura o nota de crédito de una venta: revisar, pedir el CAE a ARCA e imprimir el comprobante autorizado. */
export const InvoiceDialog: React.FC<Props> = ({ company, saleNumber, invoiceId, prepare, onClose, onChanged }) => {
  const { invoice, step, message, emit } = useInvoiceDialog(company.id, invoiceId, prepare, onChanged);
  const { settings } = useDocumentSettings(company.id, true);
  const arca = useArcaSettings(company.id);
  const { logo } = useCompanyLogo(company.id);
  const isSending = step === 'sending';
  const authorized = invoice?.status === 'authorized';
  const ticket = invoice && authorized
    ? <InvoiceTicket invoice={invoice} company={company} settings={settings} arca={arca.settings} logo={logo} /> : null;
  const shownMessage = message ?? (invoice && invoice.status !== 'authorized' ? invoice.arcaMessage : null);

  return (
    <ModalFrame ariaLabel={`Comprobante de la venta ${saleNumber}`} onBackdropClick={isSending ? () => undefined : onClose} panelClassName="max-w-lg print:hidden">
      <div className="p-4 px-6 border-b border-border flex items-center justify-between bg-surface-2/60">
        <div className="flex items-center gap-2">
          <ReceiptText size={18} className="text-primary" />
          <h2 className="text-sm font-bold text-text-primary">
            {invoice ? invoiceLabel(invoice) : 'Factura electrónica'} <span className="font-normal text-text-muted">· venta {saleNumber}</span>
          </h2>
        </div>
        <button type="button" onClick={onClose} disabled={isSending} aria-label="Cerrar" className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2"><X size={18} /></button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-6 space-y-3">
        {step === 'loading' && (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-text-muted"><Loader2 size={16} className="animate-spin text-primary" /> Preparando el comprobante...</div>
        )}
        {shownMessage && (
          <div role="alert" className="p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-xs flex items-start gap-2">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" /><span>{shownMessage}</span>
          </div>
        )}
        {ticket ?? (invoice && <InvoicePreview invoice={invoice} />)}
      </div>

      <div className="p-4 px-6 border-t border-border bg-surface-2/60 flex items-center justify-between gap-3">
        <Button variant="secondary" size="md" onClick={onClose} disabled={isSending}>Cerrar</Button>
        {authorized ? (
          <Button variant="primary" size="md" onClick={() => window.print()} className="gap-2"><Printer size={16} /><span>Imprimir</span></Button>
        ) : invoice?.status === 'pending' ? (
          <Button variant="primary" size="md" onClick={() => void emit()} disabled={isSending} className="gap-2">
            {isSending ? <Loader2 size={16} className="animate-spin" /> : <ReceiptText size={16} />}
            <span>{isSending ? 'Pidiendo el CAE a ARCA...' : invoice.arcaMessage ? 'Reintentar' : invoice.kind === 'credit_note' ? 'Emitir nota de crédito' : 'Emitir factura'}</span>
          </Button>
        ) : null}
      </div>
      {ticket && createPortal(<div id="print-root">{ticket}</div>, document.body)}
    </ModalFrame>
  );
};
