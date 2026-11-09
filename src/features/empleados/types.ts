export type EmployeeStatus = 'active' | 'inactive';

export interface Employee {
  id: string;
  fullName: string;
  documentNumber: string | null;
  jobTitle: string | null;
  phone: string | null;
  hireDate: string | null;
  status: EmployeeStatus;
  notes: string | null;
}

export interface EmployeeInput {
  employeeId: string | null;
  fullName: string;
  documentNumber: string;
  jobTitle: string;
  phone: string;
  hireDate: string;
  status: EmployeeStatus;
  notes: string;
}

/** Bloque horario de un día de la semana (1 = lunes ... 7 = domingo), horas "HH:MM". */
export interface ScheduleBlock {
  weekday: number;
  start: string;
  end: string;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  checkIn: string;
  checkOut: string | null;
  source: 'clock' | 'manual';
  reason: string | null;
  isVoided: boolean;
  voidReason: string | null;
}

export interface AttendanceSummary {
  employeeId: string;
  employeeName: string;
  daysWorked: number;
  workedMinutes: number;
  scheduledMinutes: number;
  lateCount: number;
  openCount: number;
}

/** Lista para fichar: activos, horario de hoy y registros de hoy. */
export interface ClockRoster {
  employees: Employee[];
  schedules: Record<string, ScheduleBlock[]>;
  today: AttendanceRecord[];
}

export type HrActionResult = { ok: true } | { ok: false; message: string; uncertain?: boolean };
