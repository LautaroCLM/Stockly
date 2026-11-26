import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/feedback/ToastProvider';
import type { RouteId } from '@/types';
import { toggleHiddenRoute } from '../hiddenRoutes';
import type { HiddenRoutesState } from './useHiddenRoutes';

const SAVED_BADGE_MS = 1800;

/**
 * Mostrar u ocultar módulos con confirmación: la fila muestra "Guardando…" y "Guardado",
 * y un aviso confirma el cambio con Deshacer. Si falla, el interruptor vuelve y avisa el error.
 */
export function useModuleToggle(preferences: HiddenRoutesState, labelOf: (route: RouteId) => string) {
  const { notify } = useToast();
  const [savingRoute, setSavingRoute] = useState<RouteId | null>(null);
  const [savedRoute, setSavedRoute] = useState<RouteId | null>(null);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>();
  const { hidden, save } = preferences;

  useEffect(() => () => clearTimeout(savedTimer.current), []);

  const undoTo = useCallback((previous: RouteId[]) => async () => {
    const result = await save(previous);
    return result.ok ? { ok: true as const } : result;
  }, [save]);

  const toggle = useCallback(async (route: RouteId, visible: boolean) => {
    const previous = hidden;
    setSavingRoute(route);
    setSavedRoute(null);
    const result = await save(toggleHiddenRoute(previous, route, visible));
    setSavingRoute(null);
    if (!result.ok) {
      notify({ message: result.message, tone: 'error' });
      return;
    }
    setSavedRoute(route);
    clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSavedRoute(null), SAVED_BADGE_MS);
    const label = labelOf(route);
    notify({
      message: visible ? `${label} vuelve a verse en tu menú` : `Ocultaste ${label} de tu menú`,
      detail: visible ? undefined : 'Podés volver a mostrarlo cuando quieras.',
      undo: { run: undoTo(previous) },
    });
  }, [hidden, save, labelOf, notify, undoTo]);

  const showAll = useCallback(async () => {
    const previous = hidden;
    setIsSavingAll(true);
    const result = await save([]);
    setIsSavingAll(false);
    if (!result.ok) {
      notify({ message: result.message, tone: 'error' });
      return;
    }
    notify({ message: 'Volviste a ver todos tus módulos', undo: { run: undoTo(previous) } });
  }, [hidden, save, notify, undoTo]);

  return { toggle, showAll, savingRoute, savedRoute, isBusy: savingRoute !== null || isSavingAll, isSavingAll };
}
