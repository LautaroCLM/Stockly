import { useState, useEffect, useCallback, useRef } from 'react';
import type { Supplier } from '@/features/proveedores/types';
import type { Purchase, CreatePurchaseInput, PurchaseActionResult } from '../types';
import { fetchPurchasesPage, fetchPurchasesSummary, processPurchaseRpc } from '../api/purchasesApi';
import { useOnDataChange } from '@/features/realtime/hooks/useOnDataChange';
import type { DataTable } from '@/features/realtime/changeBus';

/** Tablas cuyos cambios (de cualquier usuario de la empresa) recargan este hook. */
const REALTIME_TABLES: readonly DataTable[] = ['purchases', 'suppliers'];

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
 * Exclusivo master_admin: para otros roles no consulta nada. Descarta respuestas de pedidos viejos.
 */
export function usePurchases(companyId: string, isMasterAdmin: boolean, suppliers: Supplier[]) {
  const [search, setSearch] = useState('');
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<{ count: number; total: number } | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  const isSubmittingRef = useRef<boolean>(false);
  const suppliersRef = useRef(suppliers);
  suppliersRef.current = suppliers;

  const toFilters = useCallback(
    (text: string) => ({ search: text, matchingSupplierIds: matchSupplierIds(suppliersRef.current, text) }),
    []
  );

  const reloadPurchases = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!companyId || !isMasterAdmin) {
      setPurchases([]);
      setTotal(0);
      setSummary(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setIsLoadingMore(false);
    setError(null);
    try {
      const [page, totals] = await Promise.all([
        fetchPurchasesPage(companyId, toFilters(search), 0),
        fetchPurchasesSummary(companyId),
      ]);
      if (requestId !== requestIdRef.current) return;
      setPurchases(page.rows);
      setTotal(page.total);
      setSummary(totals);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err instanceof Error ? err.message : 'Error al cargar las compras');
      setPurchases([]);
      setTotal(0);
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, [companyId, isMasterAdmin, search, toFilters]);

  useEffect(() => {
    reloadPurchases();
    return () => {
      requestIdRef.current += 1;
    };
  }, [reloadPurchases]);

  const loadMore = useCallback(async () => {
    if (isLoading || isLoadingMore || !isMasterAdmin) return;
    const requestId = requestIdRef.current;
    setIsLoadingMore(true);
    try {
      const page = await fetchPurchasesPage(companyId, toFilters(search), purchases.length);
      if (requestId !== requestIdRef.current) return;
      // Si entraron compras nuevas, el desplazamiento repite filas ya vistas: se descartan por id
      setPurchases((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...page.rows.filter((row) => !seen.has(row.id))];
      });
      setTotal(page.total);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err instanceof Error ? err.message : 'Error al cargar más compras.');
    } finally {
      if (requestId === requestIdRef.current) setIsLoadingMore(false);
    }
  }, [companyId, isMasterAdmin, search, isLoading, isLoadingMore, purchases.length, toFilters]);

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
        reloadPurchases();
        return { success: true, purchaseId: res.purchaseId, purchaseNumber: res.purchaseNumber };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Error desconocido al registrar la compra.',
        };
      } finally {
        isSubmittingRef.current = false;
      }
    },
    [companyId, isMasterAdmin, reloadPurchases]
  );

  useOnDataChange(REALTIME_TABLES, () => {
    void reloadPurchases();
  });

  return {
    purchases,
    total,
    summary,
    hasMore: purchases.length < total,
    isLoading,
    isLoadingMore,
    error,
    search,
    setSearch,
    loadMore,
    reloadPurchases,
    createPurchase,
  };
}
