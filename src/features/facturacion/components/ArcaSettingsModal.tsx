import React, { useState } from 'react';
import { Loader2, ReceiptText } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { CASH_FIELD_CLASS, CashFormError, CashModalShell } from '@/features/caja/components/CashModalShell';
import { parseArcaForm, todayIso, toArcaFormValues } from '../arcaSettingsForm';
import type { ArcaActionResult, ArcaSettings, ArcaSettingsFormValues } from '../types';

interface ArcaSettingsModalProps {
  initial: ArcaSettings;
  onClose: () => void;
  onSave: (settings: ArcaSettings) => Promise<ArcaActionResult>;
}

const Field: React.FC<{ id: string; label: string; hint: string; children: React.ReactNode }> = ({ id, label, hint, children }) => (
  <div className="space-y-1">
    <label htmlFor={id} className="block font-semibold text-text-secondary">{label}</label>
    {children}
    <p className="text-text-muted">{hint}</p>
  </div>
);

/** Edición de los datos de ARCA (solo el Master Admin). */
export const ArcaSettingsModal: React.FC<ArcaSettingsModalProps> = ({ initial, onClose, onSave }) => {
  const [values, setValues] = useState<ArcaSettingsFormValues>(() => toArcaFormValues(initial));
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const set = (key: keyof ArcaSettingsFormValues, value: string) => setValues((v) => ({ ...v, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseArcaForm(values);
    if (!parsed.ok) return setError(parsed.message);
    setIsSubmitting(true);
    setError(null);
    const result = await onSave(parsed.value);
    setIsSubmitting(false);
    if (result.ok) onClose();
    else setError(result.message);
  };

  return (
    <CashModalShell title="Factura electrónica (ARCA)" subtitle="Datos que pide ARCA y que salen impresos en la factura"
      icon={<ReceiptText size={18} />} isBusy={isSubmitting} onClose={onClose}>
      <form onSubmit={submit} className="p-6 space-y-3 text-xs">
        <Field id="arca-pos" label="Punto de venta electrónico"
          hint='El que diste de alta en ARCA como "Web Services". No es el mismo de los comprobantes internos.'>
          <input id="arca-pos" inputMode="numeric" value={values.pointOfSale} maxLength={5} disabled={isSubmitting}
            placeholder="Ej. 3" className={`${CASH_FIELD_CLASS} !w-28`} onChange={(e) => set('pointOfSale', e.target.value)} />
        </Field>
        <Field id="arca-start" label="Inicio de actividades" hint="Figura en tu constancia de inscripción de ARCA.">
          <input id="arca-start" type="date" value={values.activityStartDate} max={todayIso()} disabled={isSubmitting}
            className={`${CASH_FIELD_CLASS} !w-44`} onChange={(e) => set('activityStartDate', e.target.value)} />
        </Field>
        <Field id="arca-iibb" label="Ingresos brutos" hint="Número de inscripción o la palabra Exento.">
          <input id="arca-iibb" value={values.grossIncomeNumber} maxLength={30} disabled={isSubmitting}
            placeholder="Ej. 901-123456-7" className={CASH_FIELD_CLASS} onChange={(e) => set('grossIncomeNumber', e.target.value)} />
        </Field>
        <CashFormError message={error} />
        <div className="modal-sticky-footer flex justify-end gap-2.5">
          <Button type="button" variant="secondary" size="sm" disabled={isSubmitting} onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" size="sm" disabled={isSubmitting} className="gap-1.5">
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            <span>Guardar</span>
          </Button>
        </div>
      </form>
    </CashModalShell>
  );
};
