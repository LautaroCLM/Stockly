import React from 'react';
import { Ban } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { formatCurrency, formatDateShort } from '@/lib/formatters';
import { EXPENSE_CATEGORY_LABELS, EXPENSE_METHOD_LABELS } from '../types';
import type { Expense } from '../types';

interface ExpensesTableProps {
  expenses: Expense[];
  onVoid: (expense: Expense) => void;
}

/** Lista de gastos: fecha, categoría, descripción, medio de pago e importe. */
export const ExpensesTable: React.FC<ExpensesTableProps> = ({ expenses, onVoid }) => (
  <Card className="border-border bg-surface overflow-x-auto">
    <table className="w-full text-xs min-w-[640px]">
      <thead>
        <tr className="text-left text-text-muted border-b border-border">
          <th className="p-3 font-semibold">Fecha</th>
          <th className="p-3 font-semibold">Detalle</th>
          <th className="p-3 font-semibold">Medio de pago</th>
          <th className="p-3 font-semibold text-right">Importe</th>
          <th className="p-3 w-10"><span className="sr-only">Acciones</span></th>
        </tr>
      </thead>
      <tbody>
        {expenses.map((e) => (
          <tr key={e.id} className={`border-b border-border/60 last:border-0 ${e.isVoided ? 'opacity-50' : ''}`}>
            <td className="p-3 text-text-secondary whitespace-nowrap">{formatDateShort(e.expenseDate)}</td>
            <td className="p-3">
              <p className={`text-text-primary ${e.isVoided ? 'line-through' : ''}`}>{e.description}</p>
              <p className="text-[11px] text-text-muted">
                {EXPENSE_CATEGORY_LABELS[e.category]}
                {e.supplierName && ` · ${e.supplierName}`} · {e.createdByName}
                {e.isVoided && e.voidReason && ` · Anulado: ${e.voidReason}`}
              </p>
            </td>
            <td className="p-3 text-text-secondary">
              {EXPENSE_METHOD_LABELS[e.paymentMethod]}
              {e.paidFromCash && <span className="block text-[11px] text-text-muted">De la caja</span>}
            </td>
            <td className={`p-3 text-right tabular-nums font-semibold text-text-primary ${e.isVoided ? 'line-through' : ''}`}>
              {formatCurrency(e.amount)}
            </td>
            <td className="p-3 text-right">
              {!e.isVoided && (
                <button onClick={() => onVoid(e)} aria-label={`Anular gasto ${e.description}`} title="Anular"
                  className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-surface-2">
                  <Ban size={14} />
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </Card>
);
