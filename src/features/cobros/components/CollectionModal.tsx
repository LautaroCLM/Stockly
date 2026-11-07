import React, { useState } from 'react';
import { HandCoins, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/formatters';
import { fromHundredths, parseHundredths, toHundredths } from '@/lib/decimal';
import { CASH_FIELD_CLASS, CashFormError, CashModalShell } from '@/features/caja/components/CashModalShell';
import { cashPart, collectionTotal } from '../collectionMath';
import { COLLECTION_METHODS, COLLECTION_METHOD_LABELS } from '../types';
import type { CollectionActionResult, CollectionMethod, CustomerBalance, NewCollectionInput } from '../types';

interface Row {
  id: number;
  method: CollectionMethod;
  amount: string;
}

interface CollectionModalProps {
  customer: CustomerBalance;
  onClose: () => void;
  onSubmit: (input: NewCollectionInput) => Promise<CollectionActionResult>;
}

/** Registra un cobro de cuenta corriente, con uno o varios medios de pago. */
export const CollectionModal: React.FC<CollectionModalProps> = ({ customer, onClose, onSubmit }) => {
  // La misma clave se reutiliza en los reintentos: así un cobro no se duplica
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [rows, setRows] = useState<Row[]>([{ id: 1, method: 'efectivo', amount: String(customer.balance).replace('.', ',') }]);
  const [notes, setNotes] = useState('');
  const [intoCash, setIntoCash] = useState(false);
  const [error, setError] = useState<{ message: string; uncertain?: boolean } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const parsed = rows.map((r) => ({ method: r.method, cents: parseHundredths(r.amount) }));
  const parts = parsed.filter((p) => p.cents !== null && p.cents > 0).map((p) => ({ method: p.method, amount: fromHundredths(p.cents as number) }));
  const total = collectionTotal(parts);
  const hasCash = cashPart(parts) > 0;
  const remainingCents = toHundredths(customer.balance) - toHundredths(total);

  const update = (id: number, changes: Partial<Row>) => setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...changes } : r)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (parsed.some((p) => p.cents === null || p.cents <= 0)) {
      return setError({ message: 'Cada medio de pago necesita un importe mayor a 0, con hasta dos decimales.' });
    }
    if (remainingCents < 0) {
      return setError({ message: `El cobro supera el saldo del cliente (${formatCurrency(customer.balance)}).` });
    }
    setIsSubmitting(true);
    setError(null);
    const result = await onSubmit({ customerId: customer.customerId, parts, notes: notes.trim(), intoCash: hasCash && intoCash, idempotencyKey });
    setIsSubmitting(false);
    if (result.ok) onClose();
    else setError({ message: result.message, uncertain: result.uncertain });
  };

  return (
    <CashModalShell title="Registrar cobro" subtitle={`${customer.customerName} · debe ${formatCurrency(customer.balance)}`}
      icon={<HandCoins size={18} />} isBusy={isSubmitting} onClose={onClose}>
      <form onSubmit={handleSubmit} className="p-6 space-y-3 text-xs">
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center gap-2">
              <select aria-label="Medio de pago" value={row.method} disabled={isSubmitting}
                onChange={(e) => update(row.id, { method: e.target.value as CollectionMethod })} className={`${CASH_FIELD_CLASS} !w-auto min-w-0 flex-1`}>
                {COLLECTION_METHODS.map((m) => <option key={m} value={m}>{COLLECTION_METHOD_LABELS[m]}</option>)}
              </select>
              <input aria-label="Importe" inputMode="decimal" autoComplete="off" placeholder="0,00" value={row.amount} disabled={isSubmitting}
                onChange={(e) => update(row.id, { amount: e.target.value })} className={`${CASH_FIELD_CLASS} !w-32 shrink-0 text-right tabular-nums`} />
              <button type="button" disabled={rows.length <= 1 || isSubmitting} onClick={() => setRows((prev) => prev.filter((r) => r.id !== row.id))}
                aria-label="Quitar medio de pago" className="p-1.5 text-text-muted hover:text-danger rounded disabled:opacity-30 disabled:pointer-events-none">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button type="button" disabled={isSubmitting} onClick={() => setRows((prev) => [...prev, { id: Date.now(), method: 'transferencia', amount: '' }])}
            className="flex items-center gap-1 text-primary hover:underline disabled:opacity-50">
            <Plus size={12} /> Agregar otro medio de pago
          </button>
        </div>
        <div className="flex justify-between p-2.5 rounded-lg bg-surface-2 border border-border">
          <span className="text-text-secondary">Total del cobro</span>
          <span className="font-bold tabular-nums text-text-primary">{formatCurrency(total)}</span>
        </div>
        <p className="text-text-muted">
          {remainingCents < 0 ? <span className="text-danger">Supera el saldo.</span> : `Saldo después del cobro: ${formatCurrency(fromHundredths(remainingCents))}`}
        </p>
        {hasCash && (
          <label className="flex items-start gap-2 p-2.5 rounded-lg bg-surface-2 border border-border cursor-pointer">
            <input type="checkbox" checked={intoCash} onChange={(e) => setIntoCash(e.target.checked)} disabled={isSubmitting} className="mt-0.5" />
            <span className="text-text-secondary leading-relaxed">El efectivo ingresa a la caja abierta: suma al arqueo.</span>
          </label>
        )}
        <input aria-label="Nota (opcional)" maxLength={500} placeholder="Nota (opcional): recibo, referencia, etc." value={notes}
          onChange={(e) => setNotes(e.target.value)} disabled={isSubmitting} className={CASH_FIELD_CLASS} />
        <CashFormError message={error?.message ?? null} uncertain={error?.uncertain} />
        <div className="pt-3 border-t border-border flex justify-end gap-2.5">
          <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
          <Button type="submit" variant="primary" size="sm" disabled={isSubmitting || total <= 0} className="gap-1.5">
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            <span>Registrar cobro</span>
          </Button>
        </div>
      </form>
    </CashModalShell>
  );
};
