import { useCallback, useEffect, useRef, useState } from 'react';
import { toUserMessage } from '@/lib/errorMessages';
import { useOnDataChange } from '@/features/realtime/hooks/useOnDataChange';
import type { DataTable } from '@/features/realtime/changeBus';
import {
  fetchCustomerBalances, fetchCustomerStatement, registerCollectionRpc, voidCollectionRpc,
} from '../api/cobrosApi';
import type { CollectionActionResult, CustomerBalance, NewCollectionInput, StatementEntry } from '../types';

const REALTIME_TABLES: readonly DataTable[] = ['sales', 'customer_payments', 'customers'];

/** Saldos de los clientes en cuenta corriente, en vivo, y las operaciones de cobro. */
export function useCustomerAccounts(companyId: string) {
  const [balances, setBalances] = useState<CustomerBalance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!companyId) return;
    setError(null);
    try {
      const rows = await fetchCustomerBalances(companyId);
      if (requestId === requestIdRef.current) setBalances(rows);
    } catch (err) {
      // Se conservan los saldos ya visibles ante un corte breve
      if (requestId === requestIdRef.current) setError(toUserMessage(err, 'No se pudieron cargar los saldos.'));
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    setBalances([]);
    setIsLoading(true);
    void load();
    return () => {
      requestIdRef.current += 1;
    };
  }, [load]);

  useOnDataChange(REALTIME_TABLES, () => {
    void load();
  });

  const afterAction = useCallback(
    async (result: CollectionActionResult) => {
      // También tras un resultado incierto: puede haberse guardado igual
      if (result.ok || result.uncertain) await load();
      return result;
    },
    [load]
  );

  const registerCollection = useCallback(
    async (input: NewCollectionInput) => afterAction(await registerCollectionRpc(companyId, input)),
    [companyId, afterAction]
  );
  const voidCollection = useCallback(
    async (paymentId: string, reason: string) => afterAction(await voidCollectionRpc(companyId, paymentId, reason)),
    [companyId, afterAction]
  );

  return { balances, isLoading, error, reload: load, registerCollection, voidCollection };
}

/** Estado de cuenta de un cliente; se recarga cuando cambian sus ventas o cobros. */
export function useCustomerStatement(companyId: string, customerId: string | null) {
  const [entries, setEntries] = useState<StatementEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!customerId) return;
    setError(null);
    try {
      const rows = await fetchCustomerStatement(companyId, customerId);
      if (requestId === requestIdRef.current) setEntries(rows);
    } catch (err) {
      if (requestId === requestIdRef.current) setError(toUserMessage(err, 'No se pudo cargar el estado de cuenta.'));
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, [companyId, customerId]);

  useEffect(() => {
    setEntries([]);
    setIsLoading(Boolean(customerId));
    void load();
    return () => {
      requestIdRef.current += 1;
    };
  }, [load, customerId]);

  useOnDataChange(REALTIME_TABLES, () => {
    void load();
  });

  return { entries, isLoading, error, reload: load };
}
