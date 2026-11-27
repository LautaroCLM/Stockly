import type { RouteId } from '@/types';
import { NAV_SECTIONS } from '@/components/layout/navSections';
import { OPT_IN_ROUTES } from './hiddenRoutes';

const KNOWN_ROUTES: ReadonlySet<string> = new Set(NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.id)));

const isKnownRoute = (value: unknown): value is RouteId => typeof value === 'string' && KNOWN_ROUTES.has(value);

/** Marca guardada para un módulo que viene oculto y la persona activó (ej. "show:municipio"). */
const SHOW_PREFIX = 'show:';
const OPT_IN: ReadonlySet<RouteId> = new Set(OPT_IN_ROUTES);

/**
 * Lo que viene de la base, como lista de módulos ocultos. Los que vienen ocultos por defecto
 * están ocultos salvo que haya una marca "show:". Un módulo que ya no existe en la app
 * (por ejemplo, uno renombrado) o un valor inválido se descarta en vez de romper el menú.
 */
export function parseHiddenRoutes(value: unknown): RouteId[] {
  const stored = Array.isArray(value) ? value : [];
  const shown = new Set(
    stored.filter((v): v is string => typeof v === 'string' && v.startsWith(SHOW_PREFIX)).map((v) => v.slice(SHOW_PREFIX.length))
  );
  const hidden = new Set(stored.filter(isKnownRoute).filter((r) => !OPT_IN.has(r)));
  for (const route of OPT_IN_ROUTES) if (!shown.has(route)) hidden.add(route);
  return [...hidden].sort();
}

/** Lista de módulos ocultos a lo que se guarda: los que vienen ocultos se guardan solo si se activaron. */
export function serializeHiddenRoutes(hidden: readonly RouteId[]): string[] {
  const set = new Set(hidden);
  const normal = [...set].filter((r) => !OPT_IN.has(r));
  const shown = OPT_IN_ROUTES.filter((r) => !set.has(r)).map((r) => `${SHOW_PREFIX}${r}`);
  return [...normal, ...shown].sort();
}
