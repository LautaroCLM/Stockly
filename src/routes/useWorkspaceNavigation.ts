import { useCallback, useEffect, useState } from 'react';
import type { RouteId } from '@/types';
import { homeRoute } from '@/features/permisos/access';

/**
 * Pantalla activa del espacio de trabajo y los pedidos que llegan de otras pantallas:
 * - inicio según el rol (y de nuevo al cambiar de empresa),
 * - búsqueda del encabezado, que abre Inventario filtrado,
 * - "Reponer stock bajo" desde el Dashboard, que abre Compras con la ventana de reposición.
 */
export function useWorkspaceNavigation(companyId: string, isMasterAdmin: boolean) {
  const [activeRoute, setActiveRoute] = useState<RouteId>(() => homeRoute(isMasterAdmin));
  useEffect(() => {
    setActiveRoute(homeRoute(isMasterAdmin));
  }, [companyId, isMasterAdmin]);

  // Se descarta al salir de Inventario, para no reaplicar una búsqueda vieja
  const [inventorySearch, setInventorySearch] = useState<{ query: string; id: number } | null>(null);
  const searchInventory = useCallback((query: string) => {
    setInventorySearch({ query, id: Date.now() });
    setActiveRoute('inventario');
  }, []);
  useEffect(() => {
    if (activeRoute !== 'inventario') setInventorySearch(null);
  }, [activeRoute]);

  const [restockRequest, setRestockRequest] = useState(0);
  const requestRestock = useCallback(() => {
    setRestockRequest(Date.now());
    setActiveRoute('compras');
  }, []);

  const goHome = useCallback(() => setActiveRoute(homeRoute(isMasterAdmin)), [isMasterAdmin]);

  return { activeRoute, setActiveRoute, goHome, inventorySearch, searchInventory, restockRequest, requestRestock };
}
