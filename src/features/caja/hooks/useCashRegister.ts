import { useCallback, useEffect, useRef, useState } from 'react';
import { useOnDataChange } from '@/features/realtime/hooks/useOnDataChange';
import type { DataTable } from '@/features/realtime/changeBus';
import {
  closeCashSessionRpc,
  fetchCashMovements,
  fetchCashSummary,
  fetchOpenSession,
  openCashSessionRpc,
  registerCashMovementRpc,
} from '../api/cashApi';
import type { CashActionResult, CashMovement, CashMovementType, CashSession, CashSummary } from '../types';
import { toUserMessage } from '@/lib/errorMessages';

/** La caja abierta cambia con sus movimientos y con cada venta o anulación. */
const REALTIME_TABLES: readonly DataTable[] = ['cash_sessions', 'cash_movements', 'sales'];

/** Estado de la caja abierta de la empresa: turno, totales en vivo y movimientos. */
export function useCashRegister(companyId: string) {
  const [session, setSession] = useState<CashSession | null>(null);
  const [summary, setSummary] = useState<CashSummary | null>(null);
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const reload = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setError(null);
    try {
      const open = await fetchOpenSession(companyId);
      const [nextSummary, nextMovements] = open
        ? await Promise.all([fetchCashSummary(companyId, open.id), fetchCashMovements(open.id)])
        : [null, []];
      if (requestId !== requestIdRef.current) return;
      setSession(open);
      setSummary(nextSummary);
      setMovements(nextMovements);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(toUserMessage(err, 'No se pudo cargar la caja.'));
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    setIsLoading(true);
    setSession(null);
    setSummary(null);
    setMovements([]);
    void reload();
    return () => {
      requestIdRef.current += 1;
    };
  }, [reload]);

  useOnDataChange(REALTIME_TABLES, () => {
    void reload();
  });

  const afterAction = useCallback(
    async (result: CashActionResult) => {
      // También tras un resultado incierto: la operación pudo haberse aplicado
      if (result.ok || result.uncertain) await reload();
      return result;
    },
    [reload]
  );

  const openSession = useCallback(
    async (openingAmount: number, notes: string) =>
      afterAction(await openCashSessionRpc(companyId, openingAmount, notes)),
    [companyId, afterAction]
  );

  const registerMovement = useCallback(
    async (movementType: CashMovementType, amount: number, reason: string) => {
      if (!session) return { ok: false, message: 'No hay una caja abierta.' } as CashActionResult;
      return afterAction(await registerCashMovementRpc(companyId, session.id, movementType, amount, reason));
    },
    [companyId, session, afterAction]
  );

  const closeSession = useCallback(
    async (countedAmount: number, notes: string) => {
      if (!session) return { ok: false, message: 'No hay una caja abierta.' } as CashActionResult;
      return afterAction(await closeCashSessionRpc(companyId, session.id, countedAmount, notes));
    },
    [companyId, session, afterAction]
  );

  return { session, summary, movements, isLoading, error, reload, openSession, registerMovement, closeSession };
}
