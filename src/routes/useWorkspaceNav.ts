import { useMemo } from 'react';
import type { NavSection } from '@/types';
import { NAV_SECTIONS } from '@/components/layout/navSections';
import { isRouteVisible } from '@/features/permisos/access';
import type { ModuleLevels } from '@/features/permisos/types';
import { applyHiddenRoutes } from '@/features/preferencias/hiddenRoutes';
import type { HiddenRoutesState } from '@/features/preferencias/hooks/useHiddenRoutes';

/**
 * Menú de quien usa la app, en dos capas:
 *  1. `permitted`: lo que sus permisos le dejan ver (seguridad, se aplica también en la base).
 *  2. `visible`: lo anterior sin los módulos que la persona ocultó (solo visual).
 */
export function useWorkspaceNav(
  isMasterAdmin: boolean,
  levels: ModuleLevels | null,
  preferences: HiddenRoutesState
): { permitted: NavSection[]; visible: NavSection[] } {
  const permitted = useMemo(
    () =>
      NAV_SECTIONS.map((section) => ({
        ...section,
        items: section.items.filter((item) => isRouteVisible(item.id, isMasterAdmin, levels)),
      })).filter((section) => section.items.length > 0),
    [isMasterAdmin, levels]
  );

  const visible = useMemo(() => applyHiddenRoutes(permitted, preferences.hiddenSet), [permitted, preferences.hiddenSet]);

  return { permitted, visible };
}
