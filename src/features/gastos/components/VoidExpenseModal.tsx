import React, { useState } from 'react';
import { Ban, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/formatters';
import { CASH_FIELD_CLASS, CashFormError, CashModalShell } from '@/features/caja/components/CashModalShell';
import type { Expense, ExpenseActionResult } from '../types';

interface VoidExpenseModalProps {
  expense: Expense;
  onClose: () => void;
  onSubmit: (expenseId: string, reason: string) => Promise<ExpenseActionResult>;
}

/** Anula un gasto con motivo obligatorio. Los gastos no se editan ni se borran. */
export const VoidExpenseModal: React.FC<VoidExpenseModalProps> = ({ expense, onClose, onSubmit }) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<{ message: string; uncertain?: boolean } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return setError({ message: 'Indicá el motivo de la anulación.' });
    setIsSubmitting(true);
    setError(null);
    const result = await onSubmit(expense.id, reason.trim());
    setIsSubmitting(false);
    if (result.ok) onClose();
    else setError({ message: result.message, uncertain: result.uncertain });
  };

  return (
    <CashModalShell title="Anular gasto" subtitle={`${expense.description} · ${formatCurrency(expense.amount)}`}
      icon={<Ban size={18} />} isBusy={isSubmitting} onClose={onClose}>
      <form onSubmit={handleSubmit} className="p-6 space-y-3 text-xs">
        <p className="text-text-muted leading-relaxed">
          El gasto deja de sumar en los totales pero queda en el historial. Si hubo un error de carga, anulalo y registralo de nuevo.
          {expense.paidFromCash && ' Se pagó desde la caja: el efectivo vuelve como ingreso a la caja que esté abierta (tiene que haber una).'}
        </p>
        <div className="space-y-1">
          <label htmlFor="void-reason" className="font-semibold text-text-secondary">
            Motivo <span className="text-danger">*</span>
          </label>
          <input id="void-reason" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)}
            disabled={isSubmitting} className={CASH_FIELD_CLASS} />
        </div>
        <CashFormError message={error?.message ?? null} uncertain={error?.uncertain} />
        <div className="pt-3 border-t border-border flex justify-end gap-2.5">
          <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
          <Button type="submit" variant="primary" size="sm" disabled={isSubmitting} className="gap-1.5">
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            <span>Anular gasto</span>
          </Button>
        </div>
      </form>
    </CashModalShell>
  );
};
