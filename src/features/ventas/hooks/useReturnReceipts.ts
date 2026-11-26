import { useCallback, useState } from 'react';
import { useToast } from '@/components/feedback/ToastProvider';
import type { Sale } from '@/features/inventario/types';
import { fetchSaleReturns } from '../api/saleReturnApi';
import type { ReturnReceiptData } from '../returnReceiptTypes';

/** Comprobantes de devolución de una venta: se abren al devolver o desde el botón "Devoluciones". */
export function useReturnReceipts(companyId: string) {
  const { notify } = useToast();
  const [receipt, setReceipt] = useState<{ sale: Sale; returns: ReturnReceiptData[]; number?: string } | null>(null);

  const openReturnReceipts = useCallback(async (sale: Sale, number?: string) => {
    try {
      const returns = await fetchSaleReturns(companyId, sale.id);
      if (returns.length > 0) setReceipt({ sale, returns, number });
    } catch (err) {
      notify({ message: err instanceof Error ? err.message : 'No se pudieron cargar las devoluciones.', tone: 'error' });
    }
  }, [companyId, notify]);

  return { receipt, openReturnReceipts, closeReceipt: () => setReceipt(null) };
}
