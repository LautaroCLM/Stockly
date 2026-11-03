import { useCallback, useRef } from 'react';
import { SaleIntent, markSaleIntentUncertain, resolveSaleIntent } from '../saleIntent';

/**
 * Conserva la clave de idempotencia de la venta en curso entre reintentos del checkout.
 */
export function useSaleIntent() {
  const intentRef = useRef<SaleIntent | null>(null);

  const acquireKey = useCallback((companyId: string, fingerprint: string): string => {
    intentRef.current = resolveSaleIntent(intentRef.current, companyId, fingerprint, () =>
      crypto.randomUUID()
    );
    return intentRef.current.key;
  }, []);

  const markUncertain = useCallback(() => {
    intentRef.current = markSaleIntentUncertain(intentRef.current);
  }, []);

  const reset = useCallback(() => {
    intentRef.current = null;
  }, []);

  return { acquireKey, markUncertain, reset };
}
