import { useCallback, useEffect, useState } from 'react';
import { useOnDataChange } from '@/features/realtime/hooks/useOnDataChange';
import type { DataTable } from '@/features/realtime/changeBus';
import { fetchCompanyLogo, removeCompanyLogoRpc, saveCompanyLogoRpc } from '../api/logoApi';
import type { LogoActionResult } from '../api/logoApi';
import { prepareLogo } from '../logoImage';

const REALTIME_TABLES: readonly DataTable[] = ['company_logos'];

/** Logo de la empresa (null si no tiene), en vivo: si lo cambian desde otra PC, se actualiza solo. */
export function useCompanyLogo(companyId: string) {
  const [logo, setLogo] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLogo(await fetchCompanyLogo(companyId));
    } catch {
      // Sin logo se muestran las iniciales: no hace falta avisar
    }
  }, [companyId]);

  useEffect(() => {
    setLogo(null);
    void load();
  }, [load]);

  useOnDataChange(REALTIME_TABLES, () => {
    void load();
  });

  const upload = useCallback(
    async (file: File): Promise<LogoActionResult> => {
      try {
        const result = await saveCompanyLogoRpc(companyId, await prepareLogo(file));
        if (result.ok) await load();
        return result;
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : 'No se pudo procesar la imagen.' };
      }
    },
    [companyId, load]
  );

  const remove = useCallback(async (): Promise<LogoActionResult> => {
    const result = await removeCompanyLogoRpc(companyId);
    if (result.ok) await load();
    return result;
  }, [companyId, load]);

  return { logo, upload, remove };
}
