import React, { useState } from 'react';
import { Loader2, LogIn, LogOut } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { CashFormError } from '@/features/caja/components/CashModalShell';
import { clockTime, dayScheduleText, formatDuration, isoWeekday, toMinutes } from '../timeMath';
import type { AttendanceRecord, Employee, HrActionResult, ScheduleBlock } from '../types';

const LATE_TOLERANCE_MINUTES = 10;

interface TodayTabProps {
  employees: Employee[];
  schedules: Record<string, ScheduleBlock[]>;
  today: AttendanceRecord[];
  onClockIn: (employeeId: string) => Promise<HrActionResult>;
  onClockOut: (employeeId: string) => Promise<HrActionResult>;
  /** Texto cuando no hay empleados activos. */
  emptyMessage?: string;
}

/** Fichaje del día: quién está adentro, quién salió y quién todavía no llegó. */
export const TodayTab: React.FC<TodayTabProps> = ({ employees, schedules, today, onClockIn, onClockOut, emptyMessage }) => {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; uncertain?: boolean } | null>(null);
  const weekday = isoWeekday(new Date());
  const active = employees.filter((e) => e.status === 'active');

  const act = async (employeeId: string, action: (id: string) => Promise<HrActionResult>) => {
    setBusyId(employeeId);
    setError(null);
    const result = await action(employeeId);
    setBusyId(null);
    if (!result.ok) setError({ message: result.message, uncertain: result.uncertain });
  };

  if (active.length === 0) {
    return <p className="py-12 text-center text-xs text-text-muted">{emptyMessage ?? 'No hay empleados activos. Cargalos en la pestaña "Personal".'}</p>;
  }

  return (
    <div className="space-y-3">
      <CashFormError message={error?.message ?? null} uncertain={error?.uncertain} />
      <Card className="border-border bg-surface divide-y divide-border/60">
        {active.map((employee) => {
          const mine = today.filter((r) => r.employeeId === employee.id).sort((a, b) => a.checkIn.localeCompare(b.checkIn));
          const open = mine.find((r) => r.checkOut === null);
          const last = mine[mine.length - 1];
          const scheduleText = dayScheduleText(schedules[employee.id] ?? [], weekday);
          const firstBlockStart = (schedules[employee.id] ?? []).filter((b) => b.weekday === weekday).map((b) => toMinutes(b.start) ?? 0).sort((a, b) => a - b)[0];
          const firstIn = mine[0] ? new Date(mine[0].checkIn) : null;
          const isLate = firstIn !== null && firstBlockStart !== undefined && firstIn.getHours() * 60 + firstIn.getMinutes() > firstBlockStart + LATE_TOLERANCE_MINUTES;
          const workedToday = mine.filter((r) => r.checkOut).reduce((s, r) => s + (new Date(r.checkOut as string).getTime() - new Date(r.checkIn).getTime()) / 60000, 0);
          const busy = busyId === employee.id;

          return (
            <div key={employee.id} className="p-3.5 flex flex-wrap items-center gap-3 text-xs">
              <div className="flex-1 min-w-[180px]">
                <p className="font-semibold text-text-primary">{employee.fullName}</p>
                <p className="text-[11px] text-text-muted">
                  {employee.jobTitle && `${employee.jobTitle} · `}Hoy: {scheduleText ?? 'no tiene horario'}
                </p>
              </div>
              <div className="flex items-center gap-2 min-w-[190px]">
                {open ? (
                  <span className="px-2 py-0.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 text-emerald-400">Adentro desde {clockTime(open.checkIn)}</span>
                ) : last ? (
                  <span className="px-2 py-0.5 rounded-full border border-border bg-surface-2 text-text-secondary">
                    Salió {last.checkOut && clockTime(last.checkOut)} · {formatDuration(workedToday)}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full border border-border bg-surface-2 text-text-muted">Sin fichar</span>
                )}
                {isLate && <span className="px-2 py-0.5 rounded-full border border-amber-500/25 bg-amber-500/10 text-amber-400">Llegó tarde</span>}
              </div>
              {open ? (
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => void act(employee.id, onClockOut)} className="gap-1.5 h-9">
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}<span>Marcar salida</span>
                </Button>
              ) : (
                <Button variant="primary" size="sm" disabled={busy} onClick={() => void act(employee.id, onClockIn)} className="gap-1.5 h-9">
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />}<span>Marcar entrada</span>
                </Button>
              )}
            </div>
          );
        })}
      </Card>
    </div>
  );
};
