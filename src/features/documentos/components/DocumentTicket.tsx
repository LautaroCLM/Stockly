import React from 'react';
import { formatCurrency, formatDateShort, formatNumber } from '@/lib/formatters';
import { formatDocumentNumber } from '../documentMath';
import { DOC_TYPE_LABELS } from '../types';
import type { PrintableDocument } from './printTypes';

const DIVIDER = 'border-b border-dashed border-zinc-400';

/** Ticket de 80 mm (rollo térmico). Comprobante no fiscal: no es una venta ni una factura. */
export const DocumentTicket: React.FC<PrintableDocument> = ({ doc, items, company, settings }) => (
  <div id="thermal-receipt"
    className="bg-white text-zinc-900 font-mono text-[11px] p-6 rounded-xl border border-zinc-300 shadow-md max-w-[340px] mx-auto print:border-none print:shadow-none print:max-w-full print:p-0">
    <div className={`text-center pb-3 space-y-1 ${DIVIDER}`}>
      <div className="text-sm font-extrabold uppercase">{company.name}</div>
      <div className="text-[10px] text-zinc-600">
        {[company.cuit ? `CUIT: ${company.cuit}` : null, settings.address || null, settings.phone || null].filter(Boolean).join(' • ')}
      </div>
      <div className="pt-1 text-[9px] uppercase font-bold text-rose-700 bg-rose-50 border border-rose-200 py-0.5 px-2 rounded">
        {DOC_TYPE_LABELS[doc.type]} - NO VÁLIDO COMO FACTURA
      </div>
      {doc.status === 'voided' && (
        <div className="mt-1.5 py-1 border-2 border-red-700 text-red-700 font-extrabold text-[11px] tracking-widest">
          ANULADO
          {doc.voidReason && <span className="block text-[9px] font-medium tracking-normal">Motivo: {doc.voidReason}</span>}
        </div>
      )}
    </div>

    <div className={`py-2.5 text-[10px] space-y-1 ${DIVIDER}`}>
      <div className="flex justify-between"><span className="font-bold">NRO:</span><span className="font-bold">{formatDocumentNumber(doc.pointOfSale, doc.number)}</span></div>
      <div className="flex justify-between"><span>FECHA:</span><span>{formatDateShort(doc.issueDate)}</span></div>
      <div className="flex justify-between"><span>CLIENTE:</span><span className="font-medium truncate max-w-[170px]">{doc.customerName}</span></div>
      {doc.customerTaxId && <div className="flex justify-between text-[9px] text-zinc-600"><span>CUIT/DNI:</span><span>{doc.customerTaxId}</span></div>}
    </div>

    <div className={`py-2.5 ${DIVIDER}`}>
      <div className="grid grid-cols-12 text-[10px] font-bold pb-1 text-zinc-700">
        <span className="col-span-2">CANT</span><span className="col-span-6">DETALLE</span><span className="col-span-4 text-right">TOTAL</span>
      </div>
      <div className="space-y-1.5 pt-1">
        {items.map((item) => (
          <div key={item.id} className="grid grid-cols-12 text-[10px] leading-tight">
            <span className="col-span-2 font-bold">{formatNumber(item.quantity)}</span>
            <div className="col-span-6 pr-1">
              <div className="font-medium break-words">{item.description}</div>
              <div className="text-[9px] text-zinc-500">@{formatCurrency(item.unitPrice)}</div>
            </div>
            <span className="col-span-4 text-right font-bold tabular-nums">{formatCurrency(item.lineTotal)}</span>
          </div>
        ))}
      </div>
    </div>

    <div className={`py-2.5 space-y-1 ${DIVIDER}`}>
      {doc.discount > 0 && (
        <>
          <div className="flex justify-between"><span>Subtotal:</span><span className="tabular-nums">{formatCurrency(doc.subtotal)}</span></div>
          <div className="flex justify-between text-zinc-700"><span>Descuento:</span><span className="tabular-nums">-{formatCurrency(doc.discount)}</span></div>
        </>
      )}
      <div className="flex justify-between text-sm font-extrabold"><span>TOTAL:</span><span className="tabular-nums">{formatCurrency(doc.total)}</span></div>
    </div>

    {doc.notes && <div className={`py-2.5 text-[10px] whitespace-pre-line ${DIVIDER}`}>{doc.notes}</div>}
    <div className="pt-3 text-center text-[9px] text-zinc-500">{settings.footerNote || '¡Gracias por su compra!'}</div>
  </div>
);
