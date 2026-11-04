import { useCallback } from 'react';
import { toUserMessage } from '@/lib/errorMessages';
import type { ProductFormData } from '../types';
import { createProductRpc, setProductActiveRpc } from '../api/productsApi';
import { updateProductRpc } from '../api/productUpdateApi';
import { isNetworkOrUncertainError } from '@/lib/errorMessages';
import type { CatalogContext, ProductOperationResult } from './catalogContext';

/** Alta, modificación, desactivación y reactivación de productos. */
export function useProductMutations(ctx: CatalogContext) {
  const { tenantId, isMasterAdmin, products, fetchAndApply } = ctx;

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
        const fresh = await fetchAndApply();
        return { success: true, product: fresh.find((p) => p.id === newId) };
      } catch (err) {
        if (!isNetworkOrUncertainError(err)) {
          return { success: false, error: toUserMessage(err, 'Error al crear el producto.') };
        }
        // Recuperación: PostgreSQL pudo aplicar la inserción antes del corte
        try {
          const maybeCreated = (await fetchAndApply()).find((p) => p.sku === cleanSku);
          if (maybeCreated) return { success: true, product: maybeCreated };
        } catch {
          // Sin conexión para verificar: el resultado sigue incierto
        }
        return {
          success: false,
          uncertain: true,
          error:
            'Error de comunicación con el servidor al crear el producto. El resultado es incierto; por favor verifique si el producto aparece en el catálogo antes de reintentar.',
        };
      }
    },
    [tenantId, fetchAndApply]
  );

  const updateProduct = useCallback(
    async (id: string, formData: ProductFormData): Promise<ProductOperationResult> => {
      const existing = products.find((p) => p.id === id);
      if (!existing) return { success: false, error: 'Producto no encontrado.' };

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

      // Si hubo cambios o el resultado es incierto, se relee el catálogo real del servidor
      if (execResult.generalDataSaved || execResult.status === 'uncertain') {
        try {
          const updated = (await fetchAndApply()).find((p) => p.id === id);
          if (execResult.status === 'success') return { success: true, product: updated };
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

      if (execResult.status === 'success') return { success: true };
      return {
        success: false,
        partial: execResult.status === 'partial',
        uncertain: execResult.status === 'uncertain',
        error: execResult.message || 'Error al actualizar el producto.',
      };
    },
    [tenantId, products, isMasterAdmin, fetchAndApply]
  );

  const setProductActive = useCallback(
    async (id: string, active: boolean): Promise<ProductOperationResult> => {
      const existing = products.find((p) => p.id === id);
      if (!existing) return { success: false, error: 'Producto no encontrado.' };
      const verb = active ? 'reactivar' : 'desactivar';

      try {
        await setProductActiveRpc(tenantId, existing, active);
        await fetchAndApply();
        return { success: true };
      } catch (err) {
        if (!isNetworkOrUncertainError(err)) {
          return { success: false, error: toUserMessage(err, `Error al ${verb} el producto.`) };
        }
        try {
          const updated = (await fetchAndApply()).find((p) => p.id === id);
          if (updated && Boolean(updated.isActive) === active) return { success: true, product: updated };
        } catch {
          // Sin conexión para verificar: el resultado sigue incierto
        }
        return {
          success: false,
          uncertain: true,
          error: `Error de red al ${verb} el producto. El estado en la base de datos es incierto; por favor verifique antes de reintentar.`,
        };
      }
    },
    [tenantId, products, fetchAndApply]
  );

  const deactivateProduct = useCallback((id: string) => setProductActive(id, false), [setProductActive]);
  const reactivateProduct = useCallback((id: string) => setProductActive(id, true), [setProductActive]);

  return { createProduct, updateProduct, deactivateProduct, reactivateProduct };
}
