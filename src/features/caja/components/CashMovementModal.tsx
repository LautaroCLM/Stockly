import React, { useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/formatters';
import { parseMoneyInput } from '../cashMath';
import type { CashActionResult, CashMovementType } from '../types';
import { CASH_FIELD_CLASS, CashFormError, CashModalShell } from './CashModalShell';

interface CashMovementModalProps {
  movementType: CashMovementType;
  expectedAmount: number;
  onClose: () => void;
  onSubmit: (movementType: CashMovementType, amount: number, reason: string) => Promise<CashActionResult>;
}

const COPY: Record<CashMovementType, { title: string; help: string; placeholder: string }> = {
  in: {
    title: 'Ingreso de efectivo',
    help: 'Efectivo que se agrega al cajón (por ejemplo, más cambio). No es una venta.',
    placeholder: 'Ej. Cambio en monedas traído del banco',
  },
  out: {
    title: 'Retiro de efectivo',
    help: 'Efectivo que se saca del cajón para guardarlo o depositarlo. No registra gastos: eso corresponde a Finanzas.',
    placeholder: 'Ej. Retiro a caja fuerte',
  },
};

/** Registra un ingreso o retiro de efectivo del cajón, con motivo obligatorio. */
export const CashMovementModal: React.FC<CashMovementModalProps> = ({ movementType, expectedAmount, onClose, onSubmit }) => {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<{ message: string; uncertain?: boolean } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const copy = COPY[movementType];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = parseMoneyInput(amount);
    if (value === null || value <= 0) {
      setError({ message: 'Ingresá un importe mayor a 0, con hasta dos decimales.' });
      return;
    }
    if (movementType === 'out' && value > expectedAmount) {
      setError({ message: `No se puede retirar más de lo que debería haber en la caja (${formatCurrency(expectedAmount)}).` });
      return;
    }
    if (!reason.trim()) {
      setError({ message: 'Indicá el motivo del movimiento.' });
      return;
    }
    setIsSubmitting(true);
    setError(null);
    const result = await onSubmit(movementType, value, reason.trim());
    setIsSubmitting(false);
    if (result.ok) onClose();
    else setError({ message: result.message, uncertain: result.uncertain });
  };

  return (
    <CashModalShell
      title={copy.title}
      subtitle={`Efectivo esperado ahora: ${formatCurrency(expectedAmount)}`}
      icon={movementType === 'in' ? <ArrowDownCircle size={18} /> : <ArrowUpCircle size={18} />}
      isBusy={isSubmitting}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="p-6 space-y-3 text-xs">
        <p className="text-text-muted leading-relaxed">{copy.help}</p>
        <div className="space-y-1">
          <label htmlFor="movement-amount" className="font-semibold text-text-secondary">
            Importe ($) <span className="text-danger">*</span>
          </label>
          <input id="movement-amount" inputMode="decimal" autoComplete="off" value={amount}
            onChange={(e) => setAmount(e.target.value)} disabled={isSubmitting} className={CASH_FIELD_CLASS} />
        </div>
        <div className="space-y-1">
          <label htmlFor="movement-reason" className="font-semibold text-text-secondary">
            Motivo <span className="text-danger">*</span>
          </label>
          <input id="movement-reason" maxLength={500} placeholder={copy.placeholder} value={reason}
            onChange={(e) => setReason(e.target.value)} disabled={isSubmitting} className={CASH_FIELD_CLASS} />
        </div>
        <CashFormError message={error?.message ?? null} uncertain={error?.uncertain} />
        <div className="pt-3 border-t border-border flex justify-end gap-2.5">
          <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
          <Button type="submit" variant="primary" size="sm" disabled={isSubmitting} className="gap-1.5">
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            <span>Registrar {movementType === 'in' ? 'ingreso' : 'retiro'}</span>
          </Button>
        </div>
      </form>
    </CashModalShell>
  );
};
