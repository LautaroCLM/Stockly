import React from 'react';
import type { Company } from '@/types';
import { formatCurrency, formatDateTime, formatNumber } from '@/lib/formatters';
import type { Sale } from '@/features/inventario/types';
import { TAX_CONDITION_LABELS } from '@/features/documentos/types';
import type { DocumentSettings } from '@/features/documentos/types';
import type { ReturnReceiptData } from '../returnReceiptTypes';

const DIVIDER = 'border-b border-dashed border-black';

/**
 * Comprobante de devolución (80 mm, no fiscal). Mismo estilo que el ticket de venta:
 * negro puro y en negrita, para impresoras térmicas de poca potencia.
 */
export const ReturnTicket: React.FC<{
  data: ReturnReceiptData; sale: Sale; company: Company; settings: DocumentSettings; logo: string | null;
}> = ({ data, sale, company, settings, logo }) => (
  <div id="thermal-receipt"
    className="bg-white text-black font-mono font-bold text-[11px] leading-snug p-6 rounded-xl border border-zinc-300 shadow-md max-w-[340px] mx-auto print:border-none print:shadow-none print:max-w-full print:p-0">
    <div className={`text-center pb-3 space-y-1.5 ${DIVIDER}`}>
      {logo && <img src={logo} alt="" className="mx-auto max-h-20 max-w-[60%] object-contain grayscale contrast-125" />}
      <div className="text-base font-extrabold uppercase">{company.name}</div>
      <div className="space-y-0.5">
        {company.cuit && <div>CUIT: {company.cuit}</div>}
        <div className="uppercase">{TAX_CONDITION_LABELS[settings.taxCondition]}</div>
        {settings.address && <div>{settings.address}</div>}
        {(settings.phone || settings.email) && <div className="break-words">{[settings.phone, settings.email].filter(Boolean).join(' • ')}</div>}
      </div>
      <div className="mt-1 border-2 border-black py-1 px-2 uppercase">COMPROBANTE NO FISCAL - USO INTERNO</div>
      <div className="mt-1.5 py-1 border-4 border-black font-extrabold text-sm tracking-widest">COMPROBANTE DE DEVOLUCIÓN</div>
    </div>

    <div className={`py-3 space-y-1.5 ${DIVIDER}`}>
      <div className="flex justify-between gap-2"><span>NRO DEVOLUCIÓN:</span><span>{data.returnNumber}</span></div>
      <div className="flex justify-between gap-2"><span>FECHA:</span><span>{formatDateTime(data.createdAt)}</span></div>
      <div className="flex justify-between gap-2"><span>VENTA ORIGINAL:</span><span>{sale.saleNumber}</span></div>
      <div className="flex justify-between gap-2">
        <span>CLIENTE:</span><span className="uppercase text-right break-words max-w-[170px]">{sale.clientName}</span>
      </div>
    </div>

    <div className={`py-3 ${DIVIDER}`}>
      <div className="grid grid-cols-12 pb-1.5">
        <span className="col-span-2">CANT</span>
        <span className="col-span-6">DETALLE</span>
        <span className="col-span-4 text-right">TOTAL</span>
      </div>
      <div className="space-y-2 pt-1">
        {data.items.map((item, idx) => (
          <div key={idx} className="grid grid-cols-12">
            <span className="col-span-2">{formatNumber(item.quantity)}</span>
            <div className="col-span-6 pr-1 uppercase break-words">{item.name}</div>
            <span className="col-span-4 text-right tabular-nums">{formatCurrency(item.amount)}</span>
          </div>
        ))}
      </div>
    </div>

    <div className={`py-3 space-y-1.5 ${DIVIDER}`}>
      <div className="flex justify-between gap-2 text-base font-extrabold">
        <span>EFECTIVO DEVUELTO:</span><span className="tabular-nums">{formatCurrency(data.refundAmount)}</span>
      </div>
      {sale.discountAmount > 0 && <div className="text-[10px]">Incluye la parte proporcional del descuento de la venta.</div>}
    </div>

    <div className="pt-3 space-y-1">
      <div className="break-words">MOTIVO: {data.reason}</div>
      <div className="pt-6 text-center">
        <div className="border-t border-black mx-6 pt-1">FIRMA DEL CLIENTE</div>
      </div>
    </div>
  </div>
);
