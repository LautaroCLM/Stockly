import React from 'react';
import type { Company } from '@/types';
import { formatCurrency, formatDateTime } from '@/lib/formatters';
import type { Sale } from '../types';
import { paymentMethodLabel } from '../paymentMethods';

/** Ticket de venta imprimible (formato térmico de 80 mm). Comprobante no fiscal. */
export const ReceiptTicket: React.FC<{ sale: Sale; company: Company }> = ({ sale, company }) => (
    <div
      id="thermal-receipt"
      className="bg-white text-zinc-900 font-mono text-[11px] p-6 rounded-xl border border-zinc-300 shadow-md max-w-[340px] mx-auto print:border-none print:shadow-none print:max-w-full print:p-0"
    >
      {/* Header */}
      <div className="text-center pb-3 border-b border-dashed border-zinc-400 space-y-1">
        <div className="text-base font-extrabold uppercase tracking-wider">
          STOCKLY
        </div>
        <div className="text-xs font-bold uppercase">{company.name}</div>
        <div className="text-[10px] text-zinc-600">
          {[company.cuit ? `CUIT: ${company.cuit}` : null, company.industry].filter(Boolean).join(' • ')}
        </div>
        <div className="pt-1 text-[9px] uppercase font-bold text-rose-700 bg-rose-50 border border-rose-200 py-0.5 px-2 rounded">
          COMPROBANTE NO FISCAL - USO INTERNO
        </div>
        {sale.status === 'anulada' && (
          <div className="mt-1.5 py-1 border-2 border-red-700 text-red-700 font-extrabold text-[11px] tracking-widest">
            VENTA ANULADA
            {sale.cancelReason && (
              <span className="block text-[9px] font-medium tracking-normal">Motivo: {sale.cancelReason}</span>
            )}
          </div>
        )}
      </div>

      {/* Sale Meta */}
      <div className="py-2.5 border-b border-dashed border-zinc-400 text-[10px] space-y-1">
        <div className="flex justify-between">
          <span className="font-bold">NRO VENTA:</span>
          <span className="font-bold text-zinc-900">{sale.saleNumber}</span>
        </div>
        <div className="flex justify-between">
          <span>FECHA:</span>
          <span>{formatDateTime(sale.createdAt)}</span>
        </div>
        <div className="flex justify-between">
          <span>CLIENTE:</span>
          <span className="font-medium truncate max-w-[170px]">{sale.clientName}</span>
        </div>
        {sale.customerDoc && (
          <div className="flex justify-between text-[9px] text-zinc-600">
            <span>IDENTIFICACIÓN:</span>
            <span className="font-medium">{sale.customerDoc}</span>
          </div>
        )}
      </div>

      {/* Items Table */}
      <div className="py-2.5 border-b border-dashed border-zinc-400">
        <div className="grid grid-cols-12 text-[10px] font-bold pb-1 text-zinc-700">
          <span className="col-span-2">CANT</span>
          <span className="col-span-6">DETALLE</span>
          <span className="col-span-4 text-right">TOTAL</span>
        </div>

        <div className="space-y-1.5 pt-1">
          {sale.items.map((item, idx) => (
            <div key={idx} className="grid grid-cols-12 text-[10px] leading-tight">
              <span className="col-span-2 font-bold">{item.quantity}</span>
              <div className="col-span-6 pr-1">
                <div className="truncate font-medium">{item.name}</div>
                <div className="text-[9px] text-zinc-500">@{formatCurrency(item.unitPrice)}</div>
              </div>
              <span className="col-span-4 text-right font-bold tabular-nums">
                {formatCurrency(item.subtotal)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Totals & Payments */}
      <div className="py-2.5 border-b border-dashed border-zinc-400 space-y-1 text-[11px]">
        <div className="flex justify-between">
          <span>Subtotal:</span>
          <span className="tabular-nums">{formatCurrency(sale.subtotal)}</span>
        </div>

        {sale.discountAmount > 0 && (
          <div className="flex justify-between text-zinc-700">
            <span>Descuento ({sale.discountPercent}%):</span>
            <span className="tabular-nums">-{formatCurrency(sale.discountAmount)}</span>
          </div>
        )}

        <div className="flex justify-between text-sm font-extrabold pt-1 border-t border-zinc-300">
          <span>TOTAL:</span>
          <span className="tabular-nums">{formatCurrency(sale.total)}</span>
        </div>
      </div>

      {/* Payment breakdown */}
      <div className="py-2.5 border-b border-dashed border-zinc-400 text-[10px] space-y-1">
        <span className="font-bold uppercase">Medios de Pago:</span>
        {sale.payments.map((p, idx) => (
          <div key={idx} className="flex justify-between text-zinc-700">
            <span>{paymentMethodLabel(p.method)}:</span>
            <span className="font-bold tabular-nums">{formatCurrency(p.amount)}</span>
          </div>
        ))}

        {sale.payments.some((p) => p.cashChange && p.cashChange > 0) && (
          <div className="flex justify-between text-zinc-600 pt-1 text-[9px]">
            <span>Vuelto entregado:</span>
            <span className="tabular-nums">
              {formatCurrency(sale.payments.find((p) => p.cashChange)?.cashChange || 0)}
            </span>
          </div>
        )}
      </div>

      {/* Footer barcode/greeting */}
      <div className="pt-3 text-center space-y-1 text-[9px] text-zinc-500">
        <div>¡Gracias por su compra!</div>
        <div className="font-mono text-[8px] tracking-widest text-zinc-400">
          * {sale.id} *
        </div>
      </div>
    </div>
);
