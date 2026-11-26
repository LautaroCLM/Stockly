import React from 'react';
import { formatCurrency } from '@/lib/formatters';
import { expectedBreakdown, paymentMethodLabel } from '../../cashMath';
import type { CashSummary } from '../../types';

/** Paso 1: de dónde sale el efectivo que debería haber en el cajón, y lo cobrado por otros medios. */
export const CloseSummaryStep: React.FC<{ summary: CashSummary }> = ({ summary }) => {
  const otherPayments = Object.entries(summary.otherPayments).filter(([, amount]) => amount !== 0);
  return (
    <div className="space-y-3">
      <p className="text-text-muted">Revisá el movimiento del turno antes de contar. Esto es lo que debería haber en efectivo:</p>
      <dl className="rounded-xl border border-border bg-surface-2/40 divide-y divide-border/50">
        {expectedBreakdown(summary).map((line) => (
          <div key={line.label} className="flex items-start justify-between gap-3 px-3.5 py-2">
            <dt>
              <span className="text-text-secondary">{line.label}</span>
              {line.hint && <span className="block text-[10px] text-text-muted">{line.hint}</span>}
            </dt>
            <dd className="tabular-nums text-text-primary">{line.sign === '-' ? '−' : line.sign}{formatCurrency(line.amount)}</dd>
          </div>
        ))}
        <div className="flex justify-between px-3.5 py-2.5 bg-primary/5">
          <dt className="font-semibold text-text-primary">Efectivo esperado</dt>
          <dd className="font-bold text-primary tabular-nums">{formatCurrency(summary.expectedAmount)}</dd>
        </div>
      </dl>
      {otherPayments.length > 0 && (
        <div className="rounded-xl border border-border px-3.5 py-2.5 space-y-1">
          <p className="text-[11px] font-semibold text-text-secondary">Cobrado por otros medios (no está en el cajón)</p>
          {otherPayments.map(([method, amount]) => (
            <div key={method} className="flex justify-between text-text-muted">
              <span>{paymentMethodLabel(method)}</span>
              <span className="tabular-nums">{formatCurrency(amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
