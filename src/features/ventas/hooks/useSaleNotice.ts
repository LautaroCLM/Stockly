import { useCallback } from 'react';
import { useToast } from '@/components/feedback/ToastProvider';
import type { UndoResult } from '@/components/feedback/toastQueue';
import { formatCurrency } from '@/lib/formatters';
import type { Sale } from '@/features/inventario/types';
import { cancelSaleRpc } from '../api/saleCancellationApi';

const UNDO_REASON = 'Deshecha desde el aviso, justo después de registrarla.';

interface SaleNoticeOptions {
  companyId: string;
  /** Solo quien puede anular ventas ve el botón Deshacer. */
  canCancel: boolean;
  /** Después de deshacer: recargar el stock y cerrar el comprobante. */
  onUndone: () => void;
}

/** Aviso "Venta registrada" con la opción de deshacerla (se anula y el stock vuelve). */
export function useSaleNotice({ companyId, canCancel, onUndone }: SaleNoticeOptions) {
  const { notify } = useToast();

  return useCallback((sale: Sale) => {
    const undo = async (): Promise<UndoResult> => {
      const result = await cancelSaleRpc(companyId, sale.id, UNDO_REASON);
      if (result.status !== 'cancelled') return { ok: false, message: result.message };
      onUndone();
      return { ok: true };
    };
    notify({
      message: `Venta ${sale.saleNumber} registrada`,
      detail: `${formatCurrency(sale.total)} · ${sale.clientName}`,
      undo: canCancel ? { label: 'Deshacer', run: undo } : undefined,
    });
  }, [companyId, canCancel, onUndone, notify]);
}
