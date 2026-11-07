import React, { useState } from 'react';
import { AlertTriangle, Loader2, Plus, RotateCcw, ShieldAlert, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { Company } from '@/types';
import { useStaff } from './hooks/useStaff';
import type { Employee, EmployeeInput, ScheduleBlock } from './types';
import { AttendanceTab } from './components/AttendanceTab';
import { EmployeeFormModal, employeeToInput } from './components/EmployeeFormModal';
import { ScheduleModal } from './components/ScheduleModal';
import { StaffTab } from './components/StaffTab';
import { TodayTab } from './components/TodayTab';

type Tab = 'today' | 'staff' | 'attendance';
const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: 'Fichaje de hoy' },
  { id: 'staff', label: 'Personal y horarios' },
  { id: 'attendance', label: 'Asistencia' },
];

interface EmpleadosPageProps {
  company: Company;
  isMasterAdmin: boolean;
}

/** Empleados: personal, horarios semanales y registro de entrada y salida. */
export const EmpleadosPage: React.FC<EmpleadosPageProps> = ({ company, isMasterAdmin }) => {
  const staff = useStaff(company.id, isMasterAdmin);
  const [tab, setTab] = useState<Tab>('today');
  const [editing, setEditing] = useState<EmployeeInput | null | undefined>(undefined);
  const [scheduling, setScheduling] = useState<Employee | null>(null);

  if (!isMasterAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center gap-2 text-text-muted">
        <ShieldAlert size={32} className="text-warning" />
        <p className="text-sm font-semibold text-text-primary">Solo los administradores gestionan el personal</p>
      </div>
    );
  }

  const employees = staff.employees ?? [];
  const scheduleOf = (e: Employee): ScheduleBlock[] => staff.schedules[e.id] ?? [];

  return (
    <div className="space-y-5 max-w-6xl mx-auto pb-12">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-surface-2 border border-border flex items-center justify-center">
            <UserCheck size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary">Empleados</h1>
            <p className="text-xs text-text-muted">Personal de {company.name}: horarios y registro de entrada y salida. Las horas se muestran en la hora de este dispositivo.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => void staff.reload()} disabled={staff.isLoading} className="gap-1.5 h-9">
            <RotateCcw size={14} className={staff.isLoading ? 'animate-spin' : ''} /><span>Actualizar</span>
          </Button>
          <Button variant="primary" size="sm" onClick={() => { setTab('staff'); setEditing(null); }} className="gap-1.5 h-9">
            <Plus size={14} /><span>Nuevo empleado</span>
          </Button>
        </div>
      </div>

      <div role="tablist" className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              tab === t.id ? 'bg-primary/10 border-primary text-text-primary' : 'bg-surface-2 border-border text-text-secondary hover:text-text-primary'
            }`}>{t.label}</button>
        ))}
      </div>

      {staff.error && (
        <div role="alert" className="p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs flex items-center gap-2">
          <AlertTriangle size={14} /><span className="flex-1">{staff.error}</span>
          <Button variant="secondary" size="sm" onClick={() => void staff.reload()}>Reintentar</Button>
        </div>
      )}

      {staff.employees === null ? (
        !staff.error && <p className="py-12 text-center text-xs text-text-muted"><Loader2 size={16} className="inline animate-spin mr-2 text-primary" />Cargando personal...</p>
      ) : tab === 'today' ? (
        <TodayTab employees={employees} schedules={staff.schedules} today={staff.today} onClockIn={staff.clockIn} onClockOut={staff.clockOut} />
      ) : tab === 'staff' ? (
        employees.length === 0 ? (
          <p className="py-12 text-center text-xs text-text-muted">Todavía no cargaste empleados. Usá "Nuevo empleado" para agregar el primero.</p>
        ) : (
          <StaffTab employees={employees} schedules={staff.schedules} onEdit={(e) => setEditing(employeeToInput(e))} onSchedule={setScheduling} />
        )
      ) : (
        <AttendanceTab companyId={company.id} employees={employees} />
      )}

      {editing !== undefined && <EmployeeFormModal initial={editing} onClose={() => setEditing(undefined)} onSubmit={staff.saveEmployee} />}
      {scheduling && <ScheduleModal employee={scheduling} initial={scheduleOf(scheduling)} onClose={() => setScheduling(null)} onSubmit={staff.saveSchedule} />}
    </div>
  );
};
