import { useState, useEffect, useCallback, useRef } from 'react';
import type { TenantId } from '@/types';
import type {
  Product,
  ProductFormData,
  StockAdjustmentData,
  StockAdjustmentResult,
  InitialStockBatchData,
  InitialStockResult,
} from '../types';
import {
  fetchProducts,
  createProductRpc,
  updateProductRpc,
  setProductActiveRpc,
  computeStatus,
  isNetworkOrUncertainError,
} from '../api/productsApi';
import { registerStockAdjustmentRpc } from '../api/stockMovementsApi';
import { registerPhysicalCountRpc } from '../api/physicalCountApi';
import { importInitialStockRpc } from '../api/initialStockApi';

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
  const [syncWarning, setSyncWarning] = useState<string | null>(null);

  const isMountedRef = useRef<boolean>(true);
  const currentCompanyIdRef = useRef<string>(tenantId);

  currentCompanyIdRef.current = tenantId;

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
        if (isMountedRef.current && currentCompanyIdRef.current === targetCompanyId) {
          setProducts(data);
          setError(null);
          setSyncWarning(null);
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
   * Registra un ajuste de stock invocando la RPC public.register_stock_adjustment.
   * Tras la mutación exitosa en PostgreSQL, refresca el catálogo para mostrar el nuevo saldo real.
   */
  const adjustStock = useCallback(
    async (
      data: StockAdjustmentData
    ): Promise<StockAdjustmentResult> => {
      if (!isMasterAdmin) {
        return {
          success: false,
          status: 'rejected',
          error: 'Acceso denegado: solo el Administrador (master_admin) puede registrar ajustes de existencias.',
        };
      }

      const existing = products.find((p) => p.id === data.productId);
      if (!existing) {
        return { success: false, status: 'rejected', error: 'Producto no encontrado en el catálogo.' };
      }

      // Validar motivos autorizados para ajuste manual en register_stock_adjustment
      if (!['physical_count', 'loss_damage', 'internal_use'].includes(data.reason)) {
        return {
          success: false,
          status: 'rejected',
          error: 'Motivo no admitido para ajuste manual. Solo se admiten: conteo físico, merma/daño o consumo interno.',
        };
      }

      const isPhysicalCount = data.reason === 'physical_count';
      if (isPhysicalCount && data.countedQuantity === undefined) {
        return { success: false, status: 'rejected', error: 'Falta la cantidad contada.' };
      }

      // Validar unidades indivisibles
      const checkedQuantity = isPhysicalCount ? data.countedQuantity ?? 0 : data.quantity;
      if (['unidad', 'bulto', 'par'].includes(existing.unit) && !Number.isInteger(checkedQuantity)) {
        return {
          success: false,
          status: 'rejected',
          error: `La unidad "${existing.unit}" es indivisible y no admite cantidades fraccionarias con decimales.`,
        };
      }

      const idempotencyKey = data.idempotencyKey || crypto.randomUUID();

      // El conteo físico envía el valor absoluto: el servidor calcula la diferencia bajo bloqueo
      const res = isPhysicalCount
        ? await registerPhysicalCountRpc({
            companyId: tenantId,
            idempotencyKey,
            productId: data.productId,
            countedQuantity: data.countedQuantity ?? 0,
            notes: data.notes,
            referenceDoc: data.referenceDoc,
          })
        : await registerStockAdjustmentRpc({
            companyId: tenantId,
            idempotencyKey,
            productId: data.productId,
            direction: data.direction,
            reason: data.reason as 'loss_damage' | 'internal_use',
            quantity: data.quantity,
            notes: data.notes,
            referenceDoc: data.referenceDoc,
          });

      if (res.status === 'success') {
        // Mutación confirmada por la base de datos: intentar refrescar catálogo completo
        try {
          const fresh = await fetchProducts(tenantId, isMasterAdmin);
          if (isMountedRef.current && currentCompanyIdRef.current === tenantId) {
            setProducts(fresh);
            setError(null);
            setSyncWarning(null);
          }
          return { success: true, status: 'confirmed_synced' };
        } catch (reloadErr) {
          console.warn('Error al refrescar productos tras ajuste de stock confirmado:', reloadErr);

          // Fallback seguro: Si fetchProducts falla por corte de red posterior al éxito de la RPC,
          // actualizar en memoria el saldo del producto afectado usando el newStock confirmado por PostgreSQL.
          const hasValidNewStock = typeof res.newStock === 'number' && !Number.isNaN(res.newStock);

          if (hasValidNewStock && isMountedRef.current && currentCompanyIdRef.current === tenantId) {
            setProducts((prev) =>
              prev.map((p) => {
                if (p.id !== data.productId) return p;
                const updatedStock = res.newStock!;
                return {
                  ...p,
                  stock: updatedStock,
                  status: computeStatus(updatedStock, p.minStock),
                };
              })
            );
          }

          const warningMessage = hasValidNewStock
            ? `Ajuste confirmado en la base de datos (saldo provisional: ${res.newStock}), pero la recarga completa del catálogo falló por conexión. Puede reintentar la recarga para sincronizar.`
            : 'Ajuste confirmado en la base de datos, pero la recarga completa del catálogo falló por conexión. El catálogo está pendiente de sincronización.';

          if (isMountedRef.current && currentCompanyIdRef.current === tenantId) {
            setSyncWarning(warningMessage);
          }

          return {
            success: true,
            status: 'confirmed_reload_pending',
            syncWarning: warningMessage,
          };
        }
      }

      if (res.status === 'uncertain') {
        // Resultado incierto: NO llamar a fetchProducts silenciosamente, NO alterar el saldo local.
        // Se preserva la misma clave UUID y payload en el cliente para reintento manual seguro.
        return {
          success: false,
          status: 'uncertain',
          uncertain: true,
          error:
            res.message ||
            'Error de red durante el ajuste de existencias. El resultado en el servidor sigue sin confirmarse; no inicie un nuevo ajuste para compensar.',
        };
      }

      return {
        success: false,
        status: 'rejected',
        error: res.message || 'Error al registrar el ajuste de existencias.',
      };
    },
    [tenantId, products, isMasterAdmin]
  );

  /**
   * Registra la carga inicial masiva de existencias mediante la RPC public.import_initial_stock.
   * Exclusivo para usuarios con rol master_admin. Refresca el catálogo tras confirmación.
   */
  const importInitialStock = useCallback(
    async (data: InitialStockBatchData): Promise<InitialStockResult> => {
      if (!isMasterAdmin) {
        return {
          success: false,
          status: 'rejected',
          error: 'Acceso denegado: solo el Administrador (master_admin) puede registrar la carga inicial de existencias.',
        };
      }

      if (!data.items || data.items.length === 0) {
        return {
          success: false,
          status: 'rejected',
          error: 'El lote de carga inicial no puede estar vacío.',
        };
      }

      // Validaciones preliminares en cliente
      for (const item of data.items) {
        const prod = products.find((p) => p.id === item.productId);
        if (!prod) {
          return {
            success: false,
            status: 'rejected',
            error: `Producto con identificador ${item.productId} no encontrado en el catálogo.`,
          };
        }
        if (prod.stock !== 0) {
          return {
            success: false,
            status: 'rejected',
            error: `El producto "${prod.name}" ya posee existencias (${prod.stock}). La carga inicial solo admite productos con stock cero. Utilice Ajuste de Stock.`,
          };
        }
        if (['unidad', 'bulto', 'par'].includes(prod.unit) && !Number.isInteger(item.quantity)) {
          return {
            success: false,
            status: 'rejected',
            error: `El producto "${prod.name}" posee unidad indivisible (${prod.unit}) y no admite cantidades fraccionarias con decimales.`,
          };
        }
        if (item.quantity <= 0) {
          return {
            success: false,
            status: 'rejected',
            error: `La cantidad para "${prod.name}" debe ser mayor a cero.`,
          };
        }
        if (item.unitCost < 0) {
          return {
            success: false,
            status: 'rejected',
            error: `El costo unitario inicial para "${prod.name}" no puede ser negativo.`,
          };
        }
      }

      const idempotencyKey = data.idempotencyKey || crypto.randomUUID();

      const res = await importInitialStockRpc({
        companyId: tenantId,
        idempotencyKey,
        items: data.items,
      });

      if (res.status === 'success') {
        const confirmedMovements = res.movements || [];
        const itemsCount = res.itemsCount || confirmedMovements.length;

        try {
          const fresh = await fetchProducts(tenantId, isMasterAdmin);
          if (isMountedRef.current && currentCompanyIdRef.current === tenantId) {
            setProducts(fresh);
            setError(null);
            setSyncWarning(null);
          }
          return {
            success: true,
            status: 'confirmed_synced',
            itemsCount,
            movements: confirmedMovements,
          };
        } catch (reloadErr) {
          console.warn('Error al refrescar productos tras carga inicial confirmada:', reloadErr);

          if (confirmedMovements.length > 0 && isMountedRef.current && currentCompanyIdRef.current === tenantId) {
            const movementMap = new Map(confirmedMovements.map((m) => [m.productId, m]));
            setProducts((prev) =>
              prev.map((p) => {
                const mov = movementMap.get(p.id);
                if (!mov) return p;
                const newStock = mov.quantity;
                return {
                  ...p,
                  stock: newStock,
                  costPrice: mov.unitCost,
                  status: computeStatus(newStock, p.minStock),
                };
              })
            );
          }

          const warningMessage =
            'Carga inicial confirmada en la base de datos, pero la recarga del catálogo falló por conexión. El catálogo está pendiente de sincronización visual.';

          if (isMountedRef.current && currentCompanyIdRef.current === tenantId) {
            setSyncWarning(warningMessage);
          }

          return {
            success: true,
            status: 'confirmed_reload_pending',
            itemsCount,
            movements: confirmedMovements,
            syncWarning: warningMessage,
          };
        }
      }

      if (res.status === 'uncertain') {
        return {
          success: false,
          status: 'uncertain',
          uncertain: true,
          error:
            res.message ||
            'Error de red durante la carga inicial. El resultado en el servidor sigue sin confirmarse; conserve la clave y reintente.',
        };
      }

      return {
        success: false,
        status: 'rejected',
        error: res.message || 'Error al procesar la carga inicial de inventario.',
      };
    },
    [tenantId, products, isMasterAdmin]
  );

  const syncProductsFromTransaction = useCallback((_updatedProducts: Product[]) => {
    // No-op: el stock real es gobernado exclusivamente por el backend PostgreSQL
  }, []);

  return {
    products,
    isLoading,
    error,
    syncWarning,
    clearSyncWarning: () => setSyncWarning(null),
    createProduct,
    updateProduct,
    renameCategoryInProducts,
    deactivateProduct,
    reactivateProduct,
    adjustStock,
    importInitialStock,
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
