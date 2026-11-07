import React from 'react';
import { FileText, HandCoins } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/formatters';
import { daysOpen, debtAge } from '../collectionMath';
import type { DebtAge } from '../collectionMath';
import type { CustomerBalance } from '../types';

const AGE_STYLE: Record<DebtAge, string> = {
  recent: 'text-text-muted',
  warning: 'text-amber-400',
  overdue: 'text-danger',
};

interface BalancesTableProps {
  balances: CustomerBalance[];
  onCollect: (customer: CustomerBalance) => void;
  onOpenStatement: (customer: CustomerBalance) => void;
}

/** Clientes con cuenta corriente: saldo, antigüedad de la deuda y acciones. */
export const BalancesTable: React.FC<BalancesTableProps> = ({ balances, onCollect, onOpenStatement }) => (
  <Card className="border-border bg-surface overflow-x-auto">
    <table className="w-full text-xs min-w-[640px]">
      <thead>
        <tr className="text-left text-text-muted border-b border-border">
          <th className="p-3 font-semibold">Cliente</th>
          <th className="p-3 font-semibold text-right">Vendido a crédito</th>
          <th className="p-3 font-semibold text-right">Cobrado</th>
          <th className="p-3 font-semibold text-right">Saldo</th>
          <th className="p-3 font-semibold">Deuda más antigua</th>
          <th className="p-3"><span className="sr-only">Acciones</span></th>
        </tr>
      </thead>
      <tbody>
        {balances.map((b) => {
          const days = b.balance > 0 ? daysOpen(b.oldestOpenSince) : null;
          return (
            <tr key={b.customerId} className="border-b border-border/60 last:border-0">
              <td className="p-3 text-text-primary font-medium">{b.customerName}</td>
              <td className="p-3 text-right tabular-nums text-text-secondary">{formatCurrency(b.chargedTotal)}</td>
              <td className="p-3 text-right tabular-nums text-text-secondary">{formatCurrency(b.collectedTotal)}</td>
              <td className={`p-3 text-right tabular-nums font-bold ${b.balance > 0 ? 'text-text-primary' : 'text-emerald-400'}`}>
                {formatCurrency(b.balance)}
                {b.balance < 0 && <span className="block text-[10px] font-normal">a favor del cliente</span>}
              </td>
              <td className={`p-3 ${AGE_STYLE[debtAge(days)]}`}>
                {days === null ? 'Sin deuda' : days === 0 ? 'Hoy' : `Hace ${days} ${days === 1 ? 'día' : 'días'}`}
              </td>
              <td className="p-3">
                <div className="flex justify-end gap-1.5">
                  <Button variant="secondary" size="sm" onClick={() => onOpenStatement(b)} className="gap-1 h-8">
                    <FileText size={13} /><span>Estado de cuenta</span>
                  </Button>
                  <Button variant="primary" size="sm" disabled={b.balance <= 0} onClick={() => onCollect(b)} className="gap-1 h-8">
                    <HandCoins size={13} /><span>Cobrar</span>
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
