import React from 'react';
import type { Company } from '@/types';
import { formatCurrency, formatDateTime } from '@/lib/formatters';
import type { Sale } from '../types';
import { paymentMethodLabel } from '../paymentMethods';
import { TAX_CONDITION_LABELS } from '@/features/documentos/types';
import type { DocumentSettings } from '@/features/documentos/types';

const DIVIDER = 'border-b border-dashed border-black';

/**
 * Ticket de venta imprimible (formato térmico de 80 mm). Comprobante no fiscal.
 * Pensado para impresoras de poca potencia: todo en negro puro, en negrita y desde 11 px
 * (los grises y las letras finas casi no se ven en papel térmico).
 */
export const ReceiptTicket: React.FC<{ sale: Sale; company: Company; settings: DocumentSettings; logo: string | null }> = ({ sale, company, settings, logo }) => (
    <div
      id="thermal-receipt"
      className="bg-white text-black font-mono font-bold text-[11px] leading-snug p-6 rounded-xl border border-zinc-300 shadow-md max-w-[340px] mx-auto print:border-none print:shadow-none print:max-w-full print:p-0"
    >
      {/* Header */}
      <div className={`text-center pb-3 space-y-1.5 ${DIVIDER}`}>
        {logo && <img src={logo} alt="" className="mx-auto max-h-20 max-w-[60%] object-contain grayscale contrast-125" />}
        <div className="text-base font-extrabold uppercase">{company.name}</div>
        <div className="space-y-0.5">
          {company.cuit && <div>CUIT: {company.cuit}</div>}
          <div className="uppercase">{TAX_CONDITION_LABELS[settings.taxCondition]}</div>
          {settings.address && <div>{settings.address}</div>}
          {(settings.phone || settings.email) && <div className="break-words">{[settings.phone, settings.email].filter(Boolean).join(' • ')}</div>}
        </div>
        <div className="mt-1 border-2 border-black py-1 px-2 uppercase">
          COMPROBANTE NO FISCAL - USO INTERNO
        </div>
        {sale.status === 'anulada' && (
          <div className="mt-1.5 py-1 border-4 border-black font-extrabold text-sm tracking-widest">
            VENTA ANULADA
            {sale.cancelReason && (
              <span className="block text-[11px] tracking-normal">MOTIVO: {sale.cancelReason}</span>
            )}
          </div>
        )}
      </div>

      {/* Sale Meta */}
      <div className={`py-3 space-y-1.5 ${DIVIDER}`}>
        <div className="flex justify-between gap-2">
          <span>NRO VENTA:</span>
          <span>{sale.saleNumber}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span>FECHA:</span>
          <span>{formatDateTime(sale.createdAt)}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span>CLIENTE:</span>
          <span className="uppercase text-right break-words max-w-[170px]">{sale.clientName}</span>
        </div>
        {sale.customerDoc && (
          <div className="flex justify-between gap-2">
            <span>IDENTIFICACIÓN:</span>
            <span>{sale.customerDoc}</span>
          </div>
        )}
      </div>

      {/* Items Table */}
      <div className={`py-3 ${DIVIDER}`}>
        <div className="grid grid-cols-12 pb-1.5">
          <span className="col-span-2">CANT</span>
          <span className="col-span-6">DETALLE</span>
          <span className="col-span-4 text-right">TOTAL</span>
        </div>

        <div className="space-y-2 pt-1">
          {sale.items.map((item, idx) => (
            <div key={idx} className="grid grid-cols-12">
              <span className="col-span-2">{item.quantity}</span>
              <div className="col-span-6 pr-1">
                <div className="uppercase break-words">{item.name}</div>
                <div>@{formatCurrency(item.unitPrice)}</div>
              </div>
              <span className="col-span-4 text-right tabular-nums">
                {formatCurrency(item.subtotal)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Totals & Payments */}
      <div className={`py-3 space-y-1.5 ${DIVIDER}`}>
        <div className="flex justify-between gap-2">
          <span>SUBTOTAL:</span>
          <span className="tabular-nums">{formatCurrency(sale.subtotal)}</span>
        </div>

        {sale.discountAmount > 0 && (
          <div className="flex justify-between gap-2">
            <span>DESCUENTO ({sale.discountPercent}%):</span>
            <span className="tabular-nums">-{formatCurrency(sale.discountAmount)}</span>
          </div>
        )}

        <div className="flex justify-between gap-2 text-base font-extrabold pt-1.5 border-t-2 border-black">
          <span>TOTAL:</span>
          <span className="tabular-nums">{formatCurrency(sale.total)}</span>
        </div>
      </div>

      {/* Payment breakdown */}
      <div className={`py-3 space-y-1.5 ${DIVIDER}`}>
        <span>MEDIOS DE PAGO:</span>
        {sale.payments.map((p, idx) => (
          <div key={idx} className="flex justify-between gap-2">
            <span className="uppercase">{paymentMethodLabel(p.method)}:</span>
            <span className="tabular-nums">{formatCurrency(p.amount)}</span>
          </div>
        ))}

        {sale.payments.some((p) => p.cashChange && p.cashChange > 0) && (
          <div className="flex justify-between gap-2 pt-1">
            <span>VUELTO ENTREGADO:</span>
            <span className="tabular-nums">
              {formatCurrency(sale.payments.find((p) => p.cashChange)?.cashChange || 0)}
            </span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="pt-3 text-center space-y-1">
        <div className="break-words">{settings.footerNote || '¡Gracias por su compra!'}</div>
        <div className="tracking-widest break-all">
          * {sale.id} *
        </div>
      </div>
    </div>
);
