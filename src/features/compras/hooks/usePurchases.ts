import { useState, useEffect, useCallback, useRef } from 'react';
import type { Purchase, CreatePurchaseInput, PurchaseActionResult } from '../types';
import { fetchPurchases, processPurchaseRpc } from '../api/purchasesApi';

export function usePurchases(companyId: string, isMasterAdmin: boolean) {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);

  const isSubmittingRef = useRef<boolean>(false);

  const reloadPurchases = useCallback(async () => {
    if (!companyId) return;

    if (!isMasterAdmin) {
      setPurchases([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const data = await fetchPurchases(companyId);
      setPurchases(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al cargar las compras';
      console.error('Error fetching purchases:', err);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [companyId, isMasterAdmin]);

  useEffect(() => {
    reloadPurchases();
  }, [reloadPurchases]);

  const createPurchase = useCallback(
    async (input: CreatePurchaseInput): Promise<PurchaseActionResult> => {
      if (!isMasterAdmin) {
        return {
          success: false,
          error: 'Operación denegada: solo master_admin puede registrar compras.',
        };
      }

      if (isSubmittingRef.current) {
        return {
          success: false,
          error: 'Ya hay una compra procesándose. Por favor aguarde.',
        };
      }

      if (!input.supplierId) {
        return { success: false, error: 'Debe seleccionar un proveedor.' };
      }

      if (!input.items || input.items.length === 0) {
        return { success: false, error: 'Debe agregar al menos un producto a la compra.' };
      }

      try {
        isSubmittingRef.current = true;
        setSyncWarning(null);

        const res = await processPurchaseRpc(companyId, input);

        // Recargar la lista de compras de forma asíncrona
        reloadPurchases().catch((err) => {
          console.warn('Advertencia al recargar compras tras creación:', err);
          setSyncWarning('La compra se registró, pero no se pudo actualizar la lista automáticamente.');
        });

        return {
          success: true,
          purchaseId: res.purchase_id,
          purchaseNumber: res.purchase_number,
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Error desconocido al registrar la compra.';
        console.error('Error creating purchase:', err);
        return {
          success: false,
          error: errorMsg,
        };
      } finally {
        isSubmittingRef.current = false;
      }
    },
    [companyId, isMasterAdmin, reloadPurchases]
  );

  return {
    purchases,
    isLoading,
    error,
    syncWarning,
    reloadPurchases,
    createPurchase,
  };
}
