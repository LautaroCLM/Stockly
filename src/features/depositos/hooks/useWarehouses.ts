import { useCallback, useEffect, useMemo, useState } from 'react';
import { setRequestWarehouse } from '@/lib/requestWarehouse';
import { useOnDataChange } from '@/features/realtime/hooks/useOnDataChange';
import type { DataTable } from '@/features/realtime/changeBus';
import { fetchWarehouses } from '../api/warehousesApi';
import type { Warehouse } from '../types';

const REALTIME_TABLES: readonly DataTable[] = ['warehouses'];
const storageKey = (companyId: string) => `stockly:warehouse:${companyId}`;

/**
 * Depósitos de la empresa y el elegido en esta PC. El elegido se guarda en esta PC y viaja en
 * cada pedido a la base; si deja de existir o se desactiva, se vuelve al principal.
 */
export function useWarehouses(companyId: string) {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [chosenId, setChosenId] = useState<string | null>(() => localStorage.getItem(storageKey(companyId)));
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setWarehouses(await fetchWarehouses(companyId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los depósitos.');
    }
  }, [companyId]);

  useEffect(() => {
    setChosenId(localStorage.getItem(storageKey(companyId)));
    void reload();
  }, [companyId, reload]);
  useOnDataChange(REALTIME_TABLES, () => void reload());

  const active = useMemo(() => warehouses.filter((w) => w.isActive), [warehouses]);
  const defaultWarehouse = active.find((w) => w.isDefault) ?? null;
  const current = active.find((w) => w.id === chosenId) ?? defaultWarehouse;

  // Lo que viaja en cada pedido: el elegido (null = principal, también antes de cargar la lista)
  const effectiveId = current && !current.isDefault ? current.id : null;
  useEffect(() => {
    setRequestWarehouse(effectiveId);
  }, [effectiveId]);
  useEffect(() => () => setRequestWarehouse(null), [companyId]);

  const choose = useCallback((id: string) => {
    setChosenId(id);
    localStorage.setItem(storageKey(companyId), id);
  }, [companyId]);

  const names = useMemo(() => new Map(warehouses.map((w) => [w.id, w.name])), [warehouses]);
  return { warehouses, active, current, defaultWarehouse, isMulti: active.length > 1, choose, names, error, reload };
}

export type WarehousesState = ReturnType<typeof useWarehouses>;
