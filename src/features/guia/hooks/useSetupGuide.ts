import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchSetupProgress } from '../api/setupProgressApi';
import { buildSetupSteps, countDone, shouldShowGuide, type SetupProgress } from '../setupSteps';

type LoadedProgress = Omit<SetupProgress, 'productCount'>;

const dismissKey = (companyId: string) => `stockly_setup_guide_hidden_${companyId}`;

/** "Ocultar guía" es una comodidad de este equipo: si el navegador no deja guardar, simplemente vuelve a aparecer. */
function readDismissed(companyId: string): boolean {
  try {
    return localStorage.getItem(dismissKey(companyId)) === '1';
  } catch {
    return false;
  }
}

/** Avance de los primeros pasos de la empresa. Si no se puede leer, la guía no se muestra (no bloquea nada). */
export function useSetupGuide(companyId: string, productCount: number, enabled: boolean) {
  const [progress, setProgress] = useState<LoadedProgress | null>(null);
  const [dismissed, setDismissed] = useState(() => readDismissed(companyId));

  const load = useCallback(async () => {
    try {
      setProgress(await fetchSetupProgress(companyId));
    } catch {
      setProgress(null);
    }
  }, [companyId]);

  useEffect(() => {
    setProgress(null);
    setDismissed(readDismissed(companyId));
    if (enabled) void load();
  }, [companyId, enabled, load]);

  const steps = useMemo(() => (progress ? buildSetupSteps({ ...progress, productCount }) : []), [progress, productCount]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem(dismissKey(companyId), '1');
    } catch {
      // Sin almacenamiento disponible se oculta solo por esta vez
    }
  }, [companyId]);

  return {
    steps,
    doneCount: countDone(steps),
    isVisible: enabled && steps.length > 0 && shouldShowGuide(steps, dismissed),
    dismiss,
  };
}
