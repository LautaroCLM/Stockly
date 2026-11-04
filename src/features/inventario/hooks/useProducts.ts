import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { TenantId } from '@/types';
import type { Product } from '../types';
import { fetchProducts } from '../api/productsApi';
import { useOnDataChange } from '@/features/realtime/hooks/useOnDataChange';
import type { DataTable } from '@/features/realtime/changeBus';
import { toUserMessage } from '@/lib/errorMessages';
import type { CatalogContext } from './catalogContext';
import { useProductMutations } from './useProductMutations';
import { useStockOperations } from './useStockOperations';

export type { ProductOperationResult } from './catalogContext';

/** Tablas cuyos cambios (de cualquier usuario de la empresa) recargan este hook. */
const REALTIME_TABLES: readonly DataTable[] = ['products', 'product_costs', 'stock_movements', 'categories'];

/**
 * Catálogo de productos de la empresa activa: carga, refresco en vivo y operaciones
 * (altas y modificaciones en useProductMutations, stock en useStockOperations).
 */
export function useProducts(tenantId: TenantId, isMasterAdmin: boolean = true) {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);

  const isMountedRef = useRef<boolean>(true);
  const currentCompanyIdRef = useRef<string>(tenantId);
  currentCompanyIdRef.current = tenantId;

  const isCurrent = useCallback(
    (companyId: string) => isMountedRef.current && currentCompanyIdRef.current === companyId,
    []
  );

  const loadProducts = useCallback(
    async (targetCompanyId: string) => {
      if (!targetCompanyId) {
        setProducts([]);
        setIsLoading(false);
        setError(null);
        setSyncWarning(null);
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const data = await fetchProducts(targetCompanyId, isMasterAdmin);
        if (isCurrent(targetCompanyId)) {
          setProducts(data);
          setSyncWarning(null);
        }
      } catch (err) {
        // Se conservan los productos ya visibles: un corte breve no debe vaciar el catálogo
        if (isCurrent(targetCompanyId)) setError(toUserMessage(err, 'No se pudieron cargar los productos.'));
      } finally {
        if (isCurrent(targetCompanyId)) setIsLoading(false);
      }
    },
    [isMasterAdmin, isCurrent]
  );

  useEffect(() => {
    isMountedRef.current = true;
    setProducts([]);
    void loadProducts(tenantId);
    return () => {
      isMountedRef.current = false;
    };
  }, [tenantId, loadProducts]);

  useOnDataChange(REALTIME_TABLES, () => {
    void loadProducts(tenantId);
  });

  const fetchAndApply = useCallback(async () => {
    const fresh = await fetchProducts(tenantId, isMasterAdmin);
    if (isCurrent(tenantId)) {
      setProducts(fresh);
      setError(null);
      setSyncWarning(null);
    }
    return fresh;
  }, [tenantId, isMasterAdmin, isCurrent]);

  const context = useMemo<CatalogContext>(
    () => ({
      tenantId,
      isMasterAdmin,
      products,
      fetchAndApply,
      patchProducts: (update) => {
        if (isCurrent(tenantId)) setProducts(update);
      },
      setSyncWarning: (message) => {
        if (isCurrent(tenantId)) setSyncWarning(message);
      },
    }),
    [tenantId, isMasterAdmin, products, fetchAndApply, isCurrent]
  );

  const mutations = useProductMutations(context);
  const stock = useStockOperations(context);

  // En la base la relación es por category_id; se actualiza la representación en memoria
  const renameCategoryInProducts = useCallback((categoryId: string, oldName: string, newName: string) => {
    setProducts((prev) =>
      prev.map((p) =>
        p.categoryId === categoryId || p.category.toLowerCase() === oldName.toLowerCase() ? { ...p, category: newName } : p
      )
    );
  }, []);

  return {
    products,
    isLoading,
    error,
    syncWarning,
    clearSyncWarning: () => setSyncWarning(null),
    ...mutations,
    ...stock,
    renameCategoryInProducts,
    reloadProducts: () => loadProducts(tenantId),
  };
}
