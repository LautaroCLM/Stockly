import React from 'react';
import { FileText, HandCoins } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/formatters';
import { ACCOUNT_LABELS } from '../accountKinds';
import type { AccountKind } from '../accountKinds';
import { daysOpen, debtAge } from '../collectionMath';
import type { DebtAge } from '../collectionMath';
import type { AccountBalance } from '../types';

const AGE_STYLE: Record<DebtAge, string> = {
  recent: 'text-text-muted',
  warning: 'text-amber-400',
  overdue: 'text-danger',
};

interface BalancesTableProps {
  kind: AccountKind;
  balances: AccountBalance[];
  onSettle: (party: AccountBalance) => void;
  onOpenStatement: (party: AccountBalance) => void;
}

/** Cuentas corrientes (de clientes o de proveedores): saldo, antigüedad de la deuda y acciones. */
export const BalancesTable: React.FC<BalancesTableProps> = ({ kind, balances, onSettle, onOpenStatement }) => {
  const labels = ACCOUNT_LABELS[kind];
  return (
    <Card className="border-border bg-surface overflow-x-auto">
      <table className="w-full text-xs min-w-[640px]">
        <thead>
          <tr className="text-left text-text-muted border-b border-border">
            <th className="p-3 font-semibold">{labels.partyColumn}</th>
            <th className="p-3 font-semibold text-right">{labels.chargedColumn}</th>
            <th className="p-3 font-semibold text-right">{labels.settledColumn}</th>
            <th className="p-3 font-semibold text-right">Saldo</th>
            <th className="p-3 font-semibold">Deuda más antigua</th>
            <th className="p-3"><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          {balances.map((b) => {
            const days = b.balance > 0 ? daysOpen(b.oldestOpenSince) : null;
            return (
              <tr key={b.partyId} className="border-b border-border/60 last:border-0">
                <td className="p-3 text-text-primary font-medium">{b.partyName}</td>
                <td className="p-3 text-right tabular-nums text-text-secondary">{formatCurrency(b.chargedTotal)}</td>
                <td className="p-3 text-right tabular-nums text-text-secondary">{formatCurrency(b.settledTotal)}</td>
                <td className={`p-3 text-right tabular-nums font-bold ${b.balance > 0 ? 'text-text-primary' : 'text-emerald-400'}`}>
                  {formatCurrency(b.balance)}
                  {b.balance < 0 && <span className="block text-[10px] font-normal">{labels.favorNote}</span>}
                </td>
                <td className={`p-3 ${AGE_STYLE[debtAge(days)]}`}>
                  {days === null ? 'Sin deuda' : days === 0 ? 'Hoy' : `Hace ${days} ${days === 1 ? 'día' : 'días'}`}
                </td>
                <td className="p-3">
                  <div className="flex justify-end gap-1.5">
                    <Button variant="secondary" size="sm" onClick={() => onOpenStatement(b)} className="gap-1 h-8">
                      <FileText size={13} /><span>Estado de cuenta</span>
                    </Button>
                    <Button variant="primary" size="sm" disabled={b.balance <= 0} onClick={() => onSettle(b)} className="gap-1 h-8">
                      <HandCoins size={13} /><span>{labels.actionButton}</span>
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
};
