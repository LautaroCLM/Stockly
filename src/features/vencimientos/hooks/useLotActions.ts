import { useCallback } from 'react';
import { setExpiryWarningDaysRpc, splitStockLotRpc, updateStockLotRpc, writeOffStockLotRpc } from '../api/stockLotsApi';
import type { LotActionResult, StockLot } from '../types';

/** Acciones sobre lotes; después de cada una se recargan los lotes (y el catálogo si cambió el stock). */
export function useLotActions(companyId: string, reloadLots: () => Promise<void>, onStockChanged?: () => void) {
  const after = useCallback(
    async (result: LotActionResult, stockChanged = false): Promise<LotActionResult> => {
      if (result.ok) {
        await reloadLots();
        if (stockChanged) onStockChanged?.();
      }
      return result;
    },
    [reloadLots, onStockChanged]
  );

  const edit = useCallback(
    async (lot: StockLot, lotCode: string, expiresOn: string) => after(await updateStockLotRpc(companyId, lot.id, lotCode, expiresOn)),
    [companyId, after]
  );
  const split = useCallback(
    async (lot: StockLot, quantity: number, lotCode: string, expiresOn: string) =>
      after(await splitStockLotRpc(companyId, lot.id, quantity, lotCode, expiresOn)),
    [companyId, after]
  );
  // Una clave por intento: si la red corta y se reintenta, la base no descuenta dos veces
  const writeOff = useCallback(
    async (lot: StockLot) => after(await writeOffStockLotRpc(companyId, lot.id, crypto.randomUUID()), true),
    [companyId, after]
  );
  const setWarningDays = useCallback(
    async (days: number) => after(await setExpiryWarningDaysRpc(companyId, days)),
    [companyId, after]
  );

  return { edit, split, writeOff, setWarningDays };
}
