import { useState, useEffect, useCallback, useRef } from 'react';
import type { Supplier } from '@/features/proveedores/types';
import type { DataTable } from '@/features/realtime/changeBus';
import { useOnDataChange } from '@/features/realtime/hooks/useOnDataChange';
import { usePagedQuery } from '@/hooks/usePagedQuery';
import { toUserMessage } from '@/lib/errorMessages';
import type { Purchase, CreatePurchaseInput, PurchaseActionResult } from '../types';
import {
  PURCHASES_PAGE_SIZE,
  fetchPurchasesPage,
  fetchPurchasesSummary,
  processPurchaseRpc,
} from '../api/purchasesApi';

/** Tablas cuyos cambios (de cualquier usuario de la empresa) recargan este hook. */
const REALTIME_TABLES: readonly DataTable[] = ['purchases', 'suppliers'];
const SUMMARY_TABLES: readonly DataTable[] = ['purchases'];

/** Proveedores cuyo nombre o CUIT contienen el texto buscado. */
export function matchSupplierIds(suppliers: Supplier[], search: string): string[] {
  const q = search.toLowerCase().trim();
  if (!q) return [];
  return suppliers
    .filter((s) => s.name.toLowerCase().includes(q) || (s.taxId ?? '').toLowerCase().includes(q))
    .map((s) => s.id);
}

/**
 * Compras paginadas en el servidor con búsqueda y resumen (cantidad y total de completadas).
 * Exclusivo master_admin: para otros roles no consulta nada.
 */
export function usePurchases(companyId: string, isMasterAdmin: boolean, suppliers: Supplier[]) {
  const [search, setSearch] = useState('');
  const [summary, setSummary] = useState<{ count: number; total: number } | null>(null);
  const isSubmittingRef = useRef<boolean>(false);
  const suppliersRef = useRef(suppliers);
  suppliersRef.current = suppliers;
  const enabled = Boolean(companyId) && isMasterAdmin;

  const fetchPage = useCallback(
    (offset: number, limit: number) =>
      fetchPurchasesPage(
        companyId,
        { search, matchingSupplierIds: matchSupplierIds(suppliersRef.current, search) },
        offset,
        limit
      ),
    [companyId, search]
  );

  const query = usePagedQuery<Purchase>({
    queryKey: `${companyId}|${search}`,
    enabled,
    pageSize: PURCHASES_PAGE_SIZE,
    fetchPage,
    realtimeTables: REALTIME_TABLES,
    errorFallback: 'No se pudieron cargar las compras.',
  });

  // Resumen de completadas: si un refresco falla se conserva el último valor
  const loadSummary = useCallback(async () => {
    if (!enabled) {
      setSummary(null);
      return;
    }
    try {
      setSummary(await fetchPurchasesSummary(companyId));
    } catch {
      // El aviso de error ya lo muestra la lista; el resumen anterior sigue siendo útil
    }
  }, [companyId, enabled]);

  useEffect(() => {
    setSummary(null);
    void loadSummary();
  }, [loadSummary]);

  useOnDataChange(SUMMARY_TABLES, () => {
    void loadSummary();
  });

  const { refresh } = query;
  const reloadPurchases = useCallback(async () => {
    await Promise.all([refresh(), loadSummary()]);
  }, [refresh, loadSummary]);

  const createPurchase = useCallback(
    async (input: CreatePurchaseInput): Promise<PurchaseActionResult> => {
      if (!isMasterAdmin) {
        return { success: false, error: 'Operación denegada: solo master_admin puede registrar compras.' };
      }
      if (isSubmittingRef.current) {
        return { success: false, error: 'Ya hay una compra procesándose. Por favor aguarde.' };
      }
      if (!input.supplierId) {
        return { success: false, error: 'Debe seleccionar un proveedor.' };
      }
      if (!input.items || input.items.length === 0) {
        return { success: false, error: 'Debe agregar al menos un producto a la compra.' };
      }

      try {
        isSubmittingRef.current = true;
        const res = await processPurchaseRpc(companyId, input);
        void reloadPurchases();
        return { success: true, purchaseId: res.purchaseId, purchaseNumber: res.purchaseNumber };
      } catch (err) {
        return { success: false, error: toUserMessage(err, 'Error desconocido al registrar la compra.') };
      } finally {
        isSubmittingRef.current = false;
      }
    },
    [companyId, isMasterAdmin, reloadPurchases]
  );

  return {
    purchases: query.rows,
    total: query.total,
    summary,
    hasMore: query.hasMore,
    isLoading: query.isLoading,
    isLoadingMore: query.isLoadingMore,
    error: query.error,
    search,
    setSearch,
    loadMore: query.loadMore,
    reloadPurchases,
    createPurchase,
  };
}
