import React, { useState } from 'react';
import { Ban, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { CASH_FIELD_CLASS, CashFormError, CashModalShell } from '@/features/caja/components/CashModalShell';
import type { HrActionResult } from '../types';

interface ReasonModalProps {
  title: string;
  subtitle?: string;
  help: string;
  confirmLabel: string;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<HrActionResult>;
}

/** Pide un motivo obligatorio antes de una acción que no se puede deshacer, como anular un registro. */
export const ReasonModal: React.FC<ReasonModalProps> = ({ title, subtitle, help, confirmLabel, onClose, onSubmit }) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<{ message: string; uncertain?: boolean } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return setError({ message: 'Indicá el motivo.' });
    setIsSubmitting(true);
    setError(null);
    const result = await onSubmit(reason.trim());
    setIsSubmitting(false);
    if (result.ok) onClose();
    else setError({ message: result.message, uncertain: result.uncertain });
  };

  return (
    <CashModalShell title={title} subtitle={subtitle} icon={<Ban size={18} />} isBusy={isSubmitting} onClose={onClose}>
      <form onSubmit={handleSubmit} className="p-6 space-y-3 text-xs">
        <p className="text-text-muted leading-relaxed">{help}</p>
        <div className="space-y-1">
          <label htmlFor="reason-text" className="font-semibold text-text-secondary">Motivo <span className="text-danger">*</span></label>
          <input id="reason-text" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} disabled={isSubmitting} className={CASH_FIELD_CLASS} />
        </div>
        <CashFormError message={error?.message ?? null} uncertain={error?.uncertain} />
        <div className="pt-3 border-t border-border flex justify-end gap-2.5">
          <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
          <Button type="submit" variant="primary" size="sm" disabled={isSubmitting} className="gap-1.5">
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            <span>{confirmLabel}</span>
          </Button>
        </div>
      </form>
    </CashModalShell>
  );
};
