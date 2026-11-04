import React from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { formatCurrency } from '@/lib/formatters';
import { paymentMethodLabel } from '../cashMath';
import type { CashSummary } from '../types';

interface Line {
  label: string;
  amount: number;
  sign: '+' | '-' | '';
  hint?: string;
}

/** Cómo se llega al efectivo esperado del turno, línea por línea. */
export const CashSummaryPanel: React.FC<{ summary: CashSummary }> = ({ summary }) => {
  const lines: Line[] = [
    { label: 'Fondo inicial', amount: summary.openingAmount, sign: '' },
    {
      label: 'Ventas cobradas en efectivo',
      amount: summary.cashSalesAmount,
      sign: '+',
      hint: summary.completedSalesCount === null ? undefined : `${summary.completedSalesCount} ventas completadas en el turno`,
    },
    { label: 'Devoluciones por anulaciones', amount: summary.cashRefundsAmount, sign: '-' },
    { label: 'Ingresos de efectivo', amount: summary.cashInAmount, sign: '+' },
    { label: 'Retiros de efectivo', amount: summary.cashOutAmount, sign: '-' },
  ];
  const otherPayments = Object.entries(summary.otherPayments).filter(([, amount]) => amount !== 0);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardContent className="p-5 text-xs">
          <h2 className="text-sm font-semibold text-text-primary mb-3">Efectivo en el cajón</h2>
          <dl className="divide-y divide-border/50">
            {lines.map((line) => (
              <div key={line.label} className="flex items-start justify-between gap-3 py-2">
                <dt>
                  <span className="text-text-secondary">{line.label}</span>
                  {line.hint && <span className="block text-[11px] text-text-muted">{line.hint}</span>}
                </dt>
                <dd className="tabular-nums text-text-primary">
                  {line.sign && <span className="text-text-muted mr-1">{line.sign}</span>}
                  {formatCurrency(line.amount)}
                </dd>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 pt-3">
              <dt className="text-sm font-semibold text-text-primary">Efectivo esperado</dt>
              <dd className="text-lg font-bold tabular-nums text-primary">{formatCurrency(summary.expectedAmount)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5 text-xs">
          <h2 className="text-sm font-semibold text-text-primary mb-1">Otros medios de cobro</h2>
          <p className="text-[11px] text-text-muted mb-3">
            Cobrado en el turno con medios que no pasan por el cajón. Sirve para controlar contra el posnet o el banco.
          </p>
          {otherPayments.length === 0 ? (
            <p className="text-text-muted">Sin cobros con otros medios en este turno.</p>
          ) : (
            <dl className="space-y-1.5">
              {otherPayments.map(([method, amount]) => (
                <div key={method} className="flex justify-between gap-3">
                  <dt className="text-text-secondary">{paymentMethodLabel(method)}</dt>
                  <dd className="tabular-nums text-text-primary">{formatCurrency(amount)}</dd>
                </div>
              ))}
            </dl>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
