import { useCallback, useEffect, useRef, useState } from 'react';
import { toUserMessage } from '@/lib/errorMessages';
import { useOnDataChange } from '@/features/realtime/hooks/useOnDataChange';
import type { DataTable } from '@/features/realtime/changeBus';
import {
  fetchAttendanceBetween, fetchAttendanceReport, saveAttendanceRpc, voidAttendanceRpc,
} from '../api/employeesApi';
import type { AttendanceRecord, AttendanceSummary, HrActionResult } from '../types';

const REALTIME_TABLES: readonly DataTable[] = ['attendance_records', 'employee_schedules', 'employees'];

/** Fecha AAAA-MM-DD (calendario local) a instante de inicio de ese día local. */
const dayStartIso = (date: string) => new Date(`${date}T00:00:00`).toISOString();
const nextDayStartIso = (date: string) => {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
};

/** Registros y resumen de asistencia de un período, con corrección y anulación. */
export function useAttendancePeriod(companyId: string, enabled: boolean, from: string, to: string) {
  const [records, setRecords] = useState<AttendanceRecord[] | null>(null);
  const [summary, setSummary] = useState<AttendanceSummary[]>([]);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!enabled || !companyId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const [list, report] = await Promise.all([
        fetchAttendanceBetween(companyId, dayStartIso(from), nextDayStartIso(to)),
        fetchAttendanceReport(companyId, from, to),
      ]);
      if (requestId !== requestIdRef.current) return;
      setRecords(list);
      setSummary(report);
    } catch (err) {
      if (requestId === requestIdRef.current) setError(toUserMessage(err, 'No se pudo cargar la asistencia.'));
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, [companyId, enabled, from, to]);

  useEffect(() => {
    setRecords(null);
    setSummary([]);
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

  const after = useCallback(
    async (result: HrActionResult) => {
      if (result.ok || result.uncertain) await load();
      return result;
    },
    [load]
  );

  return {
    records, summary, isLoading, error, reload: load,
    saveRecord: useCallback(
      async (employeeId: string, recordId: string | null, inIso: string, outIso: string | null, reason: string) =>
        after(await saveAttendanceRpc(companyId, employeeId, recordId, inIso, outIso, reason)),
      [companyId, after]
    ),
    voidRecord: useCallback(async (recordId: string, reason: string) => after(await voidAttendanceRpc(companyId, recordId, reason)), [companyId, after]),
  };
}
