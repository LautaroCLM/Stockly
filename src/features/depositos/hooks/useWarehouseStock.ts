import { useCallback, useEffect, useState } from 'react';
import { toUserMessage } from '@/lib/errorMessages';
import { useOnDataChange } from '@/features/realtime/hooks/useOnDataChange';
import type { DataTable } from '@/features/realtime/changeBus';
import { fetchStockByWarehouse, fetchTransfers } from '../api/warehousesApi';
import type { StockByWarehouse, StockTransfer } from '../types';

const REALTIME_TABLES: readonly DataTable[] = ['stock_movements', 'stock_transfers', 'warehouses'];

/** Stock por depósito y últimas transferencias; se recargan cuando cambia el stock en cualquier PC. */
export function useWarehouseStock(companyId: string) {
  const [stock, setStock] = useState<StockByWarehouse | null>(null);
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([fetchStockByWarehouse(companyId), fetchTransfers(companyId)]);
      setStock(s);
      setTransfers(t);
      setError(null);
    } catch (err) {
      setError(toUserMessage(err, 'No se pudo cargar el stock por depósito.'));
    }
  }, [companyId]);

  useEffect(() => {
    setStock(null);
    void reload();
  }, [reload]);
  useOnDataChange(REALTIME_TABLES, () => void reload());

  return { stock, transfers, error, reload };
}
