import { useState, useEffect, useCallback, useRef } from 'react';
import type { Customer, UpsertCustomerInput, CustomerActionResult } from '../types';
import { fetchCustomers, upsertCustomerRpc, toggleCustomerStatusRpc } from '../api/customersApi';
import { useOnDataChange } from '@/features/realtime/hooks/useOnDataChange';
import type { DataTable } from '@/features/realtime/changeBus';
import { toUserMessage } from '@/lib/errorMessages';

/** Tablas cuyos cambios (de cualquier usuario de la empresa) recargan este hook. */
const REALTIME_TABLES: readonly DataTable[] = ['customers'];

export function useCustomers(companyId: string) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef<boolean>(true);
  const currentCompanyIdRef = useRef<string>(companyId);
  currentCompanyIdRef.current = companyId;

  const loadCustomers = useCallback(async (targetCompanyId: string) => {
    if (!targetCompanyId) {
      setCustomers([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchCustomers(targetCompanyId);
      if (isMountedRef.current && currentCompanyIdRef.current === targetCompanyId) {
        setCustomers(data);
        setError(null);
      }
    } catch (err) {
      if (isMountedRef.current && currentCompanyIdRef.current === targetCompanyId) {
        const message = toUserMessage(err, 'Error al cargar clientes.');
        setError(message);
      }
    } finally {
      if (isMountedRef.current && currentCompanyIdRef.current === targetCompanyId) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    // Al cambiar de empresa no deben quedar a la vista los datos de la anterior
    setCustomers([]);
    loadCustomers(companyId);
    return () => {
      isMountedRef.current = false;
    };
  }, [companyId, loadCustomers]);

  const reloadCustomers = useCallback(async () => {
    await loadCustomers(companyId);
  }, [companyId, loadCustomers]);

  const saveCustomer = useCallback(
    async (input: Omit<UpsertCustomerInput, 'companyId'>): Promise<CustomerActionResult> => {
      try {
        const customerId = await upsertCustomerRpc({
          ...input,
          companyId,
        });

        await loadCustomers(companyId);
        return { success: true, customerId };
      } catch (err) {
        const message = toUserMessage(err, 'No se pudo guardar el cliente.');
        return { success: false, error: message };
      }
    },
    [companyId, loadCustomers]
  );

  const toggleStatus = useCallback(
    async (customer: Customer, newStatus: boolean): Promise<CustomerActionResult> => {
      try {
        const customerId = await toggleCustomerStatusRpc(companyId, customer, newStatus);
        await loadCustomers(companyId);
        return { success: true, customerId };
      } catch (err) {
        const message = toUserMessage(err, 'No se pudo actualizar el estado del cliente.');
        return { success: false, error: message };
      }
    },
    [companyId, loadCustomers]
  );

  useOnDataChange(REALTIME_TABLES, () => {
    void reloadCustomers();
  });

  return {
    customers,
    isLoading,
    error,
    reloadCustomers,
    saveCustomer,
    toggleStatus,
  };
}
