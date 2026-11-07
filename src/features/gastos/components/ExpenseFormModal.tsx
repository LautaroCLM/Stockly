import React, { useState } from 'react';
import { Loader2, ReceiptText } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { parseHundredths, fromHundredths } from '@/lib/decimal';
import { localDateInputValue } from '@/lib/localDate';
import { CASH_FIELD_CLASS, CashFormError, CashModalShell } from '@/features/caja/components/CashModalShell';
import type { Supplier } from '@/features/proveedores/types';
import {
  EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS, EXPENSE_METHOD_LABELS, EXPENSE_PAYMENT_METHODS,
} from '../types';
import type { ExpenseActionResult, ExpenseCategory, ExpensePaymentMethod, NewExpenseInput } from '../types';

interface ExpenseFormModalProps {
  suppliers: Supplier[];
  onClose: () => void;
  onSubmit: (input: NewExpenseInput) => Promise<ExpenseActionResult>;
}

const Field: React.FC<{ id: string; label: string; required?: boolean; children: React.ReactNode }> = ({ id, label, required, children }) => (
  <div className="space-y-1">
    <label htmlFor={id} className="font-semibold text-text-secondary">
      {label} {required && <span className="text-danger">*</span>}
    </label>
    {children}
  </div>
);

/** Formulario para registrar un gasto, con la opción de pagarlo desde la caja abierta. */
export const ExpenseFormModal: React.FC<ExpenseFormModalProps> = ({ suppliers, onClose, onSubmit }) => {
  const [date, setDate] = useState(localDateInputValue());
  const [category, setCategory] = useState<ExpenseCategory>('combustible');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<ExpensePaymentMethod>('transferencia');
  const [supplierId, setSupplierId] = useState('');
  const [payFromCash, setPayFromCash] = useState(false);
  const [error, setError] = useState<{ message: string; uncertain?: boolean } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cents = parseHundredths(amount);
    if (cents === null || cents <= 0) return setError({ message: 'Ingresá un importe mayor a 0, con hasta dos decimales.' });
    if (!description.trim()) return setError({ message: 'Describí el gasto.' });
    if (!date || date > localDateInputValue()) return setError({ message: 'La fecha no puede ser futura.' });
    setIsSubmitting(true);
    setError(null);
    const result = await onSubmit({
      expenseDate: date,
      category,
      description: description.trim(),
      amount: fromHundredths(cents),
      paymentMethod: method,
      supplierId: supplierId || null,
      payFromCash: method === 'efectivo' && payFromCash,
    });
    setIsSubmitting(false);
    if (result.ok) onClose();
    else setError({ message: result.message, uncertain: result.uncertain });
  };

  return (
    <CashModalShell title="Registrar gasto" icon={<ReceiptText size={18} />} isBusy={isSubmitting} onClose={onClose}>
      <form onSubmit={handleSubmit} className="p-6 space-y-3 text-xs">
        <div className="grid grid-cols-2 gap-3">
          <Field id="expense-date" label="Fecha" required>
            <input id="expense-date" type="date" value={date} max={localDateInputValue()} onChange={(e) => setDate(e.target.value)}
              disabled={isSubmitting} className={CASH_FIELD_CLASS} />
          </Field>
          <Field id="expense-amount" label="Importe ($)" required>
            <input id="expense-amount" inputMode="decimal" autoComplete="off" value={amount}
              onChange={(e) => setAmount(e.target.value)} disabled={isSubmitting} className={CASH_FIELD_CLASS} />
          </Field>
        </div>
        <Field id="expense-category" label="Categoría" required>
          <select id="expense-category" value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
            disabled={isSubmitting} className={CASH_FIELD_CLASS}>
            {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{EXPENSE_CATEGORY_LABELS[c]}</option>)}
          </select>
        </Field>
        <Field id="expense-description" label="Descripción" required>
          <input id="expense-description" maxLength={300} placeholder="Ej. Nafta para la retroexcavadora"
            value={description} onChange={(e) => setDescription(e.target.value)} disabled={isSubmitting} className={CASH_FIELD_CLASS} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="expense-method" label="Medio de pago" required>
            <select id="expense-method" value={method} onChange={(e) => { setMethod(e.target.value as ExpensePaymentMethod); setPayFromCash(false); }}
              disabled={isSubmitting} className={CASH_FIELD_CLASS}>
              {EXPENSE_PAYMENT_METHODS.map((m) => <option key={m} value={m}>{EXPENSE_METHOD_LABELS[m]}</option>)}
            </select>
          </Field>
          <Field id="expense-supplier" label="Proveedor (opcional)">
            <select id="expense-supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}
              disabled={isSubmitting} className={CASH_FIELD_CLASS}>
              <option value="">Sin proveedor</option>
              {suppliers.filter((s) => s.isActive).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        </div>
        {method === 'efectivo' && (
          <label className="flex items-start gap-2 p-2.5 rounded-lg bg-surface-2 border border-border cursor-pointer">
            <input type="checkbox" checked={payFromCash} onChange={(e) => setPayFromCash(e.target.checked)} disabled={isSubmitting} className="mt-0.5" />
            <span className="text-text-secondary leading-relaxed">
              Se pagó con efectivo de la caja abierta: se descuenta del arqueo.
            </span>
          </label>
        )}
        <CashFormError message={error?.message ?? null} uncertain={error?.uncertain} />
        <div className="pt-3 border-t border-border flex justify-end gap-2.5">
          <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
          <Button type="submit" variant="primary" size="sm" disabled={isSubmitting} className="gap-1.5">
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            <span>Registrar gasto</span>
          </Button>
        </div>
      </form>
    </CashModalShell>
  );
};
