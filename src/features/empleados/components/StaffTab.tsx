import React from 'react';
import { CalendarClock, Pencil } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { formatDateShort } from '@/lib/formatters';
import { formatDuration, weeklyMinutes } from '../timeMath';
import type { Employee, ScheduleBlock } from '../types';

interface StaffTabProps {
  employees: Employee[];
  schedules: Record<string, ScheduleBlock[]>;
  onEdit: (employee: Employee) => void;
  onSchedule: (employee: Employee) => void;
  /** Sin permiso para operar, no se muestran los botones de horario y edición. */
  canEdit?: boolean;
}

/** Personal de la empresa con su horario semanal. */
export const StaffTab: React.FC<StaffTabProps> = ({ employees, schedules, onEdit, onSchedule, canEdit = true }) => (
  <Card className="border-border bg-surface overflow-x-auto">
    <table className="w-full text-xs min-w-[620px]">
      <thead>
        <tr className="text-left text-text-muted border-b border-border">
          <th className="p-3 font-semibold">Empleado</th>
          <th className="p-3 font-semibold">Puesto</th>
          <th className="p-3 font-semibold">Ingreso</th>
          <th className="p-3 font-semibold">Horario semanal</th>
          <th className="p-3"><span className="sr-only">Acciones</span></th>
        </tr>
      </thead>
      <tbody>
        {employees.map((e) => {
          const minutes = weeklyMinutes(schedules[e.id] ?? []);
          return (
            <tr key={e.id} className={`border-b border-border/60 last:border-0 ${e.status === 'inactive' ? 'opacity-60' : ''}`}>
              <td className="p-3">
                <p className="text-text-primary font-medium">{e.fullName}{e.status === 'inactive' && <span className="ml-2 text-[11px] text-text-muted">(inactivo)</span>}</p>
                <p className="text-[11px] text-text-muted">{[e.documentNumber && `DNI ${e.documentNumber}`, e.phone].filter(Boolean).join(' · ')}</p>
              </td>
              <td className="p-3 text-text-secondary">{e.jobTitle ?? '-'}</td>
              <td className="p-3 text-text-secondary">{e.hireDate ? formatDateShort(e.hireDate) : '-'}</td>
              <td className="p-3 text-text-secondary">{minutes === 0 ? 'Sin horario' : formatDuration(minutes)}</td>
              <td className="p-3">
                <div className="flex justify-end gap-1">
                  {canEdit && <>
                  <button onClick={() => onSchedule(e)} aria-label={`Horario de ${e.fullName}`} title="Horario"
                    className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2"><CalendarClock size={14} /></button>
                  <button onClick={() => onEdit(e)} aria-label={`Editar ${e.fullName}`} title="Editar"
                    className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2"><Pencil size={14} /></button>
                  </>}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </Card>
);
