import React, { useState } from 'react';
import { CalendarClock, Copy, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { CASH_FIELD_CLASS, CashFormError, CashModalShell } from '@/features/caja/components/CashModalShell';
import { WEEKDAYS, formatDuration, validateSchedule, weeklyMinutes } from '../timeMath';
import type { Employee, HrActionResult, ScheduleBlock } from '../types';

interface ScheduleModalProps {
  employee: Employee;
  initial: ScheduleBlock[];
  onClose: () => void;
  onSubmit: (employeeId: string, blocks: ScheduleBlock[]) => Promise<HrActionResult>;
}

const TIME_CLASS = `${CASH_FIELD_CLASS} !w-28`;

/** Horario semanal: uno o más bloques por día (por ejemplo, turno cortado 08-12 y 14-18). */
export const ScheduleModal: React.FC<ScheduleModalProps> = ({ employee, initial, onClose, onSubmit }) => {
  const [blocks, setBlocks] = useState<ScheduleBlock[]>(initial);
  const [error, setError] = useState<{ message: string; uncertain?: boolean } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const update = (index: number, changes: Partial<ScheduleBlock>) =>
    setBlocks((prev) => prev.map((b, i) => (i === index ? { ...b, ...changes } : b)));
  const add = (weekday: number) => setBlocks((prev) => [...prev, { weekday, start: '08:00', end: '17:00' }]);
  // Copia los bloques del lunes a martes-viernes
  const copyMondayToWeek = () =>
    setBlocks((prev) => {
      const monday = prev.filter((b) => b.weekday === 1);
      return [...prev.filter((b) => b.weekday < 2 || b.weekday > 5), ...[2, 3, 4, 5].flatMap((d) => monday.map((b) => ({ ...b, weekday: d })))];
    });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validateSchedule(blocks);
    if (problem) return setError({ message: problem });
    setIsSubmitting(true);
    setError(null);
    const result = await onSubmit(employee.id, blocks);
    setIsSubmitting(false);
    if (result.ok) onClose();
    else setError({ message: result.message, uncertain: result.uncertain });
  };

  return (
    <CashModalShell title="Horario semanal" subtitle={employee.fullName} icon={<CalendarClock size={18} />} isBusy={isSubmitting} onClose={onClose}>
      <form onSubmit={handleSubmit} className="p-6 space-y-3 text-xs max-h-[75vh] overflow-y-auto">
        {WEEKDAYS.map((day) => {
          const dayBlocks = blocks.map((b, index) => ({ b, index })).filter(({ b }) => b.weekday === day.id);
          return (
            <div key={day.id} className="flex items-start gap-3 py-1.5 border-b border-border/50 last:border-0">
              <span className="w-20 pt-2 font-semibold text-text-secondary">{day.label}</span>
              <div className="flex-1 space-y-1.5">
                {dayBlocks.length === 0 && <p className="pt-2 text-text-muted">No trabaja</p>}
                {dayBlocks.map(({ b, index }) => (
                  <div key={index} className="flex items-center gap-2">
                    <input type="time" aria-label={`${day.label}: entrada`} value={b.start} disabled={isSubmitting} className={TIME_CLASS}
                      onChange={(e) => update(index, { start: e.target.value })} />
                    <span className="text-text-muted">a</span>
                    <input type="time" aria-label={`${day.label}: salida`} value={b.end} disabled={isSubmitting} className={TIME_CLASS}
                      onChange={(e) => update(index, { end: e.target.value })} />
                    <button type="button" aria-label="Quitar bloque" disabled={isSubmitting} onClick={() => setBlocks((prev) => prev.filter((_, i) => i !== index))}
                      className="p-1.5 text-text-muted hover:text-danger rounded"><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
              <button type="button" aria-label={`Agregar bloque el ${day.label.toLowerCase()}`} disabled={isSubmitting} onClick={() => add(day.id)}
                className="p-1.5 text-primary hover:bg-surface-2 rounded"><Plus size={14} /></button>
            </div>
          );
        })}
        <div className="flex items-center justify-between pt-1">
          <button type="button" onClick={copyMondayToWeek} disabled={isSubmitting} className="flex items-center gap-1 text-primary hover:underline disabled:opacity-50">
            <Copy size={12} /> Copiar el lunes a martes-viernes
          </button>
          <span className="text-text-muted">Semana: <strong className="text-text-primary">{formatDuration(weeklyMinutes(blocks))}</strong></span>
        </div>
        <CashFormError message={error?.message ?? null} uncertain={error?.uncertain} />
        <div className="pt-3 border-t border-border flex justify-end gap-2.5">
          <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
          <Button type="submit" variant="primary" size="sm" disabled={isSubmitting} className="gap-1.5">
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            <span>Guardar horario</span>
          </Button>
        </div>
      </form>
    </CashModalShell>
  );
};
