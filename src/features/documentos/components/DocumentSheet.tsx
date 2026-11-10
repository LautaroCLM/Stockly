import React from 'react';
import { formatCurrency, formatDateShort, formatNumber } from '@/lib/formatters';
import { formatDocumentNumber, warrantyEndDate } from '../documentMath';
import { DOC_TYPE_LABELS, TAX_CONDITION_LABELS } from '../types';
import type { PrintableDocument } from './printTypes';

const TH = 'p-2 text-left font-bold border-b-2 border-zinc-800';
const TD = 'p-2 border-b border-zinc-300 align-top';

/** Hoja A4 de presupuesto, remito X o garantía, con el formato de los comprobantes argentinos. */
export const DocumentSheet: React.FC<PrintableDocument> = ({ doc, items, company, settings }) => {
  const prices = doc.showPrices && doc.type !== 'garantia';
  const isRemito = doc.type === 'remito';
  const letter = doc.type === 'presupuesto' ? 'P' : doc.type === 'garantia' ? 'G' : 'X';
  const legend = doc.type === 'remito' ? 'Documento no válido como factura' : 'Documento no fiscal';
  const hasSerial = items.some((i) => i.serialNumber);

  return (
    <div id="a4-sheet" className="relative bg-white text-zinc-900 text-[12px] leading-snug p-8 rounded-xl border border-zinc-300 shadow-md mx-auto w-full max-w-[794px] print:border-none print:shadow-none print:p-0 print:max-w-none">
      {doc.status === 'voided' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-red-600/30 border-8 border-red-600/30 px-6 py-2 text-7xl font-extrabold -rotate-12">ANULADO</span>
        </div>
      )}

      <header className="grid grid-cols-[1fr_auto_1fr] border-2 border-zinc-800">
        <div className="p-3 space-y-0.5">
          <div className="text-lg font-extrabold uppercase">{company.name}</div>
          {settings.address && <div>{settings.address}</div>}
          {(settings.phone || settings.email) && <div>{[settings.phone, settings.email].filter(Boolean).join(' • ')}</div>}
          <div className="font-semibold">{TAX_CONDITION_LABELS[settings.taxCondition]}</div>
        </div>
        <div className="w-24 border-x-2 border-zinc-800 text-center flex flex-col items-center">
          <div className="text-4xl font-extrabold leading-none pt-2 border-b-2 border-zinc-800 w-full pb-1">{letter}</div>
          <div className="text-[9px] font-bold uppercase p-1 leading-tight">{legend}</div>
        </div>
        <div className="p-3 space-y-0.5">
          <div className="text-lg font-extrabold uppercase">{DOC_TYPE_LABELS[doc.type]}</div>
          <div><strong>N°</strong> {formatDocumentNumber(doc.pointOfSale, doc.number)}</div>
          <div><strong>Fecha:</strong> {formatDateShort(doc.issueDate)}</div>
          {company.cuit && <div><strong>CUIT:</strong> {company.cuit}</div>}
        </div>
      </header>

      <section className="mt-3 p-3 border border-zinc-400 grid grid-cols-2 gap-x-6 gap-y-0.5">
        <div><strong>Señor/es:</strong> {doc.customerName}</div>
        <div><strong>CUIT/DNI:</strong> {doc.customerTaxId || '-'}</div>
        <div><strong>Domicilio:</strong> {doc.customerAddress || '-'}</div>
        <div><strong>Teléfono:</strong> {doc.customerPhone || '-'}</div>
      </section>

      {doc.type === 'garantia' && doc.warrantyMonths && (
        <section className="mt-3 p-3 border-2 border-zinc-800 text-center">
          <div className="text-sm font-extrabold uppercase">Garantía de {doc.warrantyMonths} {doc.warrantyMonths === 1 ? 'mes' : 'meses'}</div>
          <div>Vigente desde el {formatDateShort(doc.issueDate)} hasta el {formatDateShort(warrantyEndDate(doc.issueDate, doc.warrantyMonths))}</div>
        </section>
      )}
      {doc.type === 'presupuesto' && doc.validUntil && (
        <p className="mt-3 font-semibold">Presupuesto válido hasta el {formatDateShort(doc.validUntil)}.</p>
      )}

      <table className="w-full mt-3 border-collapse">
        <thead>
          <tr>
            <th className={`${TH} w-16`}>Cant.</th>
            <th className={TH}>Descripción</th>
            {hasSerial && <th className={TH}>N° de serie</th>}
            {prices && <><th className={`${TH} text-right`}>P. unitario</th><th className={`${TH} text-right`}>Importe</th></>}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td className={TD}>{formatNumber(item.quantity)}</td>
              <td className={TD}>{item.description}</td>
              {hasSerial && <td className={TD}>{item.serialNumber ?? ''}</td>}
              {prices && <><td className={`${TD} text-right tabular-nums`}>{formatCurrency(item.unitPrice)}</td><td className={`${TD} text-right tabular-nums`}>{formatCurrency(item.lineTotal)}</td></>}
            </tr>
          ))}
        </tbody>
      </table>

      {prices && (
        <div className="mt-3 ml-auto w-64 space-y-1">
          {doc.discount > 0 && (
            <>
              <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{formatCurrency(doc.subtotal)}</span></div>
              <div className="flex justify-between"><span>Descuento</span><span className="tabular-nums">-{formatCurrency(doc.discount)}</span></div>
            </>
          )}
          <div className="flex justify-between text-base font-extrabold border-t-2 border-zinc-800 pt-1"><span>TOTAL</span><span className="tabular-nums">{formatCurrency(doc.total)}</span></div>
        </div>
      )}

      {doc.notes && (
        <section className="mt-4">
          <div className="font-bold">{doc.type === 'garantia' ? 'Condiciones de la garantía' : 'Observaciones'}</div>
          <p className="whitespace-pre-line">{doc.notes}</p>
        </section>
      )}

      {(isRemito || doc.type === 'garantia') && (
        <div className="mt-16 grid grid-cols-2 gap-16 text-center text-[11px]">
          <div className="border-t border-zinc-800 pt-1">{isRemito ? 'Firma y aclaración de quien recibe' : 'Firma y sello del vendedor'}</div>
          <div className="border-t border-zinc-800 pt-1">{isRemito ? 'Recibí conforme' : 'Firma del cliente'}</div>
        </div>
      )}
      {settings.footerNote && <p className="mt-6 text-center text-[10px] text-zinc-500">{settings.footerNote}</p>}
    </div>
  );
};
