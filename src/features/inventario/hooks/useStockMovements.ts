import { useState, useEffect, useCallback } from 'react';
import { TenantId } from '@/types';
import { StockMovement } from '../types';

export function getMovementStorageKey(tenantId: TenantId): string {
  return `stockly_movements_${tenantId}_v1`;
}

function getInitialMockMovements(tenantId: TenantId): StockMovement[] {
  const timestamp = new Date(Date.now() - 3600000 * 24).toISOString();
  if (tenantId === 'ferreteria-central') {
    return [
      {
        id: 'mov-fc-init-01',
        companyId: 'ferreteria-central',
        productId: 'prod-fc-06',
        productName: 'Amoladora Angular DeWalt DWE4020 800W 115mm',
        productSku: 'FER-3301',
        direction: 'increase',
        reason: 'initial_load',
        quantity: 12,
        previousStock: 0,
        newStock: 12,
        referenceDoc: 'ACTA-INV-001',
        notes: 'Carga inicial de inventario en salón',
        createdBy: 'Lautaro C. (Master Admin)',
        createdAt: timestamp,
      },
      {
        id: 'mov-fc-init-02',
        companyId: 'ferreteria-central',
        productId: 'prod-fc-01',
        productName: 'Disco de Corte Sensitiva 355x3mm Norton Classic',
        productSku: 'FER-0492',
        direction: 'decrease',
        reason: 'sale',
        quantity: 2,
        previousStock: 0,
        newStock: -2,
        referenceSaleId: 'sale-fc-01',
        referenceDoc: 'V-0842',
        notes: 'Descuento por venta mostrador #V-0842',
        createdBy: 'Lautaro C. (Master Admin)',
        createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
      },
    ];
  }
  return [];
}

export function loadMovementsFromStorage(tenantId: TenantId): StockMovement[] {
  try {
    const raw = localStorage.getItem(getMovementStorageKey(tenantId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn(`Error al leer movimientos de stock para ${tenantId}:`, err);
  }

  const initial = getInitialMockMovements(tenantId);
  try {
    localStorage.setItem(getMovementStorageKey(tenantId), JSON.stringify(initial));
  } catch (err) {
    console.warn(`Error al guardar movimientos iniciales de ${tenantId}:`, err);
  }
  return initial;
}

export function saveMovementsToStorage(tenantId: TenantId, movements: StockMovement[]): boolean {
  try {
    localStorage.setItem(getMovementStorageKey(tenantId), JSON.stringify(movements));
    return true;
  } catch (err) {
    console.error(`Error al persistir movimientos de stock para ${tenantId}:`, err);
    return false;
  }
}

export function useStockMovements(tenantId: TenantId) {
  const [movements, setMovements] = useState<StockMovement[]>(() => loadMovementsFromStorage(tenantId));

  useEffect(() => {
    setMovements(loadMovementsFromStorage(tenantId));
  }, [tenantId]);

  // Sincronización reactiva entre pestañas
  useEffect(() => {
    function handleStorageChange(e: StorageEvent) {
      if (e.key === getMovementStorageKey(tenantId)) {
        setMovements(loadMovementsFromStorage(tenantId));
      }
    }
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [tenantId]);

  const syncMovementsFromTransaction = useCallback((newMovements: StockMovement[]) => {
    setMovements((prev) => [...newMovements, ...prev]);
  }, []);

  const recordMovement = useCallback(
    (newMovement: StockMovement): boolean => {
      let success = false;
      setMovements((prev) => {
        const next = [newMovement, ...prev];
        success = saveMovementsToStorage(tenantId, next);
        return success ? next : prev;
      });
      return success;
    },
    [tenantId]
  );

  const recordBatchMovements = useCallback(
    (newMovements: StockMovement[]): boolean => {
      if (newMovements.length === 0) return true;
      let success = false;
      setMovements((prev) => {
        const next = [...newMovements, ...prev];
        success = saveMovementsToStorage(tenantId, next);
        return success ? next : prev;
      });
      return success;
    },
    [tenantId]
  );

  return {
    movements,
    recordMovement,
    recordBatchMovements,
    syncMovementsFromTransaction,
  };
}
