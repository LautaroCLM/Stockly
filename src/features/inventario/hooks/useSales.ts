import { useState, useEffect, useCallback } from 'react';
import { TenantId } from '@/types';
import { Sale } from '../types';
import { INITIAL_MOCK_SALES } from '@/data/mockSales';

export function getSalesStorageKey(tenantId: TenantId): string {
  return `stockly_sales_${tenantId}_v1`;
}

/**
 * Carga de forma segura las ventas desde localStorage.
 * No sobrescribe datos existentes corruptos y evita reinsertar mocks si el usuario ya los eliminó.
 */
export function loadSalesFromStorage(tenantId: TenantId): Sale[] {
  try {
    const raw = localStorage.getItem(getSalesStorageKey(tenantId));
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      console.warn(
        `El contenido de ${getSalesStorageKey(tenantId)} no es un array válido. Se conserva sin sobrescribir.`
      );
      return [];
    }
  } catch (err) {
    console.warn(`Error al leer ventas de ${tenantId} desde localStorage:`, err);
    return [];
  }

  // Si no existe la clave aún (primera ejecución), sembrar únicamente las ventas de demostración de este tenant
  const initial = INITIAL_MOCK_SALES.filter((s) => s.tenantId === tenantId);
  try {
    localStorage.setItem(getSalesStorageKey(tenantId), JSON.stringify(initial));
  } catch (err) {
    console.warn(`Error al guardar ventas iniciales de ${tenantId} en localStorage:`, err);
  }

  return initial;
}

/**
 * Guarda el array de ventas en localStorage con validación de errores de cuota.
 */
export function saveSalesToStorage(tenantId: TenantId, sales: Sale[]): boolean {
  try {
    localStorage.setItem(getSalesStorageKey(tenantId), JSON.stringify(sales));
    return true;
  } catch (err) {
    console.error(`Error al persistir ventas de ${tenantId} en localStorage:`, err);
    return false;
  }
}

/**
 * Calcula de manera determinística el próximo número de comprobante para la empresa.
 * Analiza las ventas existentes para evitar huecos, colisiones o números duplicados.
 */
export function calculateNextSaleNumber(tenantId: TenantId, existingSales: Sale[]): string {
  const numbers: number[] = [];

  for (const sale of existingSales) {
    const match = sale.saleNumber.match(/\d+/);
    if (match) {
      const num = parseInt(match[0], 10);
      if (!isNaN(num)) {
        numbers.push(num);
      }
    }
  }

  let maxNum = numbers.length > 0 ? Math.max(...numbers) : 0;

  // Compatibilidad con la secuencia inicial de ferreteria-central (V-0841, V-0842)
  if (tenantId === 'ferreteria-central' && maxNum < 842) {
    maxNum = 842;
  } else if (tenantId === 'corralon-valle' && maxNum < 1190) {
    maxNum = 1190;
  }

  const nextNum = maxNum + 1;
  return `V-${nextNum.toString().padStart(4, '0')}`;
}

export function useSales(tenantId: TenantId) {
  const [sales, setSales] = useState<Sale[]>(() => loadSalesFromStorage(tenantId));

  // Recargar ventas estrictamente cuando se conmuta de empresa activa
  useEffect(() => {
    setSales(loadSalesFromStorage(tenantId));
  }, [tenantId]);

  // Sincronización en tiempo real entre pestañas
  useEffect(() => {
    function handleStorageChange(e: StorageEvent) {
      if (e.key === getSalesStorageKey(tenantId)) {
        setSales(loadSalesFromStorage(tenantId));
      }
    }
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [tenantId]);

  /**
   * Genera el próximo número correlativo consultando el estado más reciente del almacenamiento.
   */
  const getNextSaleNumber = useCallback((): string => {
    const freshSales = loadSalesFromStorage(tenantId);
    return calculateNextSaleNumber(tenantId, freshSales);
  }, [tenantId]);

  const syncSaleFromTransaction = useCallback((newSale: Sale) => {
    setSales((prev) => [newSale, ...prev.filter((s) => s.id !== newSale.id)]);
  }, []);

  /**
   * Registra una venta completada en el almacenamiento local con protección contra duplicados.
   */
  const recordSale = useCallback(
    (newSale: Sale): { success: boolean; error?: string } => {
      // 1. Validaciones básicas de integridad
      if (!newSale || !newSale.id || !newSale.saleNumber) {
        return { success: false, error: 'Datos de venta incompletos o inválidos.' };
      }

      if (!newSale.items || newSale.items.length === 0) {
        return { success: false, error: 'La venta no contiene productos.' };
      }

      if (newSale.tenantId !== tenantId) {
        return {
          success: false,
          error: `Incoherencia de empresa: la venta pertenece a ${newSale.tenantId} pero la empresa activa es ${tenantId}.`,
        };
      }

      // 2. Prevención de doble confirmación contra el estado fresco en disco
      const freshSales = loadSalesFromStorage(tenantId);
      const isDuplicate = freshSales.some(
        (s) => s.id === newSale.id || s.saleNumber === newSale.saleNumber
      );
      if (isDuplicate) {
        return {
          success: false,
          error: `La venta con número "${newSale.saleNumber}" ya fue registrada previamente.`,
        };
      }

      // 3. Persistencia atómica local
      const updatedSales = [newSale, ...freshSales];
      const saved = saveSalesToStorage(tenantId, updatedSales);

      if (!saved) {
        return {
          success: false,
          error: 'Error de almacenamiento: no se pudo guardar la venta en localStorage. La operación fue abortada.',
        };
      }

      setSales(updatedSales);
      return { success: true };
    },
    [tenantId]
  );

  return {
    sales,
    recordSale,
    getNextSaleNumber,
    syncSaleFromTransaction,
  };
}
