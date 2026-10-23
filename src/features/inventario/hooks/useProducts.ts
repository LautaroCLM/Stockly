import { useState, useEffect, useCallback, useRef } from 'react';
import type { TenantId } from '@/types';
import type { Product, ProductFormData, StockMovement, StockAdjustmentData } from '../types';
import {
  fetchProducts,
  createProductRpc,
  updateProductRpc,
  setProductActiveRpc,
  isNetworkOrUncertainError,
} from '../api/productsApi';

export interface ProductOperationResult {
  success: boolean;
  partial?: boolean;
  uncertain?: boolean;
  error?: string;
  product?: Product;
}

export function useProducts(tenantId: TenantId, isMasterAdmin: boolean = true) {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef<boolean>(true);
  const currentCompanyIdRef = useRef<string>(tenantId);

  currentCompanyIdRef.current = tenantId;

  const loadProducts = useCallback(
    async (targetCompanyId: string) => {
      if (!targetCompanyId) {
        setProducts([]);
        setIsLoading(false);
        setError(null);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const data = await fetchProducts(targetCompanyId, isMasterAdmin);
        if (isMountedRef.current && currentCompanyIdRef.current === targetCompanyId) {
          setProducts(data);
          setIsLoading(false);
        }
      } catch (err) {
        if (isMountedRef.current && currentCompanyIdRef.current === targetCompanyId) {
          const message = err instanceof Error ? err.message : 'Error al cargar los productos.';
          setError(message);
          setProducts([]);
          setIsLoading(false);
        }
      }
    },
    [isMasterAdmin]
  );

  useEffect(() => {
    isMountedRef.current = true;
    setProducts([]);
    loadProducts(tenantId);

    return () => {
      isMountedRef.current = false;
    };
  }, [tenantId, loadProducts]);

  const createProduct = useCallback(
    async (formData: ProductFormData): Promise<ProductOperationResult> => {
      const cleanSku = formData.sku.trim().toUpperCase();
      const cleanName = formData.name.trim();

      if (!cleanSku || !cleanName) {
        return { success: false, error: 'SKU y nombre de producto son obligatorios.' };
      }

      try {
        const newId = await createProductRpc({
          companyId: tenantId,
          sku: cleanSku,
          name: cleanName,
          unit: (formData.unit || 'unidad').toLowerCase(),
          sellingPrice: formData.salePrice,
          costPrice: formData.costPrice,
          minStock: formData.minStock,
          barcode: formData.barcode?.trim() || undefined,
          description: formData.description?.trim() || undefined,
          categoryId: formData.categoryId || undefined,
        });

        // Recarga atómica desde Supabase tras mutación exitosa
        const fresh = await fetchProducts(tenantId, isMasterAdmin);
        if (isMountedRef.current && currentCompanyIdRef.current === tenantId) {
          setProducts(fresh);
        }

        const created = fresh.find((p) => p.id === newId);
        return { success: true, product: created };
      } catch (err) {
        if (isNetworkOrUncertainError(err)) {
          // Intentar recuperación por si PostgreSQL aplicó la inserción antes del corte
          try {
            const fresh = await fetchProducts(tenantId, isMasterAdmin);
            if (isMountedRef.current && currentCompanyIdRef.current === tenantId) {
              setProducts(fresh);
            }
            const maybeCreated = fresh.find((p) => p.sku === cleanSku);
            if (maybeCreated) {
              return { success: true, product: maybeCreated };
            }
          } catch {
            // Silencio en recarga de recuperación
          }
          return {
            success: false,
            uncertain: true,
            error:
              'Error de comunicación con el servidor al crear el producto. El resultado es incierto; por favor verifique si el producto aparece en el catálogo antes de reintentar.',
          };
        }
        const message = err instanceof Error ? err.message : 'Error al crear el producto.';
        return { success: false, error: message };
      }
    },
    [tenantId, isMasterAdmin]
  );

  const updateProduct = useCallback(
    async (id: string, formData: ProductFormData): Promise<ProductOperationResult> => {
      const existing = products.find((p) => p.id === id);
      if (!existing) {
        return { success: false, error: 'Producto no encontrado.' };
      }

      const execResult = await updateProductRpc(
        {
          companyId: tenantId,
          productId: id,
          sku: formData.sku,
          name: formData.name,
          unit: (formData.unit || existing.unit || 'unidad').toLowerCase(),
          sellingPrice: formData.salePrice,
          costPrice: formData.costPrice !== undefined ? formData.costPrice : undefined,
          currentCostPrice: existing.costPrice,
          minStock: formData.minStock,
          barcode: formData.barcode,
          description: formData.description,
          categoryId: formData.categoryId,
          isActive: existing.isActive,
        },
        isMasterAdmin
      );

      // Si hubo mutación general o el estado es incierto, recargamos inmediatamente desde Supabase
      // para que la interfaz refleje el estado real y no conserve datos locales desactualizados.
      if (execResult.generalDataSaved || execResult.status === 'uncertain') {
        try {
          const fresh = await fetchProducts(tenantId, isMasterAdmin);
          if (isMountedRef.current && currentCompanyIdRef.current === tenantId) {
            setProducts(fresh);
          }
          const updated = fresh.find((p) => p.id === id);

          if (execResult.status === 'success') {
            return { success: true, product: updated };
          }
          if (execResult.status === 'partial') {
            return { success: false, partial: true, error: execResult.message, product: updated };
          }
          if (execResult.status === 'uncertain') {
            return { success: false, uncertain: true, error: execResult.message, product: updated };
          }
        } catch (reloadErr) {
          console.warn('Error al refrescar productos tras actualización:', reloadErr);
        }
      }

      if (execResult.status === 'success') {
        return { success: true };
      }

      return {
        success: false,
        partial: execResult.status === 'partial',
        uncertain: execResult.status === 'uncertain',
        error: execResult.message || 'Error al actualizar el producto.',
      };
    },
    [tenantId, products, isMasterAdmin]
  );

  const deactivateProduct = useCallback(
    async (id: string): Promise<ProductOperationResult> => {
      const existing = products.find((p) => p.id === id);
      if (!existing) {
        return { success: false, error: 'Producto no encontrado.' };
      }

      try {
        await setProductActiveRpc(tenantId, existing, false);
        const fresh = await fetchProducts(tenantId, isMasterAdmin);
        if (isMountedRef.current && currentCompanyIdRef.current === tenantId) {
          setProducts(fresh);
        }
        return { success: true };
      } catch (err) {
        if (isNetworkOrUncertainError(err)) {
          try {
            const fresh = await fetchProducts(tenantId, isMasterAdmin);
            if (isMountedRef.current && currentCompanyIdRef.current === tenantId) {
              setProducts(fresh);
            }
            const updated = fresh.find((p) => p.id === id);
            if (updated && !updated.isActive) {
              return { success: true, product: updated };
            }
          } catch {
            // Ignorar error de recarga en fallo de red
          }
          return {
            success: false,
            uncertain: true,
            error:
              'Error de red al desactivar el producto. El estado en la base de datos es incierto; por favor verifique antes de reintentar.',
          };
        }
        const message = err instanceof Error ? err.message : 'Error al desactivar el producto.';
        return { success: false, error: message };
      }
    },
    [tenantId, products, isMasterAdmin]
  );

  const reactivateProduct = useCallback(
    async (id: string): Promise<ProductOperationResult> => {
      const existing = products.find((p) => p.id === id);
      if (!existing) {
        return { success: false, error: 'Producto no encontrado.' };
      }

      try {
        await setProductActiveRpc(tenantId, existing, true);
        const fresh = await fetchProducts(tenantId, isMasterAdmin);
        if (isMountedRef.current && currentCompanyIdRef.current === tenantId) {
          setProducts(fresh);
        }
        return { success: true };
      } catch (err) {
        if (isNetworkOrUncertainError(err)) {
          try {
            const fresh = await fetchProducts(tenantId, isMasterAdmin);
            if (isMountedRef.current && currentCompanyIdRef.current === tenantId) {
              setProducts(fresh);
            }
            const updated = fresh.find((p) => p.id === id);
            if (updated && updated.isActive) {
              return { success: true, product: updated };
            }
          } catch {
            // Ignorar error de recarga en fallo de red
          }
          return {
            success: false,
            uncertain: true,
            error:
              'Error de red al reactivar el producto. El estado en la base de datos es incierto; por favor verifique antes de reintentar.',
          };
        }
        const message = err instanceof Error ? err.message : 'Error al reactivar el producto.';
        return { success: false, error: message };
      }
    },
    [tenantId, products, isMasterAdmin]
  );

  const renameCategoryInProducts = useCallback(
    (categoryId: string, oldName: string, newName: string) => {
      // En base de datos la relación es por category_id (FK), actualizamos la representación en memoria
      setProducts((prev) =>
        prev.map((p) =>
          p.categoryId === categoryId || p.category.toLowerCase() === oldName.toLowerCase()
            ? { ...p, category: newName }
            : p
        )
      );
    },
    []
  );

  /**
   * Los movimientos de stock serán integrados en el Paso 25E.
   * Para evitar inconsistencias, no se persisten saldos ficticios en localStorage.
   */
  const adjustStock = useCallback(
    (_data: StockAdjustmentData): { success: boolean; error?: string; movement?: StockMovement } => {
      return {
        success: false,
        error:
          'Los ajustes manuales de existencias se integrarán en el Paso 25E (Módulo de Movimientos). Las existencias actuales reflejan el saldo real en PostgreSQL.',
      };
    },
    []
  );

  const syncProductsFromTransaction = useCallback((_updatedProducts: Product[]) => {
    // No-op: el stock real es gobernado exclusivamente por el backend PostgreSQL
  }, []);

  return {
    products,
    isLoading,
    error,
    createProduct,
    updateProduct,
    renameCategoryInProducts,
    deactivateProduct,
    reactivateProduct,
    adjustStock,
    syncProductsFromTransaction,
    reloadProducts: () => loadProducts(tenantId),
  };
}

// ---------------------------------------------------------------------------
// Helpers transitorios de compatibilidad con checkout/ventas locales (Paso 25E)
// ---------------------------------------------------------------------------
export { computeStatus } from '../api/productsApi';

export function getProductStorageKey(tenantId: TenantId): string {
  return `stockly_products_${tenantId}_v1`;
}

export function loadProductsFromStorage(tenantId: TenantId): Product[] {
  try {
    const raw = localStorage.getItem(getProductStorageKey(tenantId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Error al leer productos locales:', err);
  }
  return [];
}

export function saveProductsToStorage(tenantId: TenantId, products: Product[]): boolean {
  try {
    localStorage.setItem(getProductStorageKey(tenantId), JSON.stringify(products));
    return true;
  } catch (err) {
    console.error('Error al guardar productos locales:', err);
    return false;
  }
}
