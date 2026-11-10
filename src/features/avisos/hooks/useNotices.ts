import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RouteId } from '@/types';
import { useOnDataChange } from '@/features/realtime/hooks/useOnDataChange';
import type { DataTable } from '@/features/realtime/changeBus';
import { accountsApi } from '@/features/cobros/api/accountsApi';
import { fetchOpenSession } from '@/features/caja/api/cashApi';
import { fetchClockRoster } from '@/features/empleados/api/employeesApi';
import { isoWeekday } from '@/features/empleados/timeMath';
import { productsToRestock } from '@/features/dashboard/dashboardMetrics';
import type { Product } from '@/features/inventario/types';
import { buildNotices } from '../buildNotices';
import type { Notice, NoticeSources } from '../types';

const REALTIME_TABLES: readonly DataTable[] = [
  'sales', 'customer_payments', 'supplier_payments', 'purchases', 'credit_purchases', 'attendance_records', 'cash_sessions',
];

/** Los avisos dependen del tiempo (días de deuda, horas de una entrada): se recalculan cada tanto aunque nada cambie. */
const REFRESH_MS = 5 * 60_000;

interface UseNoticesOptions {
  companyId: string;
  products: Product[];
  /** Qué fuentes puede ver quien usa la app: sin permiso, no se consultan ni se avisa. */
  canSeeDebts: boolean;
  canSeeAttendance: boolean;
  canSeeCash: boolean;
  attendanceRoute: RouteId;
}

type RemoteSources = Pick<NoticeSources, 'customerDebts' | 'supplierDebts' | 'openAttendance' | 'openCashSince'>;
const NO_REMOTE: RemoteSources = { customerDebts: null, supplierDebts: null, openAttendance: null, openCashSince: undefined };

const startOfTodayIso = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

/**
 * Avisos de la campana. Los productos a reponer salen del catálogo ya cargado; el resto
 * (deudas, entradas sin salida, caja) se consulta solo si la persona tiene acceso.
 * Si una consulta falla, se conserva lo último que se sabía de esa fuente.
 */
export function useNotices(options: UseNoticesOptions): { notices: Notice[]; isLoading: boolean } {
  const { companyId, products, canSeeDebts, canSeeAttendance, canSeeCash, attendanceRoute } = options;
  const [remote, setRemote] = useState<RemoteSources>(NO_REMOTE);
  const [isLoading, setIsLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!companyId) return;

    const [customers, suppliers, attendance, cash] = await Promise.allSettled([
      canSeeDebts ? accountsApi('customer').fetchBalances(companyId) : Promise.resolve(null),
      canSeeDebts ? accountsApi('supplier').fetchBalances(companyId) : Promise.resolve(null),
      canSeeAttendance ? fetchClockRoster(companyId, isoWeekday(new Date()), startOfTodayIso()) : Promise.resolve(null),
      canSeeCash ? fetchOpenSession(companyId) : Promise.resolve(undefined),
    ]);
    if (requestId !== requestIdRef.current) return;

    setRemote((previous) => {
      const debts = (r: typeof customers, fallback: RemoteSources['customerDebts']) =>
        r.status === 'fulfilled' ? (r.value ? r.value.map((b) => ({ name: b.partyName, balance: b.balance, oldestOpenSince: b.oldestOpenSince })) : null) : fallback;
      return {
        customerDebts: debts(customers, previous.customerDebts),
        supplierDebts: debts(suppliers, previous.supplierDebts),
        openAttendance:
          attendance.status === 'fulfilled'
            ? attendance.value
              ? attendance.value.today
                  .filter((r) => r.checkOut === null)
                  .map((r) => ({
                    employeeName: attendance.value?.employees.find((e) => e.id === r.employeeId)?.fullName ?? 'Empleado',
                    checkIn: r.checkIn,
                  }))
              : null
            : previous.openAttendance,
        openCashSince: cash.status === 'fulfilled' ? (cash.value === undefined ? undefined : cash.value?.openedAt ?? null) : previous.openCashSince,
      };
    });
    setNow(new Date());
    setIsLoading(false);
  }, [companyId, canSeeDebts, canSeeAttendance, canSeeCash]);

  useEffect(() => {
    setRemote(NO_REMOTE);
    setIsLoading(true);
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => {
      requestIdRef.current += 1;
      window.clearInterval(timer);
    };
  }, [load]);

  useOnDataChange(REALTIME_TABLES, () => {
    void load();
  });

  const notices = useMemo(
    () =>
      buildNotices(
        {
          restock: productsToRestock(products).map((p) => ({ name: p.name, stock: p.stock, minStock: p.minStock, unit: p.unit })),
          ...remote,
          attendanceRoute,
        },
        now
      ),
    [products, remote, attendanceRoute, now]
  );

  return { notices, isLoading };
}
