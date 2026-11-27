import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOnDataChange } from '@/features/realtime/hooks/useOnDataChange';
import type { DataTable } from '@/features/realtime/changeBus';
import { fetchSellers } from '../api/commissionsApi';
import type { SaleSellerArgs, Seller } from '../types';

const REALTIME_TABLES: readonly DataTable[] = ['employees'];
const storageKey = (companyId: string) => `stockly:last-seller:${companyId}`;

/**
 * Vendedores de la empresa y el elegido para el próximo cobro.
 * Recuerda el último elegido en esta PC (cada caja suele tener su vendedor).
 */
export function useSellers(companyId: string) {
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(() => localStorage.getItem(storageKey(companyId)));

  const reload = useCallback(async () => {
    try {
      setSellers(await fetchSellers(companyId));
    } catch {
      // Sin vendedores: el cobro sigue sin el campo
    }
  }, [companyId]);

  useEffect(() => {
    setSelectedId(localStorage.getItem(storageKey(companyId)));
    void reload();
  }, [companyId, reload]);
  useOnDataChange(REALTIME_TABLES, () => void reload());

  const choices = useMemo(() => sellers.filter((s) => s.canSell), [sellers]);
  const names = useMemo(() => new Map(sellers.map((s) => [s.id, s.name])), [sellers]);
  const selected = choices.find((s) => s.id === selectedId) ?? null;

  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id) localStorage.setItem(storageKey(companyId), id);
    else localStorage.removeItem(storageKey(companyId));
  }, [companyId]);

  const saleArgs: SaleSellerArgs | null = selected ? { employeeId: selected.id, name: selected.name } : null;
  return { sellers, choices, names, selected, select, saleArgs, reload };
}

export type SellersState = ReturnType<typeof useSellers>;
