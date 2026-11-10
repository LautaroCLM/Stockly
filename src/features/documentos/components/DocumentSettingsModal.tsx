import React, { useState } from 'react';
import { Loader2, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { CASH_FIELD_CLASS, CashFormError, CashModalShell } from '@/features/caja/components/CashModalShell';
import { TAX_CONDITIONS, TAX_CONDITION_LABELS } from '../types';
import type { DocumentActionResult, DocumentSettings, TaxCondition } from '../types';

interface DocumentSettingsModalProps {
  initial: DocumentSettings;
  onClose: () => void;
  onSave: (settings: DocumentSettings) => Promise<DocumentActionResult>;
}

const Field: React.FC<{ id: string; label: string; hint?: string; children: React.ReactNode }> = ({ id, label, hint, children }) => (
  <div className="space-y-1">
    <label htmlFor={id} className="block font-semibold text-text-secondary">{label}</label>
    {children}
    {hint && <p className="text-text-muted">{hint}</p>}
  </div>
);

/** Datos del emisor que salen en el encabezado de todos los documentos (solo el administrador). */
export const DocumentSettingsModal: React.FC<DocumentSettingsModalProps> = ({ initial, onClose, onSave }) => {
  const [values, setValues] = useState<DocumentSettings>(initial);
  const [pointOfSale, setPointOfSale] = useState(String(initial.pointOfSale));
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const set = <K extends keyof DocumentSettings>(key: K, value: DocumentSettings[K]) => setValues((v) => ({ ...v, [key]: value }));
  const text = (id: string, key: 'address' | 'phone' | 'email' | 'footerNote', max: number) => (
    <input id={id} value={values[key]} maxLength={max} disabled={isSubmitting} className={CASH_FIELD_CLASS} onChange={(e) => set(key, e.target.value)} />
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const pos = Number(pointOfSale);
    if (!Number.isInteger(pos) || pos < 1 || pos > 9999) return setError('El punto de venta debe ser un número entre 1 y 9999.');
    setIsSubmitting(true);
    setError(null);
    const result = await onSave({ ...values, pointOfSale: pos });
    setIsSubmitting(false);
    if (result.ok) onClose();
    else setError(result.message);
  };

  return (
    <CashModalShell title="Datos del emisor" subtitle="Salen en el encabezado de cada documento" icon={<Settings2 size={18} />} isBusy={isSubmitting} onClose={onClose}>
      <form onSubmit={submit} className="p-6 space-y-3 text-xs">
        <Field id="set-address" label="Domicilio comercial">{text('set-address', 'address', 200)}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="set-phone" label="Teléfono">{text('set-phone', 'phone', 50)}</Field>
          <Field id="set-email" label="Email">{text('set-email', 'email', 120)}</Field>
        </div>
        <Field id="set-tax" label="Condición frente al IVA">
          <select id="set-tax" value={values.taxCondition} disabled={isSubmitting} className={CASH_FIELD_CLASS}
            onChange={(e) => set('taxCondition', e.target.value as TaxCondition)}>
            {TAX_CONDITIONS.map((c) => <option key={c} value={c}>{TAX_CONDITION_LABELS[c]}</option>)}
          </select>
        </Field>
        <Field id="set-pos" label="Punto de venta" hint="Es el primer bloque del número (0001-00000001). Cada punto de venta numera desde 1.">
          <input id="set-pos" inputMode="numeric" value={pointOfSale} maxLength={4} disabled={isSubmitting} className={`${CASH_FIELD_CLASS} !w-28`}
            onChange={(e) => setPointOfSale(e.target.value)} />
        </Field>
        <Field id="set-footer" label="Pie de los documentos">{text('set-footer', 'footerNote', 300)}</Field>
        <p className="p-2.5 rounded-lg bg-surface-2 border border-border text-text-muted leading-relaxed">
          Estos documentos son comprobantes internos, sin validez fiscal. No reemplazan a una factura de ARCA.
        </p>
        <CashFormError message={error} />
        <div className="flex justify-end gap-2.5 pt-1">
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
