import React from 'react';
import { Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { formatCurrency } from '@/lib/formatters';
import { toHundredths } from '@/lib/decimal';
import { paymentMethodLabel } from '@/features/inventario/paymentMethods';

/** Cuánto se cobró con cada medio de pago, con su peso sobre el total. */
export const PaymentsBreakdown: React.FC<{ paymentsByMethod: Record<string, number> }> = ({ paymentsByMethod }) => {
  const rows = Object.entries(paymentsByMethod)
    .filter(([, amount]) => amount !== 0)
    .sort(([, a], [, b]) => b - a);
  const totalCents = rows.reduce((sum, [, amount]) => sum + toHundredths(amount), 0);
  const hasCheques = (paymentsByMethod.cheque ?? 0) > 0;

  return (
    <Card className="border-border bg-surface">
      <CardContent className="p-5 text-xs space-y-3">
        <h2 className="text-sm font-semibold text-text-primary">Cobrado por medio de pago (incluye cobros de cuenta corriente)</h2>
        {rows.length === 0 ? (
          <p className="text-text-muted">No hubo cobros en el período.</p>
        ) : (
          <ul className="space-y-2.5">
            {rows.map(([method, amount]) => {
              const share = totalCents > 0 ? (toHundredths(amount) / totalCents) * 100 : 0;
              return (
                <li key={method} className="space-y-1">
                  <div className="flex justify-between gap-3">
                    <span className="text-text-secondary">{paymentMethodLabel(method)}</span>
                    <span className="tabular-nums text-text-primary">
                      {formatCurrency(amount)} <span className="text-text-muted">({share.toFixed(0)}%)</span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
                    <div className="h-full bg-primary/70" style={{ width: `${share}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {hasCheques && (
          <p className="flex items-start gap-1.5 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 leading-relaxed">
            <Info size={13} className="shrink-0 mt-0.5" />
            <span>
              Lo cobrado con cheque todavía no tiene seguimiento de acreditación: no es dinero disponible hasta que el cheque se acredite.
            </span>
          </p>
        )}
      </CardContent>
    </Card>
  );
};
