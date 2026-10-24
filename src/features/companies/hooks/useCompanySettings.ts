import { useState, useEffect, useCallback, useRef } from 'react';
import type { CompanySettings } from '../types';
import { fetchCompanySettings, setNegativeStockPolicyRpc } from '../api/companySettingsApi';

export function useCompanySettings(companyId: string) {
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const activeCompanyIdRef = useRef<string>(companyId);
  activeCompanyIdRef.current = companyId;

  const loadSettings = useCallback(async () => {
    if (!companyId) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchCompanySettings(companyId);
      if (activeCompanyIdRef.current === companyId) {
        setSettings(data);
      }
    } catch (err) {
      if (activeCompanyIdRef.current === companyId) {
        setError(err instanceof Error ? err.message : 'Error al cargar configuración de empresa.');
      }
    } finally {
      if (activeCompanyIdRef.current === companyId) {
        setIsLoading(false);
      }
    }
  }, [companyId]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const updateNegativeStockPolicy = useCallback(
    async (allowNegativeStock: boolean, reason: string): Promise<{ success: boolean; error?: string }> => {
      if (!companyId) {
        return { success: false, error: 'Empresa no especificada.' };
      }

      setIsSaving(true);
      setError(null);

      try {
        await setNegativeStockPolicyRpc(companyId, allowNegativeStock, reason);
        // Recargar el estado autoritativo desde Supabase
        await loadSettings();
        return { success: true };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Error al actualizar la política de stock negativo.';
        return { success: false, error: errorMsg };
      } finally {
        setIsSaving(false);
      }
    },
    [companyId, loadSettings]
  );

  return {
    settings,
    isLoading,
    isSaving,
    error,
    reload: loadSettings,
    updateNegativeStockPolicy,
  };
}
