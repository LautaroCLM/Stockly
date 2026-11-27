import React, { useState } from 'react';
import { Loader2, Tags } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { CASH_FIELD_CLASS, CashFormError, CashModalShell } from '@/features/caja/components/CashModalShell';
import { EMPTY_LIST_FORM, describeAdjustment, parseListForm, toListForm } from '../priceListForm';
import { ROUNDING_LABELS, ROUNDING_STEPS, type ListActionResult, type PriceList, type PriceListFormValues, type RoundingStep } from '../types';

interface Props {
  list: PriceList | null;
  onClose: () => void;
  onSave: (id: string | null, values: { name: string; percent: number; roundingStep: RoundingStep; isActive: boolean }) => Promise<ListActionResult<string>>;
}

/** Crear o editar una lista: nombre, porcentaje sobre el precio de venta, redondeo y si está activa. */
export const PriceListFormModal: React.FC<Props> = ({ list, onClose, onSave }) => {
  const [values, setValues] = useState<PriceListFormValues>(() => (list ? toListForm(list) : EMPTY_LIST_FORM));
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const set = <K extends keyof PriceListFormValues>(key: K, value: PriceListFormValues[K]) => setValues((v) => ({ ...v, [key]: value }));
  const parsed = parseListForm(values);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsed.ok) return setError(parsed.message);
    setIsSubmitting(true);
    setError(null);
    const result = await onSave(list?.id ?? null, parsed.value);
    setIsSubmitting(false);
    if (result.ok) onClose();
    else setError(result.message);
  };

  return (
    <CashModalShell title={list ? 'Editar lista de precios' : 'Nueva lista de precios'} subtitle="Porcentaje sobre el precio de venta de cada producto"
      icon={<Tags size={18} />} isBusy={isSubmitting} onClose={onClose}>
      <form onSubmit={submit} className="p-6 space-y-3 text-xs">
        <div className="space-y-1">
          <label htmlFor="pl-name" className="block font-semibold text-text-secondary">Nombre</label>
          <input id="pl-name" value={values.name} maxLength={60} disabled={isSubmitting} placeholder="Ej. Mayorista"
            className={CASH_FIELD_CLASS} onChange={(e) => set('name', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor="pl-percent" className="block font-semibold text-text-secondary">Porcentaje (%)</label>
            <input id="pl-percent" inputMode="decimal" value={values.percentText} disabled={isSubmitting} placeholder="Ej. -15"
              className={CASH_FIELD_CLASS} onChange={(e) => set('percentText', e.target.value)} />
          </div>
          <div className="space-y-1">
            <label htmlFor="pl-round" className="block font-semibold text-text-secondary">Redondeo</label>
            <select id="pl-round" value={values.roundingStep} disabled={isSubmitting} className={CASH_FIELD_CLASS}
              onChange={(e) => set('roundingStep', Number(e.target.value) as RoundingStep)}>
              {ROUNDING_STEPS.map((s) => <option key={s} value={s}>{ROUNDING_LABELS[s]}</option>)}
            </select>
          </div>
        </div>
        <p className="text-text-muted">
          {parsed.ok ? `${describeAdjustment(parsed.value.percent)}. Negativo = más barato (ej. -15 para mayoristas).` : 'Negativo = más barato (ej. -15 para mayoristas).'}
        </p>
        <label className="flex items-center gap-2 text-text-secondary cursor-pointer">
          <input type="checkbox" checked={values.isActive} disabled={isSubmitting} onChange={(e) => set('isActive', e.target.checked)} />
          Activa (si la desactivás, sus clientes pagan el precio normal)
        </label>
        <CashFormError message={error} />
        <div className="modal-sticky-footer flex justify-end gap-2.5">
          <Button type="button" variant="secondary" size="sm" disabled={isSubmitting} onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" size="sm" disabled={isSubmitting} className="gap-1.5">
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}<span>Guardar</span>
          </Button>
        </div>
      </form>
    </CashModalShell>
  );
};
