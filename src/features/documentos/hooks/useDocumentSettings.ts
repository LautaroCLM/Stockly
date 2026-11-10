import { useCallback, useEffect, useState } from 'react';
import { toUserMessage } from '@/lib/errorMessages';
import { useOnDataChange } from '@/features/realtime/hooks/useOnDataChange';
import type { DataTable } from '@/features/realtime/changeBus';
import { fetchDocumentSettings, saveDocumentSettingsRpc } from '../api/documentsApi';
import { DEFAULT_SETTINGS } from '../types';
import type { DocumentActionResult, DocumentSettings } from '../types';

const REALTIME_TABLES: readonly DataTable[] = ['document_settings'];

/** Datos del emisor (domicilio, condición frente al IVA, punto de venta) que salen en cada documento. */
export function useDocumentSettings(companyId: string, enabled: boolean) {
  const [settings, setSettings] = useState<DocumentSettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled || !companyId) return;
    try {
      setSettings(await fetchDocumentSettings(companyId));
      setIsLoaded(true);
      setError(null);
    } catch (err) {
      setError(toUserMessage(err, 'No se pudieron cargar los datos del emisor.'));
    }
  }, [companyId, enabled]);

  useEffect(() => {
    setIsLoaded(false);
    setSettings(DEFAULT_SETTINGS);
    void load();
  }, [load]);

  useOnDataChange(REALTIME_TABLES, () => {
    void load();
  });

  const save = useCallback(
    async (next: DocumentSettings): Promise<DocumentActionResult> => {
      const result = await saveDocumentSettingsRpc(companyId, next);
      if (result.ok) await load();
      return result;
    },
    [companyId, load]
  );

  return { settings, isLoaded, error, save };
}
