import { toUserMessage } from '@/lib/errorMessages';
import { setProductVatRateRpc, vatNotSavedMessage } from '../api/productVatApi';
import type { VatRate } from '@/features/facturacion/vat';
import { setProductTracksExpiryRpc } from '@/features/vencimientos/api/stockLotsApi';

interface ExtrasChange {
  nextVat: VatRate | undefined;
  currentVat: VatRate;
  nextTracksExpiry: boolean | undefined;
  currentTracksExpiry: boolean;
}

/**
 * Guarda lo que va por RPC aparte del alta/edición (IVA y control de vencimiento), solo si cambió.
 * Devuelve el error para el usuario o null.
 */
export async function saveProductExtras(companyId: string, productId: string, c: ExtrasChange): Promise<string | null> {
  if (c.nextVat !== undefined && c.nextVat !== c.currentVat) {
    try {
      await setProductVatRateRpc(companyId, productId, c.nextVat);
    } catch (err) {
      return vatNotSavedMessage(toUserMessage(err, 'error de conexión'));
    }
  }
  if (c.nextTracksExpiry !== undefined && c.nextTracksExpiry !== c.currentTracksExpiry) {
    const result = await setProductTracksExpiryRpc(companyId, productId, c.nextTracksExpiry);
    if (!result.ok) return `El producto se guardó, pero no el control de vencimiento (${result.message}). Editalo para corregirlo.`;
  }
  return null;
}
