import type { RouteId } from '@/types';
import { NAV_SECTIONS } from '@/components/layout/navSections';

const KNOWN_ROUTES: ReadonlySet<string> = new Set(NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.id)));

const isKnownRoute = (value: unknown): value is RouteId => typeof value === 'string' && KNOWN_ROUTES.has(value);

/**
 * Lo que viene de la base se valida: un módulo que ya no existe en la app
 * (por ejemplo, uno renombrado) o un valor inválido se descarta en vez de romper el menú.
 */
export function parseHiddenRoutes(value: unknown): RouteId[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(isKnownRoute))].sort();
}
