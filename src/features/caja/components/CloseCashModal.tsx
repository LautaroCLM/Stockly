import React, { useState } from 'react';
import { Loader2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/formatters';
import { cashDifference, differenceKind, parseMoneyInput } from '../cashMath';
import type { CashActionResult } from '../types';
import { CASH_FIELD_CLASS, CashFormError, CashModalShell } from './CashModalShell';

interface CloseCashModalProps {
  expectedAmount: number;
  onClose: () => void;
  onSubmit: (countedAmount: number, notes: string) => Promise<CashActionResult>;
}

const DIFFERENCE_COPY = {
  exact: { label: 'La caja cuadra', className: 'text-emerald-400' },
  surplus: { label: 'Sobrante', className: 'text-warning' },
  shortage: { label: 'Faltante', className: 'text-danger' },
} as const;

/**
 * Cierre con arqueo: el usuario cuenta el efectivo y lo compara con lo esperado.
 * El esperado final lo recalcula la base al cerrar (pudo entrar una venta mientras tanto).
 */
export const CloseCashModal: React.FC<CloseCashModalProps> = ({ expectedAmount, onClose, onSubmit }) => {
  const [counted, setCounted] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<{ message: string; uncertain?: boolean } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const countedValue = parseMoneyInput(counted);
  const difference = countedValue === null ? null : cashDifference(countedValue, expectedAmount);
  const kind = difference === null ? null : differenceKind(difference);
  const needsNotes = kind !== null && kind !== 'exact';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (countedValue === null) {
      setError({ message: 'Ingresá el efectivo contado: un importe de 0 o más, con hasta dos decimales.' });
      return;
    }
    if (needsNotes && !notes.trim()) {
      setError({ message: 'Hay diferencia entre lo contado y lo esperado: explicá el motivo en la observación.' });
      return;
    }
    setIsSubmitting(true);
    setError(null);
    const result = await onSubmit(countedValue, notes.trim());
    setIsSubmitting(false);
    if (result.ok) onClose();
    else setError({ message: result.message, uncertain: result.uncertain });
  };

  return (
    <CashModalShell title="Cerrar caja" subtitle="Arqueo de efectivo" icon={<Lock size={18} />} isBusy={isSubmitting} onClose={onClose}>
      <form onSubmit={handleSubmit} className="p-6 space-y-3 text-xs">
        <div className="bg-surface-2/60 border border-border rounded-xl p-3.5 flex justify-between">
          <span className="text-text-muted">Efectivo esperado</span>
          <span className="font-bold text-text-primary tabular-nums">{formatCurrency(expectedAmount)}</span>
        </div>
        <div className="space-y-1">
          <label htmlFor="counted-amount" className="font-semibold text-text-secondary">
            Efectivo contado en el cajón ($) <span className="text-danger">*</span>
          </label>
          <input id="counted-amount" inputMode="decimal" autoComplete="off" value={counted}
            onChange={(e) => setCounted(e.target.value)} disabled={isSubmitting} className={CASH_FIELD_CLASS} />
        </div>
        {difference !== null && kind !== null && (
          <div className="flex justify-between font-semibold" aria-live="polite">
            <span className={DIFFERENCE_COPY[kind].className}>{DIFFERENCE_COPY[kind].label}</span>
            <span className={`tabular-nums ${DIFFERENCE_COPY[kind].className}`}>{formatCurrency(difference)}</span>
          </div>
        )}
        <div className="space-y-1">
          <label htmlFor="closing-notes" className="font-semibold text-text-secondary">
            Observación {needsNotes ? <span className="text-danger">*</span> : '(opcional)'}
          </label>
          <textarea id="closing-notes" rows={2} maxLength={500} value={notes}
            placeholder={needsNotes ? 'Ej. Faltante por error de vuelto' : ''}
            onChange={(e) => setNotes(e.target.value)} disabled={isSubmitting} className={`${CASH_FIELD_CLASS} resize-none`} />
        </div>
        <p className="text-text-muted">Una caja cerrada no se puede modificar.</p>
        <CashFormError message={error?.message ?? null} uncertain={error?.uncertain} />
        <div className="pt-3 border-t border-border flex justify-end gap-2.5">
          <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
          <Button type="submit" variant="primary" size="sm" disabled={isSubmitting} className="gap-1.5">
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            <span>Cerrar caja</span>
          </Button>
        </div>
      </form>
    </CashModalShell>
  );
};
