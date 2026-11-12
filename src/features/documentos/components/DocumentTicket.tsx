import React from 'react';
import { formatCurrency, formatDateShort, formatNumber } from '@/lib/formatters';
import { formatDocumentNumber } from '../documentMath';
import { DOC_TYPE_LABELS } from '../types';
import type { PrintableDocument } from './printTypes';

const DIVIDER = 'border-b border-dashed border-black';

/**
 * Ticket de 80 mm (rollo térmico). Comprobante no fiscal: no es una venta ni una factura.
 * Todo en negro puro, en negrita y desde 11 px para que se lea en impresoras de poca potencia.
 */
export const DocumentTicket: React.FC<PrintableDocument> = ({ doc, items, company, settings, logo }) => (
  <div id="thermal-receipt"
    className="bg-white text-black font-mono font-bold text-[11px] leading-snug p-6 rounded-xl border border-zinc-300 shadow-md max-w-[340px] mx-auto print:border-none print:shadow-none print:max-w-full print:p-0">
    <div className={`text-center pb-3 space-y-1.5 ${DIVIDER}`}>
      {logo && <img src={logo} alt="" className="mx-auto max-h-20 max-w-[60%] object-contain grayscale contrast-125" />}
      <div className="text-base font-extrabold uppercase">{company.name}</div>
      <div className="space-y-0.5">
        {company.cuit && <div>CUIT: {company.cuit}</div>}
        {settings.address && <div>{settings.address}</div>}
        {(settings.phone || settings.email) && <div className="break-words">{[settings.phone, settings.email].filter(Boolean).join(' • ')}</div>}
      </div>
      <div className="mt-1 border-2 border-black py-1 px-2 uppercase">
        {DOC_TYPE_LABELS[doc.type]} - NO VÁLIDO COMO FACTURA
      </div>
      {doc.status === 'voided' && (
        <div className="mt-1.5 py-1 border-4 border-black font-extrabold text-sm tracking-widest">
          ANULADO
          {doc.voidReason && <span className="block text-[11px] tracking-normal">MOTIVO: {doc.voidReason}</span>}
        </div>
      )}
    </div>

    <div className={`py-3 space-y-1.5 ${DIVIDER}`}>
      <div className="flex justify-between gap-2"><span>NRO:</span><span>{formatDocumentNumber(doc.pointOfSale, doc.number)}</span></div>
      <div className="flex justify-between gap-2"><span>FECHA:</span><span>{formatDateShort(doc.issueDate)}</span></div>
      <div className="flex justify-between gap-2"><span>CLIENTE:</span><span className="uppercase text-right break-words max-w-[170px]">{doc.customerName}</span></div>
      {doc.customerTaxId && <div className="flex justify-between gap-2"><span>CUIT/DNI:</span><span>{doc.customerTaxId}</span></div>}
    </div>

    <div className={`py-3 ${DIVIDER}`}>
      <div className="grid grid-cols-12 pb-1.5">
        <span className="col-span-2">CANT</span><span className="col-span-6">DETALLE</span><span className="col-span-4 text-right">TOTAL</span>
      </div>
      <div className="space-y-2 pt-1">
        {items.map((item) => (
          <div key={item.id} className="grid grid-cols-12">
            <span className="col-span-2">{formatNumber(item.quantity)}</span>
            <div className="col-span-6 pr-1">
              <div className="uppercase break-words">{item.description}</div>
              <div>@{formatCurrency(item.unitPrice)}</div>
            </div>
            <span className="col-span-4 text-right tabular-nums">{formatCurrency(item.lineTotal)}</span>
          </div>
        ))}
      </div>
    </div>

    <div className={`py-3 space-y-1.5 ${DIVIDER}`}>
      {doc.discount > 0 && (
        <>
          <div className="flex justify-between gap-2"><span>SUBTOTAL:</span><span className="tabular-nums">{formatCurrency(doc.subtotal)}</span></div>
          <div className="flex justify-between gap-2"><span>DESCUENTO:</span><span className="tabular-nums">-{formatCurrency(doc.discount)}</span></div>
        </>
      )}
      <div className="flex justify-between gap-2 text-base font-extrabold"><span>TOTAL:</span><span className="tabular-nums">{formatCurrency(doc.total)}</span></div>
    </div>

    {doc.notes && <div className={`py-3 whitespace-pre-line break-words ${DIVIDER}`}>{doc.notes}</div>}
    <div className="pt-3 text-center break-words">{settings.footerNote || '¡Gracias por su compra!'}</div>
  </div>
);
