import { useCallback, useEffect, useRef, useState } from 'react';
import { toUserMessage } from '@/lib/errorMessages';
import { clockInRpc, clockOutRpc, fetchClockRoster } from '../api/employeesApi';
import { isoWeekday } from '../timeMath';
import type { ClockRoster, HrActionResult } from '../types';

/** Cada cuánto se refresca la lista, ya que una cuenta de empleado no recibe cambios en vivo de las tablas de personal. */
const REFRESH_MS = 20_000;

const startOfTodayIso = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

/** Lista para fichar (la ve cualquier miembro de la empresa) con las acciones de marcar entrada y salida. */
export function useClockRoster(companyId: string) {
  const [roster, setRoster] = useState<ClockRoster | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!companyId) {
      setIsLoading(false);
      return;
    }
    setError(null);
    try {
      const data = await fetchClockRoster(companyId, isoWeekday(new Date()), startOfTodayIso());
      if (requestId === requestIdRef.current) setRoster(data);
    } catch (err) {
      // Se conserva lo ya visible ante un corte breve
      if (requestId === requestIdRef.current) setError(toUserMessage(err, 'No se pudo cargar el personal.'));
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    setRoster(null);
    setIsLoading(true);
  }, [companyId]);

  useEffect(() => {
    void load();
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    const timer = window.setInterval(refreshIfVisible, REFRESH_MS);
    document.addEventListener('visibilitychange', refreshIfVisible);
    return () => {
      requestIdRef.current += 1;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [load]);

  // También tras un resultado incierto: puede haberse guardado igual
  const after = useCallback(
    async (result: HrActionResult) => {
      if (result.ok || result.uncertain) await load();
      return result;
    },
    [load]
  );

  return {
    roster, isLoading, error, reload: load,
    clockIn: useCallback(async (employeeId: string) => after(await clockInRpc(companyId, employeeId)), [companyId, after]),
    clockOut: useCallback(async (employeeId: string) => after(await clockOutRpc(companyId, employeeId)), [companyId, after]),
  };
}
