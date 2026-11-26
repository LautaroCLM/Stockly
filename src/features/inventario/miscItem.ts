import { fromHundredths, multiplyToCents, parseHundredths } from '@/lib/decimal';
import type { CartItem } from './types';

/** Las líneas de "artículo varios" no tienen producto: se las reconoce por este prefijo en productId. */
const MISC_PREFIX = 'misc:';

export const isMiscItem = (item: Pick<CartItem, 'productId'>): boolean => item.productId.startsWith(MISC_PREFIX);

export const MISC_DESCRIPTION_MAX = 120;

/**
 * Valida lo que se escribe para un artículo varios y arma la línea del carrito.
 * Devuelve el mensaje de error si algo no es válido.
 */
export function buildMiscItem(description: string, priceText: string, quantityText: string, id: string): CartItem | string {
  const name = description.trim();
  if (!name) return 'Escribí qué estás vendiendo.';
  if (name.length > MISC_DESCRIPTION_MAX) return `La descripción puede tener hasta ${MISC_DESCRIPTION_MAX} caracteres.`;
  const priceCents = parseHundredths(priceText);
  if (priceCents === null) return 'Ingresá un precio válido (por ejemplo 1500 o 1500,50).';
  const qty = parseHundredths(quantityText.trim() === '' ? '1' : quantityText);
  if (qty === null || qty === 0) return 'La cantidad tiene que ser mayor a 0.';
  const unitPrice = fromHundredths(priceCents);
  const quantity = fromHundredths(qty);
  return {
    productId: `${MISC_PREFIX}${id}`,
    sku: 'VARIOS',
    name,
    unitPrice,
    quantity,
    subtotal: fromHundredths(multiplyToCents(priceCents, qty)),
    currentStock: 0,
  };
}
