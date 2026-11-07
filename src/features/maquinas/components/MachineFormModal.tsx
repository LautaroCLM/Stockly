import React, { useState } from 'react';
import { Loader2, Tractor } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { CASH_FIELD_CLASS, CashFormError, CashModalShell } from '@/features/caja/components/CashModalShell';
import { EMPTY_MACHINE, validateMachine } from '../machineForm';
import {
  MACHINE_STATUSES, MACHINE_STATUS_LABELS, MACHINE_TYPES, MACHINE_TYPE_LABELS,
} from '../types';
import type { MachineActionResult, MachineInput, MachineStatus, MachineType } from '../types';

interface MachineFormModalProps {
  initial: MachineInput | null;
  onClose: () => void;
  onSubmit: (input: MachineInput) => Promise<MachineActionResult>;
}

const Field: React.FC<{ id: string; label: string; required?: boolean; children: React.ReactNode }> = ({ id, label, required, children }) => (
  <div className="space-y-1">
    <label htmlFor={id} className="font-semibold text-text-secondary">{label} {required && <span className="text-danger">*</span>}</label>
    {children}
  </div>
);

/** Alta y edición de una máquina. Las máquinas no se borran: se marcan como inactivas. */
export const MachineFormModal: React.FC<MachineFormModalProps> = ({ initial, onClose, onSubmit }) => {
  const [values, setValues] = useState<MachineInput>(initial ?? EMPTY_MACHINE);
  const [error, setError] = useState<{ message: string; uncertain?: boolean } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const set = <K extends keyof MachineInput>(key: K, value: MachineInput[K]) => setValues((v) => ({ ...v, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validateMachine(values);
    if (problem) return setError({ message: problem });
    setIsSubmitting(true);
    setError(null);
    const result = await onSubmit(values);
    setIsSubmitting(false);
    if (result.ok) onClose();
    else setError({ message: result.message, uncertain: result.uncertain });
  };

  const input = (id: string, key: 'name' | 'identifier' | 'brand' | 'model' | 'year' | 'notes', props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input id={id} value={values[key]} onChange={(e) => set(key, e.target.value)} disabled={isSubmitting} className={CASH_FIELD_CLASS} {...props} />
  );

  return (
    <CashModalShell title={initial ? 'Editar máquina' : 'Nueva máquina'} icon={<Tractor size={18} />} isBusy={isSubmitting} onClose={onClose}>
      <form onSubmit={handleSubmit} className="p-6 space-y-3 text-xs">
        <Field id="machine-name" label="Nombre" required>{input('machine-name', 'name', { maxLength: 100, placeholder: 'Ej. Retroexcavadora 01' })}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="machine-type" label="Tipo" required>
            <select id="machine-type" value={values.type} onChange={(e) => set('type', e.target.value as MachineType)} disabled={isSubmitting} className={CASH_FIELD_CLASS}>
              {MACHINE_TYPES.map((t) => <option key={t} value={t}>{MACHINE_TYPE_LABELS[t]}</option>)}
            </select>
          </Field>
          <Field id="machine-status" label="Estado" required>
            <select id="machine-status" value={values.status} onChange={(e) => set('status', e.target.value as MachineStatus)} disabled={isSubmitting} className={CASH_FIELD_CLASS}>
              {MACHINE_STATUSES.map((s) => <option key={s} value={s}>{MACHINE_STATUS_LABELS[s]}</option>)}
            </select>
          </Field>
        </div>
        <Field id="machine-identifier" label="Patente o N.º de serie">{input('machine-identifier', 'identifier', { maxLength: 50 })}</Field>
        <div className="grid grid-cols-3 gap-3">
          <Field id="machine-brand" label="Marca">{input('machine-brand', 'brand', { maxLength: 60 })}</Field>
          <Field id="machine-model" label="Modelo">{input('machine-model', 'model', { maxLength: 60 })}</Field>
          <Field id="machine-year" label="Año">{input('machine-year', 'year', { inputMode: 'numeric', maxLength: 4, placeholder: '2019' })}</Field>
        </div>
        <Field id="machine-notes" label="Notas">{input('machine-notes', 'notes', { maxLength: 500 })}</Field>
        {values.status === 'inactive' && (
          <p className="text-text-muted">Una máquina inactiva conserva su historial, pero no se le pueden cargar gastos nuevos.</p>
        )}
        <CashFormError message={error?.message ?? null} uncertain={error?.uncertain} />
        <div className="pt-3 border-t border-border flex justify-end gap-2.5">
          <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
          <Button type="submit" variant="primary" size="sm" disabled={isSubmitting} className="gap-1.5">
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            <span>{initial ? 'Guardar cambios' : 'Crear máquina'}</span>
          </Button>
        </div>
      </form>
    </CashModalShell>
  );
};
