import { useCallback, useEffect, useRef, useState } from 'react';
import { toUserMessage } from '@/lib/errorMessages';
import { useOnDataChange } from '@/features/realtime/hooks/useOnDataChange';
import type { DataTable } from '@/features/realtime/changeBus';
import {
  clockInRpc, clockOutRpc, fetchAttendanceSince, fetchEmployees, fetchSchedules, saveEmployeeRpc, setScheduleRpc,
} from '../api/employeesApi';
import type { AttendanceRecord, Employee, EmployeeInput, HrActionResult, ScheduleBlock } from '../types';

const REALTIME_TABLES: readonly DataTable[] = ['employees', 'employee_schedules', 'attendance_records'];

const startOfTodayIso = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

/**
 * Personal, horarios y asistencia de hoy (más las entradas que siguen abiertas), en vivo.
 * Incluye las acciones de alta/edición, horario y marcar entrada/salida.
 */
export function useStaff(companyId: string, enabled: boolean) {
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [schedules, setSchedules] = useState<Record<string, ScheduleBlock[]>>({});
  const [today, setToday] = useState<AttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!enabled || !companyId) {
      setIsLoading(false);
      return;
    }
    setError(null);
    try {
      const [list, blocks, records] = await Promise.all([
        fetchEmployees(companyId), fetchSchedules(companyId), fetchAttendanceSince(companyId, startOfTodayIso()),
      ]);
      if (requestId !== requestIdRef.current) return;
      setEmployees(list);
      setSchedules(blocks);
      setToday(records);
    } catch (err) {
      // Se conserva lo ya visible ante un corte breve
      if (requestId === requestIdRef.current) setError(toUserMessage(err, 'No se pudo cargar el personal.'));
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, [companyId, enabled]);

  useEffect(() => {
    setEmployees(null);
    setSchedules({});
    setToday([]);
  }, [companyId]);

  useEffect(() => {
    void load();
    return () => {
      requestIdRef.current += 1;
    };
  }, [load]);

  useOnDataChange(REALTIME_TABLES, () => {
    void load();
  });

  // También tras un resultado incierto: puede haberse guardado igual
  const after = useCallback(
    async (result: HrActionResult) => {
      if (result.ok || result.uncertain) await load();
      return result;
    },
    [load]
  );

  return {
    employees, schedules, today, isLoading, error, reload: load,
    saveEmployee: useCallback(async (input: EmployeeInput) => after(await saveEmployeeRpc(companyId, input)), [companyId, after]),
    saveSchedule: useCallback(async (employeeId: string, blocks: ScheduleBlock[]) => after(await setScheduleRpc(companyId, employeeId, blocks)), [companyId, after]),
    clockIn: useCallback(async (employeeId: string) => after(await clockInRpc(companyId, employeeId)), [companyId, after]),
    clockOut: useCallback(async (employeeId: string) => after(await clockOutRpc(companyId, employeeId)), [companyId, after]),
  };
}
