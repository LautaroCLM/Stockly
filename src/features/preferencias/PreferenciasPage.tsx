import React, { useCallback, useMemo } from 'react';
import { AlertTriangle, Eye, EyeOff, Loader2, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { NavSection, RouteId } from '@/types';
import type { HiddenRoutesState } from './hooks/useHiddenRoutes';
import { useModuleToggle } from './hooks/useModuleToggle';
import { ModuleVisibilityList } from './components/ModuleVisibilityList';
import { CartEffectsCard } from './components/CartEffectsCard';

interface PreferenciasPageProps {
  /** Módulos que la persona tiene permitidos, agrupados como el menú. */
  sections: readonly NavSection[];
  preferences: HiddenRoutesState;
}

/** Preferencias personales: qué módulos ve cada persona en su menú. Solo cambia su vista. */
export const PreferenciasPage: React.FC<PreferenciasPageProps> = ({ sections, preferences }) => {
  const { hiddenSet, isLoading, error } = preferences;
  const items = useMemo(() => sections.flatMap((s) => s.items), [sections]);
  const labelOf = useCallback((route: RouteId) => items.find((i) => i.id === route)?.label ?? 'El módulo', [items]);
  const modules = useModuleToggle(preferences, labelOf);

  const hiddenCount = items.filter((i) => hiddenSet.has(i.id)).length;
  const visibleCount = items.length - hiddenCount;

  return (
    <div className="space-y-5 max-w-2xl mx-auto pb-12">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-surface-2 border border-border flex items-center justify-center shrink-0">
          <SlidersHorizontal size={20} className="text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-text-primary">Mis preferencias</h1>
          <p className="text-xs text-text-muted leading-relaxed">
            Elegí qué módulos querés ver en tu menú. Los que apagues desaparecen solo de tu vista:
            no cambia lo que podés hacer ni lo que ven los demás.
          </p>
        </div>
      </div>

      <CartEffectsCard />

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-text-muted">
          <Loader2 size={16} className="animate-spin" /> Cargando tus preferencias…
        </div>
      ) : error ? (
        <div className="flex items-start gap-2 p-3 rounded-lg border border-danger/30 bg-danger/10 text-xs text-danger">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" />
          <span>{error} Mientras tanto ves todos tus módulos. Recargá la página para reintentar.</span>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border bg-surface">
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5 text-text-secondary">
                <Eye size={14} className="text-primary" /><strong className="text-text-primary tabular-nums">{visibleCount}</strong> visibles
              </span>
              <span className="flex items-center gap-1.5 text-text-secondary">
                <EyeOff size={14} className="text-text-muted" /><strong className="text-text-primary tabular-nums">{hiddenCount}</strong> ocultos
              </span>
            </div>
            <Button variant="outline" size="sm" disabled={hiddenCount === 0 || modules.isBusy} onClick={() => void modules.showAll()}>
              {modules.isSavingAll ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />}
              <span>Mostrar todos</span>
            </Button>
          </div>

          <ModuleVisibilityList
            sections={sections}
            hidden={hiddenSet}
            disabled={modules.isBusy}
            savingRoute={modules.savingRoute}
            savedRoute={modules.savedRoute}
            onToggle={(route, visible) => void modules.toggle(route, visible)}
          />
        </>
      )}
    </div>
  );
};
