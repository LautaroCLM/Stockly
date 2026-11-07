import React, { useState } from 'react';
import { AlertTriangle, Ban, Loader2, Pencil, Plus } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { formatDateShort } from '@/lib/formatters';
import { localDateInputValue } from '@/lib/localDate';
import { PERIOD_LABELS, periodRange } from '@/features/finanzas/financeMath';
import type { PeriodKey } from '@/features/finanzas/types';
import { useAttendancePeriod } from '../hooks/useAttendancePeriod';
import { clockTime, formatDuration } from '../timeMath';
import type { AttendanceRecord, Employee } from '../types';
import { AttendanceEditModal } from './AttendanceEditModal';
import { ReasonModal } from './ReasonModal';

interface AttendanceTabProps {
  companyId: string;
  employees: Employee[];
}

const PERIODS = (Object.keys(PERIOD_LABELS) as PeriodKey[]).filter((k) => k !== 'today');

/** Resumen por empleado y detalle de entradas y salidas de un período, con corrección y anulación. */
export const AttendanceTab: React.FC<AttendanceTabProps> = ({ companyId, employees }) => {
  const [period, setPeriod] = useState<PeriodKey>('7d');
  const { from, to } = periodRange(period, localDateInputValue());
  const att = useAttendancePeriod(companyId, true, from, to);
  const [editing, setEditing] = useState<AttendanceRecord | null | undefined>(undefined);
  const [voiding, setVoiding] = useState<AttendanceRecord | null>(null);
  const nameOf = (id: string) => employees.find((e) => e.id === id)?.fullName ?? 'Empleado';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <select value={period} onChange={(e) => setPeriod(e.target.value as PeriodKey)} aria-label="Período"
          className="h-9 px-3 text-xs bg-surface-2 border border-border rounded-lg text-text-primary focus:outline-none cursor-pointer">
          {PERIODS.map((k) => <option key={k} value={k}>{PERIOD_LABELS[k]} ({formatDateShort(periodRange(k, localDateInputValue()).from)})</option>)}
        </select>
        <Button variant="secondary" size="sm" onClick={() => setEditing(null)} className="gap-1.5 h-9"><Plus size={14} /><span>Cargar registro a mano</span></Button>
      </div>

      {att.error && (
        <div role="alert" className="p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs flex items-center gap-2">
          <AlertTriangle size={14} /><span className="flex-1">{att.error}</span>
          <Button variant="secondary" size="sm" onClick={() => void att.reload()}>Reintentar</Button>
        </div>
      )}

      {att.records === null ? (
        !att.error && <p className="py-12 text-center text-xs text-text-muted"><Loader2 size={16} className="inline animate-spin mr-2 text-primary" />Cargando asistencia...</p>
      ) : (
        <>
          <Card className="border-border bg-surface overflow-x-auto">
            <table className="w-full text-xs min-w-[560px]">
              <thead>
                <tr className="text-left text-text-muted border-b border-border">
                  <th className="p-3 font-semibold">Empleado</th>
                  <th className="p-3 font-semibold text-right">Días</th>
                  <th className="p-3 font-semibold text-right">Horas trabajadas</th>
                  <th className="p-3 font-semibold text-right">Horas previstas</th>
                  <th className="p-3 font-semibold text-right">Llegadas tarde</th>
                </tr>
              </thead>
              <tbody>
                {att.summary.map((s) => (
                  <tr key={s.employeeId} className="border-b border-border/60 last:border-0">
                    <td className="p-3 text-text-primary font-medium">{s.employeeName}{s.openCount > 0 && <span className="ml-2 text-[11px] text-amber-400">entrada sin salida</span>}</td>
                    <td className="p-3 text-right tabular-nums text-text-secondary">{s.daysWorked}</td>
                    <td className="p-3 text-right tabular-nums text-text-secondary">{formatDuration(s.workedMinutes)}</td>
                    <td className="p-3 text-right tabular-nums text-text-secondary">{s.scheduledMinutes === 0 ? '-' : formatDuration(s.scheduledMinutes)}</td>
                    <td className={`p-3 text-right tabular-nums ${s.lateCount > 0 ? 'text-amber-400' : 'text-text-secondary'}`}>{s.lateCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <h2 className="text-sm font-semibold text-text-primary pt-2">Entradas y salidas</h2>
          {att.records.length === 0 ? (
            <p className="py-8 text-center text-xs text-text-muted">No hay registros en este período.</p>
          ) : (
            <Card className="border-border bg-surface divide-y divide-border/60">
              {att.records.map((r) => (
                <div key={r.id} className={`p-3 flex items-center gap-3 text-xs ${r.isVoided ? 'opacity-50' : ''}`}>
                  <div className="flex-1">
                    <p className={`text-text-primary font-medium ${r.isVoided ? 'line-through' : ''}`}>{nameOf(r.employeeId)}</p>
                    <p className="text-[11px] text-text-muted">
                      {formatDateShort(r.checkIn)} · {clockTime(r.checkIn)} a {r.checkOut ? clockTime(r.checkOut) : 'sigue adentro'}
                      {r.checkOut && ` (${formatDuration((new Date(r.checkOut).getTime() - new Date(r.checkIn).getTime()) / 60000)})`}
                      {r.source === 'manual' && ` · Cargado a mano${r.reason ? `: ${r.reason}` : ''}`}
                      {r.isVoided && ` · Anulado: ${r.voidReason ?? ''}`}
                    </p>
                  </div>
                  {!r.isVoided && (
                    <div className="flex gap-1">
                      <button onClick={() => setEditing(r)} aria-label="Corregir registro" title="Corregir" className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2"><Pencil size={14} /></button>
                      <button onClick={() => setVoiding(r)} aria-label="Anular registro" title="Anular" className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-surface-2"><Ban size={14} /></button>
                    </div>
                  )}
                </div>
              ))}
            </Card>
          )}
        </>
      )}

      {editing !== undefined && <AttendanceEditModal employees={employees} record={editing} onClose={() => setEditing(undefined)} onSubmit={att.saveRecord} />}
      {voiding && (
        <ReasonModal title="Anular registro" subtitle={nameOf(voiding.employeeId)} confirmLabel="Anular registro"
          help="El registro deja de contar en las horas, pero queda en el historial con el motivo."
          onClose={() => setVoiding(null)} onSubmit={(reason) => att.voidRecord(voiding.id, reason)} />
      )}
    </div>
  );
};
