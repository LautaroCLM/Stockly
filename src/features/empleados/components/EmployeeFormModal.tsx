import React, { useState } from 'react';
import { Loader2, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { CASH_FIELD_CLASS, CashFormError, CashModalShell } from '@/features/caja/components/CashModalShell';
import type { Employee, EmployeeInput, HrActionResult } from '../types';

export const EMPTY_EMPLOYEE: EmployeeInput = {
  employeeId: null, fullName: '', documentNumber: '', jobTitle: '', phone: '', hireDate: '', status: 'active', notes: '',
};

export const employeeToInput = (e: Employee): EmployeeInput => ({
  employeeId: e.id, fullName: e.fullName, documentNumber: e.documentNumber ?? '', jobTitle: e.jobTitle ?? '', phone: e.phone ?? '',
  hireDate: e.hireDate ?? '', status: e.status, notes: e.notes ?? '',
});

interface EmployeeFormModalProps {
  initial: EmployeeInput | null;
  onClose: () => void;
  onSubmit: (input: EmployeeInput) => Promise<HrActionResult>;
}

type TextKey = 'fullName' | 'documentNumber' | 'jobTitle' | 'phone' | 'notes';

/** Alta y edición de un empleado. No se borran: se marcan como inactivos. */
export const EmployeeFormModal: React.FC<EmployeeFormModalProps> = ({ initial, onClose, onSubmit }) => {
  const [values, setValues] = useState<EmployeeInput>(initial ?? EMPTY_EMPLOYEE);
  const [error, setError] = useState<{ message: string; uncertain?: boolean } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const text = (key: TextKey, label: string, required = false, maxLength = 120) => (
    <div className="space-y-1">
      <label htmlFor={`emp-${key}`} className="font-semibold text-text-secondary">{label} {required && <span className="text-danger">*</span>}</label>
      <input id={`emp-${key}`} value={values[key]} maxLength={maxLength} disabled={isSubmitting} className={CASH_FIELD_CLASS}
        onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))} />
    </div>
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!values.fullName.trim()) return setError({ message: 'Indicá el nombre del empleado.' });
    setIsSubmitting(true);
    setError(null);
    const result = await onSubmit(values);
    setIsSubmitting(false);
    if (result.ok) onClose();
    else setError({ message: result.message, uncertain: result.uncertain });
  };

  return (
    <CashModalShell title={initial ? 'Editar empleado' : 'Nuevo empleado'} icon={<UserCheck size={18} />} isBusy={isSubmitting} onClose={onClose}>
      <form onSubmit={handleSubmit} className="p-6 space-y-3 text-xs">
        {text('fullName', 'Nombre y apellido', true)}
        <div className="grid grid-cols-2 gap-3">
          {text('documentNumber', 'Documento (DNI)', false, 20)}
          {text('jobTitle', 'Puesto', false, 80)}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {text('phone', 'Teléfono', false, 40)}
          <div className="space-y-1">
            <label htmlFor="emp-hire" className="font-semibold text-text-secondary">Fecha de ingreso</label>
            <input id="emp-hire" type="date" value={values.hireDate} disabled={isSubmitting} className={CASH_FIELD_CLASS}
              onChange={(e) => setValues((v) => ({ ...v, hireDate: e.target.value }))} />
          </div>
        </div>
        {text('notes', 'Notas', false, 500)}
        <label className="flex items-center gap-2 text-text-secondary cursor-pointer">
          <input type="checkbox" checked={values.status === 'inactive'} disabled={isSubmitting}
            onChange={(e) => setValues((v) => ({ ...v, status: e.target.checked ? 'inactive' : 'active' }))} />
          Inactivo (ya no trabaja acá: conserva su historial, pero no puede fichar)
        </label>
        <CashFormError message={error?.message ?? null} uncertain={error?.uncertain} />
        <div className="pt-3 border-t border-border flex justify-end gap-2.5">
          <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
          <Button type="submit" variant="primary" size="sm" disabled={isSubmitting} className="gap-1.5">
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            <span>{initial ? 'Guardar cambios' : 'Crear empleado'}</span>
          </Button>
        </div>
      </form>
    </CashModalShell>
  );
};
