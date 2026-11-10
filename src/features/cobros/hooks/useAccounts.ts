import { useCallback, useEffect, useRef, useState } from 'react';
import { toUserMessage } from '@/lib/errorMessages';
import { useOnDataChange } from '@/features/realtime/hooks/useOnDataChange';
import { ACCOUNT_TABLES } from '../accountKinds';
import type { AccountKind } from '../accountKinds';
import { accountsApi } from '../api/accountsApi';
import type { AccountBalance, CollectionActionResult, NewCollectionInput, StatementEntry } from '../types';

/** Saldos de las cuentas corrientes (de clientes o de proveedores), en vivo, y las operaciones de cobro o pago. */
export function useAccounts(kind: AccountKind, companyId: string) {
  const [balances, setBalances] = useState<AccountBalance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!companyId) return;
    setError(null);
    try {
      const rows = await accountsApi(kind).fetchBalances(companyId);
      if (requestId === requestIdRef.current) setBalances(rows);
    } catch (err) {
      // Se conservan los saldos ya visibles ante un corte breve
      if (requestId === requestIdRef.current) setError(toUserMessage(err, 'No se pudieron cargar los saldos.'));
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, [kind, companyId]);

  useEffect(() => {
    setBalances([]);
    setIsLoading(true);
    void load();
    return () => {
      requestIdRef.current += 1;
    };
  }, [load]);

  useOnDataChange(ACCOUNT_TABLES[kind], () => {
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

  const register = useCallback(
    async (input: NewCollectionInput) => afterAction(await accountsApi(kind).register(companyId, input)),
    [kind, companyId, afterAction]
  );
  const voidPayment = useCallback(
    async (paymentId: string, reason: string) => afterAction(await accountsApi(kind).voidPayment(companyId, paymentId, reason)),
    [kind, companyId, afterAction]
  );

  return { balances, isLoading, error, reload: load, register, voidPayment };
}

/** Estado de cuenta de un cliente o proveedor; se recarga cuando cambian sus movimientos. */
export function useAccountStatement(kind: AccountKind, companyId: string, partyId: string | null) {
  const [entries, setEntries] = useState<StatementEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!partyId) return;
    setError(null);
    try {
      const rows = await accountsApi(kind).fetchStatement(companyId, partyId);
      if (requestId === requestIdRef.current) setEntries(rows);
    } catch (err) {
      if (requestId === requestIdRef.current) setError(toUserMessage(err, 'No se pudo cargar el estado de cuenta.'));
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, [kind, companyId, partyId]);

  useEffect(() => {
    setEntries([]);
    setIsLoading(Boolean(partyId));
    void load();
    return () => {
      requestIdRef.current += 1;
    };
  }, [load, partyId]);

  useOnDataChange(ACCOUNT_TABLES[kind], () => {
    void load();
  });

  return { entries, isLoading, error, reload: load };
}
