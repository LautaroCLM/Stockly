import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { Company } from '@/types';
import { formatCurrency, formatDateShort, formatNumber } from '@/lib/formatters';
import { TAX_CONDITION_LABELS, type DocumentSettings } from '@/features/documentos/types';
import type { ArcaSettings } from '../types';
import type { InvoiceDetail } from '../invoiceTypes';
import { arcaQrUrl, displayUnitPrice, formatInvoiceNumber, receiverDocLabel } from '../invoiceFormat';
import { CUSTOMER_VAT_CONDITION_LABELS, formatVatRate, toCustomerVatCondition, toVatRate } from '../vat';

const DIVIDER = 'border-b border-dashed border-black';
const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex justify-between gap-2"><span>{label}</span><span className="text-right">{value}</span></div>
);

interface Props {
  invoice: InvoiceDetail;
  company: Company;
  settings: DocumentSettings;
  arca: ArcaSettings;
  logo: string | null;
}

/** Factura o nota de crédito en rollo de 80 mm: emisor, receptor, ítems, IVA, CAE y QR de ARCA. */
export const InvoiceTicket: React.FC<Props> = ({ invoice, company, settings, arca, logo }) => {
  const [qr, setQr] = useState<string | null>(null);
  const qrUrl = arcaQrUrl(invoice, company.cuit);
  useEffect(() => {
    if (!qrUrl) return setQr(null);
    let alive = true;
    QRCode.toDataURL(qrUrl, { margin: 1, width: 180, errorCorrectionLevel: 'M' })
      .then((url) => alive && setQr(url))
      .catch(() => alive && setQr(null));
    return () => { alive = false; };
  }, [qrUrl]);

  const doc = receiverDocLabel(invoice.receiverDocType, invoice.receiverDocNumber);
  const condition = CUSTOMER_VAT_CONDITION_LABELS[toCustomerVatCondition(invoice.receiverVatCondition)];
  return (
    <div id="thermal-receipt"
      className="bg-white text-black font-mono font-bold text-[11px] leading-snug p-6 rounded-xl border border-zinc-300 shadow-md max-w-[340px] mx-auto print:border-none print:shadow-none print:max-w-full print:p-0">
      <div className={`text-center pb-3 space-y-1 ${DIVIDER}`}>
        {logo && <img src={logo} alt="" className="mx-auto max-h-20 max-w-[60%] object-contain grayscale contrast-125" />}
        <div className="text-base font-extrabold uppercase">{company.name}</div>
        <div>CUIT: {company.cuit}</div>
        <div className="uppercase">{TAX_CONDITION_LABELS[settings.taxCondition]}</div>
        {settings.address && <div>{settings.address}</div>}
        {arca.grossIncomeNumber && <div>IIBB: {arca.grossIncomeNumber}</div>}
        {arca.activityStartDate && <div>Inicio de actividades: {formatDateShort(arca.activityStartDate)}</div>}
        <div className="mt-1.5 py-1 border-4 border-black font-extrabold text-sm tracking-widest">
          {invoice.kind === 'credit_note' ? 'NOTA DE CRÉDITO' : 'FACTURA'} {invoice.letter}
        </div>
        <div>Código {String(invoice.invoiceType).padStart(2, '0')} · ORIGINAL</div>
        {invoice.environment === 'homologacion' && <div className="border-2 border-black py-0.5">PRUEBA - SIN VALIDEZ FISCAL</div>}
      </div>

      <div className={`py-2 space-y-1 ${DIVIDER}`}>
        <Row label="NRO:" value={formatInvoiceNumber(invoice.pointOfSale, invoice.number)} />
        <Row label="FECHA:" value={formatDateShort(invoice.issueDate)} />
        {invoice.associated && (
          <Row label="ASOCIADA A:" value={`FACT. ${invoice.associated.letter} ${formatInvoiceNumber(invoice.associated.pointOfSale, invoice.associated.number)}`} />
        )}
        <div className="pt-1 uppercase break-words">{invoice.receiverName}</div>
        {doc && <div>{doc}</div>}
        <div>{condition}</div>
        {invoice.receiverAddress && <div className="break-words">{invoice.receiverAddress}</div>}
      </div>

      <div className={`py-2 space-y-1.5 ${DIVIDER}`}>
        {invoice.items.map((item) => (
          <div key={item.position}>
            <div className="uppercase break-words">{item.description}</div>
            <div className="flex justify-between gap-2">
              <span>{formatNumber(item.quantity)} x {formatCurrency(displayUnitPrice(invoice.letter, item.unitPrice, item.vatRate))}
                {invoice.letter === 'A' && ` (${formatVatRate(toVatRate(item.vatRate))})`}</span>
              <span>{formatCurrency(item.lineTotal)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className={`py-2 space-y-1 ${DIVIDER}`}>
        {invoice.discount > 0 && <Row label="DESCUENTO:" value={`-${formatCurrency(invoice.discount)}`} />}
        {invoice.letter === 'A' && <Row label="NETO GRAVADO:" value={formatCurrency(invoice.netAmount)} />}
        {invoice.letter === 'A' && invoice.vatLines.map((v) => (
          <Row key={v.vatRate} label={`IVA ${formatVatRate(toVatRate(v.vatRate))}:`} value={formatCurrency(v.vatAmount)} />
        ))}
        <div className="flex justify-between gap-2 text-sm font-extrabold pt-1"><span>TOTAL:</span><span>{formatCurrency(invoice.totalAmount)}</span></div>
        {/* Ley 27.743: en la Factura B se informa el IVA contenido */}
        {invoice.letter === 'B' && <Row label="IVA CONTENIDO:" value={formatCurrency(invoice.vatAmount)} />}
        {invoice.letter === 'A' && invoice.receiverVatCondition === 'monotributo' && (
          <div className="pt-1 text-[10px] font-normal">
            El crédito fiscal discriminado en el presente comprobante sólo podrá ser computado a efectos del Régimen de
            Sostenimiento e Inclusión Fiscal para Pequeños Contribuyentes de la Ley N° 27.618.
          </div>
        )}
      </div>

      <div className="pt-3 text-center space-y-1">
        {qr && <img src={qr} alt="Código QR de ARCA" className="mx-auto w-36 h-36" />}
        {invoice.cae && <div>CAE: {invoice.cae}</div>}
        {invoice.caeExpiresAt && <div>Vto. CAE: {formatDateShort(invoice.caeExpiresAt)}</div>}
        <div className="text-[10px] font-normal">Comprobante autorizado por ARCA</div>
      </div>
    </div>
  );
};
