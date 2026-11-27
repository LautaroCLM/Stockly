import React from 'react';
import { formatCurrency } from '@/lib/formatters';
import type { InvoiceDetail } from '../invoiceTypes';
import { receiverDocLabel } from '../invoiceFormat';
import { CUSTOMER_VAT_CONDITION_LABELS, formatVatRate, toCustomerVatCondition, toVatRate } from '../vat';

const Line: React.FC<{ label: string; value: string; strong?: boolean }> = ({ label, value, strong }) => (
  <div className={`flex justify-between gap-3 ${strong ? 'font-bold text-text-primary text-sm' : 'text-text-secondary'}`}>
    <span>{label}</span><span className="tabular-nums text-right">{value}</span>
  </div>
);

/** Lo que se le va a mandar a ARCA, para revisarlo antes de pedir el CAE. */
export const InvoicePreview: React.FC<{ invoice: InvoiceDetail }> = ({ invoice }) => {
  const doc = receiverDocLabel(invoice.receiverDocType, invoice.receiverDocNumber);
  return (
    <div className="space-y-3 text-xs">
      <div className="p-3 rounded-lg bg-surface-2 border border-border space-y-1">
        <div className="text-[11px] uppercase tracking-wider text-text-muted">Receptor</div>
        <div className="font-semibold text-text-primary">{invoice.receiverName}</div>
        <div className="text-text-secondary">
          {[doc, CUSTOMER_VAT_CONDITION_LABELS[toCustomerVatCondition(invoice.receiverVatCondition)]].filter(Boolean).join(' · ')}
        </div>
      </div>
      <div className="p-3 rounded-lg bg-surface-2 border border-border space-y-1">
        <Line label={`${invoice.items.length} ítem${invoice.items.length === 1 ? '' : 's'}`} value={formatCurrency(invoice.subtotal)} />
        {invoice.discount > 0 && <Line label="Descuento" value={`-${formatCurrency(invoice.discount)}`} />}
        {invoice.letter !== 'C' && <Line label="Neto gravado" value={formatCurrency(invoice.netAmount)} />}
        {invoice.vatLines.map((v) => (
          <Line key={v.vatRate} label={`IVA ${formatVatRate(toVatRate(v.vatRate))}`} value={formatCurrency(v.vatAmount)} />
        ))}
        <Line label="Total" value={formatCurrency(invoice.totalAmount)} strong />
      </div>
      {invoice.environment === 'homologacion' && (
        <p className="text-[11px] text-warning">Ambiente de prueba (homologación): la factura no tiene validez fiscal.</p>
      )}
    </div>
  );
};
