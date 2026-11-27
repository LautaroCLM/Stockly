import { useCallback, useEffect, useState } from 'react';
import { toUserMessage } from '@/lib/errorMessages';
import { fetchArcaSettings, saveArcaSettingsRpc } from '../api/arcaSettingsApi';
import { EMPTY_ARCA_SETTINGS, type ArcaActionResult, type ArcaSettings } from '../types';

/** Datos de ARCA de la empresa: punto de venta electrónico, inicio de actividades e ingresos brutos. */
export function useArcaSettings(companyId: string) {
  const [settings, setSettings] = useState<ArcaSettings>(EMPTY_ARCA_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    try {
      setSettings(await fetchArcaSettings(companyId));
      setIsLoaded(true);
      setError(null);
    } catch (err) {
      setError(toUserMessage(err, 'No se pudieron cargar los datos de factura electrónica.'));
    }
  }, [companyId]);

  useEffect(() => {
    setIsLoaded(false);
    setSettings(EMPTY_ARCA_SETTINGS);
    void load();
  }, [load]);

  const save = useCallback(
    async (next: ArcaSettings): Promise<ArcaActionResult> => {
      const result = await saveArcaSettingsRpc(companyId, next);
      if (result.ok) await load();
      return result;
    },
    [companyId, load]
  );

  return { settings, isLoaded, error, reload: load, save };
}
