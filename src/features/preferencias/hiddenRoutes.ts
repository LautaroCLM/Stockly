import type { NavSection, RouteId } from '@/types';

/** Inicio nunca se puede ocultar: el menú no debe quedar vacío. */
export const ALWAYS_VISIBLE_ROUTES: ReadonlySet<RouteId> = new Set<RouteId>(['dashboard']);

export const canHideRoute = (route: RouteId): boolean => !ALWAYS_VISIBLE_ROUTES.has(route);

/**
 * Quita del menú los módulos que la persona ocultó. Las secciones que quedan
 * sin módulos desaparecen. Inicio se muestra siempre.
 */
export function applyHiddenRoutes(sections: readonly NavSection[], hidden: ReadonlySet<RouteId>): NavSection[] {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !hidden.has(item.id) || !canHideRoute(item.id)),
    }))
    .filter((section) => section.items.length > 0);
}

/** Marca o desmarca un módulo. Devuelve la nueva lista, ordenada y sin repetidos. */
export function toggleHiddenRoute(hidden: readonly RouteId[], route: RouteId, visible: boolean): RouteId[] {
  if (!canHideRoute(route)) return [...hidden];
  const next = new Set(hidden);
  if (visible) next.delete(route);
  else next.add(route);
  return [...next].sort();
}
