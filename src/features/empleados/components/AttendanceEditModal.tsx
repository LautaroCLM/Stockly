import React, { useState } from 'react';
import { Clock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { CASH_FIELD_CLASS, CashFormError, CashModalShell } from '@/features/caja/components/CashModalShell';
import { fromLocalInput, toLocalInput } from '../timeMath';
import type { AttendanceRecord, Employee, HrActionResult } from '../types';

interface AttendanceEditModalProps {
  employees: Employee[];
  /** Registro a corregir; null para cargar uno nuevo a mano. */
  record: AttendanceRecord | null;
  onClose: () => void;
  onSubmit: (employeeId: string, recordId: string | null, inIso: string, outIso: string | null, reason: string) => Promise<HrActionResult>;
}

/** Carga manual o corrección de una entrada y salida, con motivo obligatorio. */
export const AttendanceEditModal: React.FC<AttendanceEditModalProps> = ({ employees, record, onClose, onSubmit }) => {
  const [employeeId, setEmployeeId] = useState(record?.employeeId ?? employees.find((e) => e.status === 'active')?.id ?? '');
  const [checkIn, setCheckIn] = useState(record ? toLocalInput(record.checkIn) : '');
  const [checkOut, setCheckOut] = useState(record?.checkOut ? toLocalInput(record.checkOut) : '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<{ message: string; uncertain?: boolean } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const inIso = fromLocalInput(checkIn);
    const outIso = fromLocalInput(checkOut);
    if (!employeeId) return setError({ message: 'Elegí el empleado.' });
    if (!inIso) return setError({ message: 'Indicá la fecha y hora de entrada.' });
    if (outIso && outIso <= inIso) return setError({ message: 'La salida tiene que ser posterior a la entrada.' });
    if (!reason.trim()) return setError({ message: 'Indicá el motivo de la carga o corrección.' });
    setIsSubmitting(true);
    setError(null);
    const result = await onSubmit(employeeId, record?.id ?? null, inIso, outIso, reason.trim());
    setIsSubmitting(false);
    if (result.ok) onClose();
    else setError({ message: result.message, uncertain: result.uncertain });
  };

  const field = (id: string, label: string, control: React.ReactNode) => (
    <div className="space-y-1">
      <label htmlFor={id} className="font-semibold text-text-secondary">{label}</label>
      {control}
    </div>
  );

  return (
    <CashModalShell title={record ? 'Corregir registro' : 'Cargar registro a mano'} icon={<Clock size={18} />} isBusy={isSubmitting} onClose={onClose}>
      <form onSubmit={handleSubmit} className="p-6 space-y-3 text-xs">
        {field('att-employee', 'Empleado',
          <select id="att-employee" value={employeeId} disabled={isSubmitting || record !== null} className={CASH_FIELD_CLASS} onChange={(e) => setEmployeeId(e.target.value)}>
            {employees.filter((e) => e.status === 'active' || e.id === record?.employeeId).map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
          </select>)}
        <div className="grid grid-cols-2 gap-3">
          {field('att-in', 'Entrada', <input id="att-in" type="datetime-local" value={checkIn} disabled={isSubmitting} className={CASH_FIELD_CLASS} onChange={(e) => setCheckIn(e.target.value)} />)}
          {field('att-out', 'Salida (vacía si sigue adentro)', <input id="att-out" type="datetime-local" value={checkOut} disabled={isSubmitting} className={CASH_FIELD_CLASS} onChange={(e) => setCheckOut(e.target.value)} />)}
        </div>
        {field('att-reason', 'Motivo', <input id="att-reason" maxLength={500} placeholder="Ej. Se olvidó de fichar" value={reason} disabled={isSubmitting} className={CASH_FIELD_CLASS} onChange={(e) => setReason(e.target.value)} />)}
        <CashFormError message={error?.message ?? null} uncertain={error?.uncertain} />
        <div className="pt-3 border-t border-border flex justify-end gap-2.5">
          <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
          <Button type="submit" variant="primary" size="sm" disabled={isSubmitting} className="gap-1.5">
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            <span>{record ? 'Guardar corrección' : 'Cargar registro'}</span>
          </Button>
        </div>
      </form>
    </CashModalShell>
  );
};
