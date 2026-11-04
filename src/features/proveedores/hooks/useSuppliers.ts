import { useState, useEffect, useCallback, useRef } from 'react';
import type { Supplier, UpsertSupplierInput, SupplierActionResult } from '../types';
import { fetchSuppliers, upsertSupplierRpc, toggleSupplierStatusRpc } from '../api/suppliersApi';
import { useOnDataChange } from '@/features/realtime/hooks/useOnDataChange';
import type { DataTable } from '@/features/realtime/changeBus';
import { toUserMessage } from '@/lib/errorMessages';

/** Tablas cuyos cambios (de cualquier usuario de la empresa) recargan este hook. */
const REALTIME_TABLES: readonly DataTable[] = ['suppliers'];

export function useSuppliers(companyId: string) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef<boolean>(true);
  const currentCompanyIdRef = useRef<string>(companyId);
  currentCompanyIdRef.current = companyId;

  const loadSuppliers = useCallback(async (targetCompanyId: string) => {
    if (!targetCompanyId) {
      setSuppliers([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchSuppliers(targetCompanyId);
      if (isMountedRef.current && currentCompanyIdRef.current === targetCompanyId) {
        setSuppliers(data);
        setError(null);
      }
    } catch (err) {
      if (isMountedRef.current && currentCompanyIdRef.current === targetCompanyId) {
        const message = toUserMessage(err, 'Error al cargar proveedores.');
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
    setSuppliers([]);
    loadSuppliers(companyId);
    return () => {
      isMountedRef.current = false;
    };
  }, [companyId, loadSuppliers]);

  const reloadSuppliers = useCallback(async () => {
    await loadSuppliers(companyId);
  }, [companyId, loadSuppliers]);

  const saveSupplier = useCallback(
    async (input: Omit<UpsertSupplierInput, 'companyId'>): Promise<SupplierActionResult> => {
      try {
        const supplierId = await upsertSupplierRpc({
          ...input,
          companyId,
        });

        // Recargar la lista tras guardar exitosamente
        await loadSuppliers(companyId);

        return { success: true, supplierId };
      } catch (err) {
        const message = toUserMessage(err, 'No se pudo guardar el proveedor.');
        return { success: false, error: message };
      }
    },
    [companyId, loadSuppliers]
  );

  const toggleStatus = useCallback(
    async (supplier: Supplier, newStatus: boolean): Promise<SupplierActionResult> => {
      try {
        const supplierId = await toggleSupplierStatusRpc(companyId, supplier, newStatus);
        await loadSuppliers(companyId);
        return { success: true, supplierId };
      } catch (err) {
        const message = toUserMessage(err, 'No se pudo actualizar el estado del proveedor.');
        return { success: false, error: message };
      }
    },
    [companyId, loadSuppliers]
  );

  useOnDataChange(REALTIME_TABLES, () => {
    void reloadSuppliers();
  });

  return {
    suppliers,
    isLoading,
    error,
    reloadSuppliers,
    saveSupplier,
    toggleStatus,
  };
}
