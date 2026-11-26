import { useEffect, useState } from 'react';
import type { PurchaseDraftItem } from '../types';
import { newDraftItem, withQuantity } from '../purchaseDraft';
import type { RestockSelection } from '../components/RestockModal';

/**
 * Reponer stock bajo desde Compras: abre la ventana (también a pedido del Dashboard)
 * y, al registrar la compra recibida, deja el formulario de compra ya cargado.
 */
export function useRestockFlow(restockRequest: number | undefined) {
  const [isRestockOpen, setIsRestockOpen] = useState(false);
  const [draft, setDraft] = useState<{ supplierId: string; items: PurchaseDraftItem[] } | null>(null);

  // Cada pedido nuevo del Dashboard trae otro número: abre la ventana
  useEffect(() => {
    if (restockRequest) setIsRestockOpen(true);
  }, [restockRequest]);

  const registerFromRestock = (selection: RestockSelection) => {
    setDraft({
      supplierId: selection.supplierId,
      items: selection.lines.map(({ product, quantity }) => withQuantity(newDraftItem(product), quantity)),
    });
    setIsRestockOpen(false);
  };

  return {
    isRestockOpen,
    openRestock: () => setIsRestockOpen(true),
    closeRestock: () => setIsRestockOpen(false),
    draft,
    clearDraft: () => setDraft(null),
    registerFromRestock,
  };
}
