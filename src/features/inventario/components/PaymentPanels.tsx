import React from 'react';
import { Banknote, Building, CreditCard, LucideIcon, Plus, Receipt, Trash2 } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';
import type { PaymentEntry, PaymentMethod } from '../types';
import { singlePaymentSummary, splitPaymentSummary } from '../checkoutPayments';

export const PAYMENT_OPTIONS: { id: PaymentMethod; label: string; icon: LucideIcon }[] = [
  { id: 'efectivo', label: 'Efectivo', icon: Banknote },
  { id: 'transferencia', label: 'Transferencia', icon: Building },
  { id: 'debito', label: 'Tarjeta Débito', icon: CreditCard },
  { id: 'credito', label: 'Tarjeta Crédito', icon: CreditCard },
  { id: 'cheque', label: 'Cheque', icon: Receipt },
];

interface SinglePaymentPanelProps {
  total: number;
  method: PaymentMethod;
  cashReceived: string;
  onMethodChange: (method: PaymentMethod) => void;
  onCashReceivedChange: (value: string) => void;
}

/** Pago con un solo medio; en efectivo calcula el vuelto. */
export const SinglePaymentPanel: React.FC<SinglePaymentPanelProps> = ({ total, method, cashReceived, onMethodChange, onCashReceivedChange }) => {
  const summary = singlePaymentSummary(total, method, cashReceived);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {PAYMENT_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const isSelected = method === opt.id;
          return (
            <button key={opt.id} type="button" onClick={() => onMethodChange(opt.id)}
              className={`p-3 rounded-xl border text-left flex flex-col gap-1.5 transition-all ${
                isSelected
                  ? 'bg-primary/10 border-primary text-text-primary shadow-sm'
                  : 'bg-surface-2 border-border/80 text-text-secondary hover:text-text-primary hover:bg-surface-3'
              }`}>
              <Icon size={16} />
              <span className="text-xs font-medium">{opt.label}</span>
            </button>
          );
        })}
      </div>

      {method === 'efectivo' && (
        <div className="bg-surface-2 border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <label className="text-xs font-medium text-text-secondary">Importe Recibido en Efectivo:</label>
            <div className="relative w-44">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-text-muted">$</span>
              <input type="number" min="0" step="100" value={cashReceived} onChange={(e) => onCashReceivedChange(e.target.value)}
                className="w-full h-9 pl-7 pr-3 text-xs font-bold text-right bg-surface-3 border border-border focus:border-primary rounded-lg text-text-primary focus:outline-none tabular-nums" />
            </div>
          </div>
          <div className="pt-2 border-t border-border/60 flex items-center justify-between text-xs">
            <span className="text-text-muted">Vuelto a entregar al cliente:</span>
            <span className={`text-sm font-bold tabular-nums ${summary.cashInsufficient ? 'text-danger' : 'text-emerald-400'}`}>
              {summary.cashInsufficient ? 'Faltan ' + formatCurrency(summary.missing) : formatCurrency(summary.cashChange)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

interface SplitPaymentPanelProps {
  total: number;
  splits: PaymentEntry[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, updates: Partial<PaymentEntry>) => void;
}

/** Pago con varios medios: la suma debe cubrir exactamente el total. */
export const SplitPaymentPanel: React.FC<SplitPaymentPanelProps> = ({ total, splits, onAdd, onRemove, onUpdate }) => {
  const summary = splitPaymentSummary(total, splits);
  const differenceClass = summary.isExact ? 'text-emerald-400' : summary.difference > 0 ? 'text-amber-400' : 'text-danger';
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {splits.map((split, idx) => (
          <div key={split.id} className="p-3 bg-surface-2 border border-border rounded-xl flex items-center gap-2">
            <span className="text-[11px] font-mono text-text-muted w-5">#{idx + 1}</span>
            <select value={split.method} onChange={(e) => onUpdate(split.id, { method: e.target.value as PaymentMethod })}
              className="h-8 px-2 text-xs bg-surface-3 border border-border rounded-lg text-text-primary focus:outline-none flex-1">
              {PAYMENT_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
            <div className="relative w-36">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-text-muted">$</span>
              <input type="number" min="0" value={split.amount}
                onChange={(e) => onUpdate(split.id, { amount: parseFloat(e.target.value) || 0 })}
                className="w-full h-8 pl-6 pr-2 text-xs font-semibold text-right bg-surface-3 border border-border rounded-lg text-text-primary focus:outline-none tabular-nums" />
            </div>
            <button type="button" disabled={splits.length <= 1} onClick={() => onRemove(split.id)} aria-label="Quitar medio de pago"
              className="p-1.5 text-text-muted hover:text-danger rounded disabled:opacity-30 disabled:pointer-events-none">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      <button type="button" onClick={onAdd}
        className="w-full py-2 border border-dashed border-border hover:border-primary/60 rounded-xl text-xs font-medium text-text-muted hover:text-text-primary flex items-center justify-center gap-1.5 transition-colors">
        <Plus size={14} />
        <span>Agregar otro medio de pago</span>
      </button>

      <div className="bg-surface-2/60 border border-border rounded-xl p-3 space-y-1.5 text-xs">
        <div className="flex items-center justify-between text-text-secondary">
          <span>Total a cubrir:</span>
          <span className="font-semibold tabular-nums">{formatCurrency(total)}</span>
        </div>
        <div className="flex items-center justify-between text-text-secondary">
          <span>Asignado en medios de pago:</span>
          <span className="font-semibold tabular-nums">{formatCurrency(summary.assigned)}</span>
        </div>
        <div className="flex items-center justify-between pt-1 border-t border-border/60">
          <span className="font-semibold text-text-primary">Diferencia:</span>
          <span className={`font-bold tabular-nums ${differenceClass}`}>
            {summary.isExact
              ? '✓ Cubierto 100%'
              : summary.difference > 0
                ? `Faltan ${formatCurrency(summary.difference)}`
                : `Excede por ${formatCurrency(Math.abs(summary.difference))}`}
          </span>
        </div>
      </div>
    </div>
  );
};
