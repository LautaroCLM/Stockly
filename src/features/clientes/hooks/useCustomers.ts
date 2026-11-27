import { useState, useEffect, useCallback, useRef } from 'react';
import type { Customer, UpsertCustomerInput, CustomerActionResult } from '../types';
import { fetchCustomers, setCustomerVatConditionRpc, upsertCustomerRpc, toggleCustomerStatusRpc } from '../api/customersApi';
import { DEFAULT_CUSTOMER_VAT_CONDITION } from '@/features/facturacion/vat';
import { setCustomerPriceListRpc } from '@/features/listas/api/priceListsApi';
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

        // Va después del upsert: la base valida el IVA contra el CUIT ya guardado
        const previous = customers.find((c) => c.id === customerId);
        const current = previous?.vatCondition ?? DEFAULT_CUSTOMER_VAT_CONDITION;
        let vatError: string | null = null;
        if (input.priceListId !== undefined && input.priceListId !== (previous?.priceListId ?? null)) {
          try {
            await setCustomerPriceListRpc(companyId, customerId, input.priceListId);
          } catch (listErr) {
            vatError = `El cliente se guardó, pero no su lista de precios (${toUserMessage(listErr, 'error de conexión')}).`;
          }
        }
        if (input.vatCondition && input.vatCondition !== current) {
          try {
            await setCustomerVatConditionRpc(companyId, customerId, input.vatCondition);
          } catch (vatErr) {
            vatError = `El cliente se guardó, pero no su condición frente al IVA (${toUserMessage(vatErr, 'error de conexión')}).`;
          }
        }

        await loadCustomers(companyId);
        if (vatError) return { success: false, error: vatError, customerId };
        return { success: true, customerId };
      } catch (err) {
        const message = toUserMessage(err, 'No se pudo guardar el cliente.');
        return { success: false, error: message };
      }
    },
    [companyId, customers, loadCustomers]
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
