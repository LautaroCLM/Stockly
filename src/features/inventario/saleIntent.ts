/**
 * Intención de venta: decide qué clave de idempotencia usar en cada intento de cobro.
 *
 * process_sale devuelve la venta original cuando recibe una clave ya confirmada, así que
 * reutilizar la clave entre reintentos evita registrar dos veces la misma venta.
 */
export interface SaleIntent {
  companyId: string;
  key: string;
  fingerprint: string;
  /** El último intento terminó sin confirmar si la venta quedó registrada (corte de red). */
  uncertain: boolean;
}

/**
 * Reutiliza la clave si el pedido es idéntico al anterior, o si el intento anterior quedó
 * incierto en la misma empresa: en ese caso el servidor devuelve la venta original o rechaza
 * el cambio por "mismatch", pero nunca registra una segunda venta.
 */
export function resolveSaleIntent(
  current: SaleIntent | null,
  companyId: string,
  fingerprint: string,
  generateKey: () => string
): SaleIntent {
  if (current && current.companyId === companyId) {
    if (current.uncertain || current.fingerprint === fingerprint) {
      return current;
    }
  }
  return { companyId, key: generateKey(), fingerprint, uncertain: false };
}

export function markSaleIntentUncertain(current: SaleIntent | null): SaleIntent | null {
  return current ? { ...current, uncertain: true } : null;
}

/** Error de process_sale cuando la clave ya fue usada con otros datos. */
export function isIdempotencyMismatchError(message: string): boolean {
  return message.toLowerCase().includes('idempotency key mismatch');
}
