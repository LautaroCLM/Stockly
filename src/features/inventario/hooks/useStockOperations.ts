import { useCallback } from 'react';
import type { InitialStockBatchData, InitialStockResult, StockAdjustmentData, StockAdjustmentResult } from '../types';
import { computeStatus } from '../api/productsApi';
import { registerStockAdjustmentRpc } from '../api/stockMovementsApi';
import { registerPhysicalCountRpc } from '../api/physicalCountApi';
import { importInitialStockRpc } from '../api/initialStockApi';
import { validateInitialStockBatch, validateStockAdjustment } from '../stockValidation';
import type { CatalogContext } from './catalogContext';

const ADMIN_ONLY = 'Acceso denegado: solo el Administrador (master_admin) puede';

/**
 * Ajustes de stock y carga inicial. Tras un éxito confirmado por la base se relee el
 * catálogo; si esa relectura falla, se corrige en memoria con el saldo que devolvió la base.
 */
export function useStockOperations(ctx: CatalogContext) {
  const { tenantId, isMasterAdmin, products, fetchAndApply, patchProducts, setSyncWarning } = ctx;

  const adjustStock = useCallback(
    async (data: StockAdjustmentData): Promise<StockAdjustmentResult> => {
      if (!isMasterAdmin) {
        return { success: false, status: 'rejected', error: `${ADMIN_ONLY} registrar ajustes de existencias.` };
      }
      const invalid = validateStockAdjustment(data, products.find((p) => p.id === data.productId));
      if (invalid) return { success: false, status: 'rejected', error: invalid };

      const idempotencyKey = data.idempotencyKey || crypto.randomUUID();
      // El conteo físico envía el valor absoluto: el servidor calcula la diferencia bajo bloqueo
      const res =
        data.reason === 'physical_count'
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

      if (res.status === 'uncertain') {
        // Resultado incierto: no se toca el saldo local; el reintento usa la misma clave
        return {
          success: false,
          status: 'uncertain',
          uncertain: true,
          error:
            res.message ||
            'Error de red durante el ajuste de existencias. El resultado en el servidor sigue sin confirmarse; no inicie un nuevo ajuste para compensar.',
        };
      }
      if (res.status !== 'success') {
        return { success: false, status: 'rejected', error: res.message || 'Error al registrar el ajuste de existencias.' };
      }

      try {
        await fetchAndApply();
        return { success: true, status: 'confirmed_synced' };
      } catch (reloadErr) {
        console.warn('Error al refrescar productos tras ajuste de stock confirmado:', reloadErr);
        const newStock = res.newStock;
        const hasValidNewStock = typeof newStock === 'number' && !Number.isNaN(newStock);
        if (hasValidNewStock) {
          patchProducts((prev) =>
            prev.map((p) =>
              p.id === data.productId ? { ...p, stock: newStock, status: computeStatus(newStock, p.minStock) } : p
            )
          );
        }
        const warning = hasValidNewStock
          ? `Ajuste confirmado en la base de datos (saldo provisional: ${newStock}), pero la recarga completa del catálogo falló por conexión. Puede reintentar la recarga para sincronizar.`
          : 'Ajuste confirmado en la base de datos, pero la recarga completa del catálogo falló por conexión. El catálogo está pendiente de sincronización.';
        setSyncWarning(warning);
        return { success: true, status: 'confirmed_reload_pending', syncWarning: warning };
      }
    },
    [tenantId, products, isMasterAdmin, fetchAndApply, patchProducts, setSyncWarning]
  );

  const importInitialStock = useCallback(
    async (data: InitialStockBatchData): Promise<InitialStockResult> => {
      if (!isMasterAdmin) {
        return { success: false, status: 'rejected', error: `${ADMIN_ONLY} registrar la carga inicial de existencias.` };
      }
      const invalid = validateInitialStockBatch(data, products);
      if (invalid) return { success: false, status: 'rejected', error: invalid };

      const res = await importInitialStockRpc({
        companyId: tenantId,
        idempotencyKey: data.idempotencyKey || crypto.randomUUID(),
        items: data.items,
      });

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
      if (res.status !== 'success') {
        return { success: false, status: 'rejected', error: res.message || 'Error al procesar la carga inicial de inventario.' };
      }

      const movements = res.movements || [];
      const itemsCount = res.itemsCount || movements.length;
      try {
        await fetchAndApply();
        return { success: true, status: 'confirmed_synced', itemsCount, movements };
      } catch (reloadErr) {
        console.warn('Error al refrescar productos tras carga inicial confirmada:', reloadErr);
        if (movements.length > 0) {
          const byProduct = new Map(movements.map((m) => [m.productId, m]));
          patchProducts((prev) =>
            prev.map((p) => {
              const mov = byProduct.get(p.id);
              return mov
                ? { ...p, stock: mov.quantity, costPrice: mov.unitCost, status: computeStatus(mov.quantity, p.minStock) }
                : p;
            })
          );
        }
        const warning =
          'Carga inicial confirmada en la base de datos, pero la recarga del catálogo falló por conexión. El catálogo está pendiente de sincronización visual.';
        setSyncWarning(warning);
        return { success: true, status: 'confirmed_reload_pending', itemsCount, movements, syncWarning: warning };
      }
    },
    [tenantId, products, isMasterAdmin, fetchAndApply, patchProducts, setSyncWarning]
  );

  return { adjustStock, importInitialStock };
}
