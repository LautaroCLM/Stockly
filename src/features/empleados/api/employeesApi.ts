import { supabase } from '@/lib/supabase';
import { isNetworkOrUncertainError, toUserMessage } from '@/lib/errorMessages';
import type {
  AttendanceRecord, AttendanceSummary, Employee, EmployeeInput, EmployeeStatus, HrActionResult, ScheduleBlock,
} from '../types';

const UNCERTAIN_MESSAGE =
  'No pudimos confirmar la operación por un problema de conexión. Revisá la pantalla antes de reintentar para no duplicarla.';

const cleanMessage = (message: string) => message.replace(/^(P0001|error):\s*/i, '').trim();
const num = (value: unknown): number => Number(value ?? 0);
const hhmm = (time: string) => time.slice(0, 5);

export async function fetchEmployees(companyId: string): Promise<Employee[]> {
  const { data, error } = await supabase
    .from('employees')
    .select('id, full_name, document_number, job_title, phone, hire_date, status, notes')
    .eq('company_id', companyId)
    .order('full_name');
  if (error) throw new Error('No se pudo cargar el personal.');
  return (data ?? []).map((e) => ({
    id: e.id, fullName: e.full_name, documentNumber: e.document_number, jobTitle: e.job_title, phone: e.phone,
    hireDate: e.hire_date, status: (e.status === 'inactive' ? 'inactive' : 'active') as EmployeeStatus, notes: e.notes,
  }));
}

/** Horarios de todos los empleados, agrupados por empleado. */
export async function fetchSchedules(companyId: string): Promise<Record<string, ScheduleBlock[]>> {
  const { data, error } = await supabase
    .from('employee_schedules')
    .select('employee_id, weekday, start_time, end_time')
    .eq('company_id', companyId);
  if (error) throw new Error('No se pudieron cargar los horarios.');
  const byEmployee: Record<string, ScheduleBlock[]> = {};
  for (const r of data ?? []) {
    (byEmployee[r.employee_id] ??= []).push({ weekday: r.weekday, start: hhmm(r.start_time), end: hhmm(r.end_time) });
  }
  return byEmployee;
}

const toRecord = (r: {
  id: string; employee_id: string; check_in: string; check_out: string | null; source: string;
  reason: string | null; status: string; void_reason: string | null;
}): AttendanceRecord => ({
  id: r.id, employeeId: r.employee_id, checkIn: r.check_in, checkOut: r.check_out,
  source: r.source === 'manual' ? 'manual' : 'clock', reason: r.reason, isVoided: r.status === 'voided', voidReason: r.void_reason,
});

const RECORD_COLUMNS = 'id, employee_id, check_in, check_out, source, reason, status, void_reason';

/** Registros de asistencia desde un instante (más los que siguen abiertos, aunque sean anteriores). */
export async function fetchAttendanceSince(companyId: string, sinceIso: string): Promise<AttendanceRecord[]> {
  const { data, error } = await supabase
    .from('attendance_records')
    .select(RECORD_COLUMNS)
    .eq('company_id', companyId)
    .eq('status', 'active')
    .or(`check_in.gte.${sinceIso},check_out.is.null`)
    .order('check_in', { ascending: false })
    .limit(500);
  if (error) throw new Error('No se pudo cargar la asistencia.');
  return (data ?? []).map(toRecord);
}

/** Registros entre dos instantes (incluye los anulados, marcados como tales). */
export async function fetchAttendanceBetween(companyId: string, fromIso: string, toIso: string): Promise<AttendanceRecord[]> {
  const { data, error } = await supabase
    .from('attendance_records')
    .select(RECORD_COLUMNS)
    .eq('company_id', companyId)
    .gte('check_in', fromIso)
    .lt('check_in', toIso)
    .order('check_in', { ascending: false })
    .limit(1000);
  if (error) throw new Error('No se pudo cargar la asistencia.');
  return (data ?? []).map(toRecord);
}

export async function fetchAttendanceReport(companyId: string, from: string, to: string): Promise<AttendanceSummary[]> {
  const { data, error } = await supabase.rpc('attendance_report', { p_company_id: companyId, p_from: from, p_to: to });
  if (error) throw new Error(toUserMessage(error, 'No se pudo generar el informe de asistencia.'));
  return (data ?? []).map((r) => ({
    employeeId: r.employee_id, employeeName: r.employee_name, daysWorked: num(r.days_worked),
    workedMinutes: num(r.worked_minutes), scheduledMinutes: num(r.scheduled_minutes),
    lateCount: num(r.late_count), openCount: num(r.open_count),
  }));
}

async function run(call: () => PromiseLike<{ error: { message: string } | null }>): Promise<HrActionResult> {
  try {
    const { error } = await call();
    if (!error) return { ok: true };
    if (isNetworkOrUncertainError(error.message)) return { ok: false, message: UNCERTAIN_MESSAGE, uncertain: true };
    return { ok: false, message: cleanMessage(error.message) };
  } catch (err) {
    if (isNetworkOrUncertainError(err instanceof Error ? err.message : '')) return { ok: false, message: UNCERTAIN_MESSAGE, uncertain: true };
    return { ok: false, message: 'No se pudo completar la operación. Intentá de nuevo.' };
  }
}

export const saveEmployeeRpc = (companyId: string, input: EmployeeInput) =>
  run(() =>
    supabase.rpc('upsert_employee', {
      p_company_id: companyId,
      p_employee_id: input.employeeId as string,
      p_full_name: input.fullName.trim(),
      p_document_number: input.documentNumber.trim(),
      p_job_title: input.jobTitle.trim(),
      p_phone: input.phone.trim(),
      // Fecha vacía = sin fecha de ingreso (la base espera null, no texto vacío)
      p_hire_date: (input.hireDate || null) as string,
      p_status: input.status,
      p_notes: input.notes.trim(),
    })
  );

export const setScheduleRpc = (companyId: string, employeeId: string, blocks: ScheduleBlock[]) =>
  run(() => supabase.rpc('set_employee_schedule', { p_company_id: companyId, p_employee_id: employeeId, p_blocks: blocks.map((b) => ({ weekday: b.weekday, start: b.start, end: b.end })) }));

export const clockInRpc = (companyId: string, employeeId: string) =>
  run(() => supabase.rpc('clock_in', { p_company_id: companyId, p_employee_id: employeeId }));

export const clockOutRpc = (companyId: string, employeeId: string) =>
  run(() => supabase.rpc('clock_out', { p_company_id: companyId, p_employee_id: employeeId }));

export const saveAttendanceRpc = (
  companyId: string, employeeId: string, recordId: string | null, checkInIso: string, checkOutIso: string | null, reason: string
) =>
  run(() =>
    supabase.rpc('save_attendance', {
      p_company_id: companyId, p_employee_id: employeeId, p_record_id: recordId as string,
      p_check_in: checkInIso, p_check_out: checkOutIso as string, p_reason: reason,
    })
  );

export const voidAttendanceRpc = (companyId: string, recordId: string, reason: string) =>
  run(() => supabase.rpc('void_attendance', { p_company_id: companyId, p_record_id: recordId, p_reason: reason }));
