import { useCallback, useEffect, useRef, useState } from 'react';
import { toUserMessage } from '@/lib/errorMessages';
import { useOnDataChange } from '@/features/realtime/hooks/useOnDataChange';
import type { DataTable } from '@/features/realtime/changeBus';
import { fetchModulePermissions, saveModulePermissions } from '../api/permissionsApi';
import type { ModuleLevels, PermissionsActionResult } from '../types';

const REALTIME_TABLES: readonly DataTable[] = ['company_module_permissions'];

/**
 * Permisos del rol empleado en la empresa, en vivo: si el administrador los cambia,
 * el menú y las pantallas de quien está conectado se actualizan solos.
 * `levels` es null hasta que se cargan.
 */
export function useModulePermissions(companyId: string) {
  const [levels, setLevels] = useState<ModuleLevels | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!companyId) return;
    setError(null);
    try {
      const data = await fetchModulePermissions(companyId);
      if (requestId === requestIdRef.current) setLevels(data);
    } catch (err) {
      // Se conservan los permisos ya cargados ante un corte breve
      if (requestId === requestIdRef.current) setError(toUserMessage(err, 'No se pudieron cargar los permisos.'));
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    setLevels(null);
    setIsLoading(true);
    void load();
    return () => {
      requestIdRef.current += 1;
    };
  }, [load]);

  useOnDataChange(REALTIME_TABLES, () => {
    void load();
  });

  const save = useCallback(
    async (next: ModuleLevels): Promise<PermissionsActionResult> => {
      const result = await saveModulePermissions(companyId, next);
      await load();
      return result;
    },
    [companyId, load]
  );

  return { levels, isLoading, error, reload: load, save };
}
