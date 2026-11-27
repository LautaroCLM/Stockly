import { useCallback, useEffect, useState } from 'react';
import type { RouteId } from '@/types';
import { homeRoute } from '@/features/permisos/access';

/** Pantallas que se pueden abrir con una búsqueda ya escrita. */
export type SearchableRoute = 'inventario' | 'clientes' | 'ventas';

/**
 * Pantalla activa del espacio de trabajo y los pedidos que llegan de otras pantallas:
 * - inicio según el rol (y de nuevo al cambiar de empresa),
 * - búsquedas que abren una pantalla ya filtrada (Inventario, Clientes, Historial de Ventas),
 * - "Reponer stock bajo" desde el Dashboard, que abre Compras con la ventana de reposición.
 */
export function useWorkspaceNavigation(companyId: string, isMasterAdmin: boolean) {
  const [activeRoute, setActiveRoute] = useState<RouteId>(() => homeRoute(isMasterAdmin));
  useEffect(() => {
    setActiveRoute(homeRoute(isMasterAdmin));
  }, [companyId, isMasterAdmin]);

  // Búsqueda pedida para una pantalla; se descarta al salir de ella, para no reaplicar una búsqueda vieja
  const [pageSearch, setPageSearch] = useState<{ route: SearchableRoute; query: string; id: number } | null>(null);
  const searchIn = useCallback((route: SearchableRoute, query: string) => {
    setPageSearch({ route, query, id: Date.now() });
    setActiveRoute(route);
  }, []);
  const searchInventory = useCallback((query: string) => searchIn('inventario', query), [searchIn]);
  useEffect(() => {
    setPageSearch((current) => (current && current.route !== activeRoute ? null : current));
  }, [activeRoute]);
  const searchFor = (route: SearchableRoute) =>
    pageSearch && pageSearch.route === route ? { query: pageSearch.query, id: pageSearch.id } : null;
  const inventorySearch = searchFor('inventario');

  const [restockRequest, setRestockRequest] = useState(0);
  const requestRestock = useCallback(() => {
    setRestockRequest(Date.now());
    setActiveRoute('compras');
  }, []);

  const goHome = useCallback(() => setActiveRoute(homeRoute(isMasterAdmin)), [isMasterAdmin]);

  return {
    activeRoute, setActiveRoute, goHome, inventorySearch, searchInventory, searchIn,
    customerSearch: searchFor('clientes'), salesSearch: searchFor('ventas'), restockRequest, requestRestock,
  };
}
