import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Loader2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/feedback/ToastProvider';
import { formatCurrency } from '@/lib/formatters';
import { cashDifference, differenceKind, parseMoneyInput } from '../cashMath';
import { countCash, type Denomination } from '../cashCount';
import type { CashActionResult, CashSummary } from '../types';
import { CashFormError, CashModalShell } from './CashModalShell';
import { CloseSummaryStep } from './close/CloseSummaryStep';
import { CashCountStep, type CountMode } from './close/CashCountStep';
import { CloseConfirmStep } from './close/CloseConfirmStep';

interface CloseCashModalProps {
  summary: CashSummary;
  onClose: () => void;
  onSubmit: (countedAmount: number, notes: string) => Promise<CashActionResult>;
}

const STEPS = ['Resumen', 'Contar', 'Confirmar'] as const;

/**
 * Cierre de caja guiado en tres pasos: revisar el turno, contar el efectivo (por billete o el total)
 * y confirmar viendo la diferencia. El esperado final lo recalcula la base al cerrar.
 */
export const CloseCashModal: React.FC<CloseCashModalProps> = ({ summary, onClose, onSubmit }) => {
  const { notify } = useToast();
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<CountMode>('bills');
  const [counts, setCounts] = useState<Partial<Record<Denomination, string>>>({});
  const [loose, setLoose] = useState('');
  const [total, setTotal] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<{ message: string; uncertain?: boolean } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const billCount = countCash(counts, loose);
  const counted = mode === 'bills' ? billCount.total : parseMoneyInput(total);
  const difference = counted === null ? null : cashDifference(counted, summary.expectedAmount);
  const kind = difference === null ? null : differenceKind(difference);

  const next = () => {
    setError(null);
    if (step === 1 && counted === null) {
      setError({ message: mode === 'bills' ? 'Revisá las cantidades marcadas en rojo: van números enteros.' : 'Ingresá el efectivo contado: un importe de 0 o más, con hasta dos decimales.' });
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step < STEPS.length - 1) return next();
    if (counted === null || kind === null || difference === null) return;
    if (kind !== 'exact' && !notes.trim()) {
      setError({ message: 'Hay diferencia entre lo contado y lo esperado: explicá el motivo en la observación.' });
      return;
    }
    setIsSubmitting(true);
    setError(null);
    const result = await onSubmit(counted, notes.trim());
    setIsSubmitting(false);
    if (!result.ok) return setError({ message: result.message, uncertain: result.uncertain });
    notify({
      message: 'Caja cerrada',
      detail: kind === 'exact' ? `Contado ${formatCurrency(counted)} · cuadró justo` : `Contado ${formatCurrency(counted)} · diferencia ${formatCurrency(difference)}`,
    });
    onClose();
  };

  return (
    <CashModalShell title="Cerrar caja" subtitle="Arqueo guiado" icon={<Lock size={18} />} isBusy={isSubmitting} onClose={onClose}>
      <form onSubmit={submit} className="p-6 space-y-4 text-xs">
        <ol className="flex items-center gap-2" aria-label="Pasos del cierre">
          {STEPS.map((label, i) => (
            <li key={label} aria-current={i === step ? 'step' : undefined} className="flex-1 space-y-1">
              <div className={`h-1 rounded-full transition-colors duration-300 ${i <= step ? 'bg-primary' : 'bg-surface-3'}`} />
              <span className={`text-[10px] font-semibold ${i === step ? 'text-primary' : 'text-text-muted'}`}>{i + 1}. {label}</span>
            </li>
          ))}
        </ol>

        {step === 0 && <CloseSummaryStep summary={summary} />}
        {step === 1 && (
          <CashCountStep mode={mode} onModeChange={setMode} counts={counts} loose={loose} total={total}
            onCountChange={(value, text) => setCounts((c) => ({ ...c, [value]: text }))}
            onLooseChange={setLoose} onTotalChange={setTotal}
            invalid={mode === 'bills' ? billCount.invalid : []} countedTotal={counted} />
        )}
        {step === 2 && counted !== null && difference !== null && kind !== null && (
          <CloseConfirmStep expected={summary.expectedAmount} counted={counted} difference={difference} kind={kind}
            notes={notes} onNotesChange={setNotes} />
        )}

        <CashFormError message={error?.message ?? null} uncertain={error?.uncertain} />
        <div className="pt-3 border-t border-border flex justify-between gap-2.5">
          {step === 0 ? (
            <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
          ) : (
            <Button type="button" variant="secondary" size="sm" onClick={() => { setError(null); setStep((s) => s - 1); }} disabled={isSubmitting} className="gap-1.5">
              <ArrowLeft size={14} /><span>Atrás</span>
            </Button>
          )}
          <Button type="submit" variant="primary" size="sm" disabled={isSubmitting} className="gap-1.5">
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            <span>{step === 0 ? 'Empezar a contar' : step === 1 ? 'Ver diferencia' : 'Cerrar caja'}</span>
            {step < 2 && <ArrowRight size={14} />}
          </Button>
        </div>
      </form>
    </CashModalShell>
  );
};
