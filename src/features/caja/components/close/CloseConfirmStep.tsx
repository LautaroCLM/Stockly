import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';
import type { DifferenceKind } from '../../cashMath';
import { CASH_FIELD_CLASS } from '../CashModalShell';

interface CloseConfirmStepProps {
  expected: number;
  counted: number;
  difference: number;
  kind: DifferenceKind;
  notes: string;
  onNotesChange: (text: string) => void;
}

const KIND = {
  exact: { title: 'La caja cuadra', className: 'border-success/40 bg-success/10 text-success', Icon: CheckCircle2 },
  surplus: { title: 'Hay sobrante', className: 'border-warning/40 bg-warning/10 text-warning', Icon: AlertTriangle },
  shortage: { title: 'Hay faltante', className: 'border-danger/40 bg-danger/10 text-danger', Icon: AlertTriangle },
} as const;

/** Paso 3: esperado contra contado, la diferencia bien visible y el motivo si no cuadra. */
export const CloseConfirmStep: React.FC<CloseConfirmStepProps> = ({ expected, counted, difference, kind, notes, onNotesChange }) => {
  const { title, className, Icon } = KIND[kind];
  const needsNotes = kind !== 'exact';
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-border bg-surface-2/40 p-3">
          <p className="text-[11px] text-text-muted">Esperado</p>
          <p className="text-sm font-bold text-text-primary tabular-nums">{formatCurrency(expected)}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface-2/40 p-3">
          <p className="text-[11px] text-text-muted">Contado</p>
          <p className="text-sm font-bold text-text-primary tabular-nums">{formatCurrency(counted)}</p>
        </div>
      </div>
      <div className={`rounded-xl border p-3.5 flex items-center justify-between gap-3 ${className}`} aria-live="polite">
        <span className="flex items-center gap-2 font-semibold"><Icon size={16} />{title}</span>
        <span className="text-base font-bold tabular-nums">{difference > 0 ? '+' : ''}{formatCurrency(difference)}</span>
      </div>
      <label className="block space-y-1">
        <span className="font-semibold text-text-secondary">
          Observación {needsNotes ? <span className="text-danger">*</span> : '(opcional)'}
        </span>
        <textarea id="closing-notes" rows={2} maxLength={500} value={notes} autoFocus={needsNotes}
          placeholder={needsNotes ? 'Ej. Faltante por error de vuelto' : ''}
          onChange={(e) => onNotesChange(e.target.value)} className={`${CASH_FIELD_CLASS} resize-none`} />
      </label>
      <p className="text-text-muted">Una caja cerrada no se puede modificar.</p>
    </div>
  );
};
