import React, { useState } from 'react';
import { AlertTriangle, Loader2, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { NavSection, RouteId } from '@/types';
import type { HiddenRoutesState } from './hooks/useHiddenRoutes';
import { ModuleVisibilityList } from './components/ModuleVisibilityList';
import { toggleHiddenRoute } from './hiddenRoutes';

interface PreferenciasPageProps {
  /** Módulos que la persona tiene permitidos, agrupados como el menú. */
  sections: readonly NavSection[];
  preferences: HiddenRoutesState;
}

/** Preferencias personales: qué módulos ve cada persona en su menú. Solo cambia su vista. */
export const PreferenciasPage: React.FC<PreferenciasPageProps> = ({ sections, preferences }) => {
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { hidden, hiddenSet, isLoading, error } = preferences;

  const persist = async (next: RouteId[]) => {
    setIsSaving(true);
    setSaveError(null);
    const result = await preferences.save(next);
    setIsSaving(false);
    if (!result.ok) setSaveError(result.message);
  };

  const hiddenCount = sections.flatMap((s) => s.items).filter((i) => hiddenSet.has(i.id)).length;

  return (
    <div className="space-y-5 max-w-2xl mx-auto pb-12">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-surface-2 border border-border flex items-center justify-center shrink-0">
          <SlidersHorizontal size={20} className="text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-text-primary">Mis preferencias</h1>
          <p className="text-xs text-text-muted leading-relaxed">
            Elegí qué módulos querés ver en tu menú. Destildá los que no usás y desaparecen solo de tu vista:
            no cambia lo que podés hacer ni lo que ven los demás.
          </p>
        </div>
      </div>

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
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-text-secondary">
              {hiddenCount === 0 ? 'Estás viendo todos tus módulos.' : `${hiddenCount} ${hiddenCount === 1 ? 'módulo oculto' : 'módulos ocultos'}.`}
              {isSaving && <span className="ml-2 text-text-muted">Guardando…</span>}
            </p>
            <Button variant="outline" size="sm" disabled={hiddenCount === 0 || isSaving} onClick={() => void persist([])}>
              Mostrar todos
            </Button>
          </div>

          {saveError && (
            <div className="flex items-start gap-2 p-3 rounded-lg border border-danger/30 bg-danger/10 text-xs text-danger">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />
              <span>{saveError}</span>
            </div>
          )}

          <ModuleVisibilityList
            sections={sections}
            hidden={hiddenSet}
            disabled={isSaving}
            onToggle={(route, visible) => void persist(toggleHiddenRoute(hidden, route, visible))}
          />
        </>
      )}
    </div>
  );
};
