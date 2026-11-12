import React, { useState } from 'react';
import { Loader2, Percent } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { CashFormError, CashModalShell } from '@/features/caja/components/CashModalShell';
import { formatNumber } from '@/lib/formatters';
import { ROUNDING_LABELS } from '../types';
import type { AppliedChange, PriceChangeParams, PriceResult } from '../types';

interface ConfirmApplyModalProps {
  params: PriceChangeParams;
  selected: number;
  scopeText: string;
  onClose: () => void;
  onConfirm: () => Promise<PriceResult<AppliedChange>>;
  onApplied: (updated: number) => void;
}

/** Última confirmación antes de modificar precios: resume qué se va a cambiar. */
export const ConfirmApplyModal: React.FC<ConfirmApplyModalProps> = ({ params, selected, scopeText, onClose, onConfirm, onApplied }) => {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const up = params.percent > 0;
  const amount = formatNumber(Math.abs(params.percent));

  const confirm = async () => {
    setIsSubmitting(true);
    setError(null);
    const result = await onConfirm();
    setIsSubmitting(false);
    if (result.ok) onApplied(result.value.updated);
    else setError(result.message);
  };

  return (
    <CashModalShell title="Confirmar cambio de precios" subtitle={scopeText} icon={<Percent size={18} />} isBusy={isSubmitting} onClose={onClose}>
      <div className="p-6 space-y-3 text-xs">
        <p className="text-sm text-text-primary leading-relaxed">
          Vas a <strong>{up ? 'subir' : 'bajar'} un {amount} %</strong> el precio de venta de <strong>{formatNumber(selected)}</strong>{' '}
          {selected === 1 ? 'producto' : 'productos'}.
        </p>
        <ul className="list-disc pl-5 space-y-1 text-text-secondary leading-relaxed">
          <li>Redondeo: {ROUNDING_LABELS[params.step].toLowerCase()}.</li>
          <li>Los costos no cambian. Las ventas y documentos ya emitidos conservan su precio.</li>
          <li>Si te equivocás, lo podés revertir desde el historial.</li>
        </ul>
        <CashFormError message={error} />
        <div className="flex justify-end gap-2.5 pt-1">
          <Button type="button" variant="secondary" size="sm" disabled={isSubmitting} onClick={onClose}>Volver</Button>
          <Button type="button" variant="primary" size="sm" disabled={isSubmitting} onClick={() => void confirm()} className="gap-1.5">
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            <span>{isSubmitting ? 'Aplicando...' : 'Aplicar cambio'}</span>
          </Button>
        </div>
      </div>
    </CashModalShell>
  );
};
