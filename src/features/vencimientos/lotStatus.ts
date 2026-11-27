import type { LotStatus, StockLot } from './types';

/** Estado de un lote según los días que faltan y la anticipación de aviso de la empresa. */
export function lotStatus(lot: Pick<StockLot, 'daysLeft'>, warningDays: number): LotStatus {
  if (lot.daysLeft === null) return 'undated';
  if (lot.daysLeft < 0) return 'expired';
  if (lot.daysLeft <= warningDays) return 'soon';
  return 'ok';
}

/** Texto corto para la tabla: "Venció hace 3 días", "Vence hoy", "Vence en 12 días", "Sin fecha". */
export function describeDaysLeft(daysLeft: number | null): string {
  if (daysLeft === null) return 'Sin fecha';
  if (daysLeft < -1) return `Venció hace ${-daysLeft} días`;
  if (daysLeft === -1) return 'Venció ayer';
  if (daysLeft === 0) return 'Vence hoy';
  if (daysLeft === 1) return 'Vence mañana';
  return `Vence en ${daysLeft} días`;
}

export interface ExpirySummary {
  expiredLots: number;
  soonLots: number;
  /** Productos con al menos una unidad vencida (para el aviso del carrito). */
  productsWithExpired: Set<string>;
  /** Próximo vencimiento con unidades por producto (fecha ISO). */
  nextExpiryByProduct: Map<string, string>;
}

/** Resume los lotes para avisos, carrito y tabla de productos. Espera los lotes ordenados por fecha. */
export function summarizeLots(lots: StockLot[], warningDays: number): ExpirySummary {
  const summary: ExpirySummary = { expiredLots: 0, soonLots: 0, productsWithExpired: new Set(), nextExpiryByProduct: new Map() };
  for (const lot of lots) {
    const status = lotStatus(lot, warningDays);
    if (status === 'expired') {
      summary.expiredLots += 1;
      summary.productsWithExpired.add(lot.productId);
    } else if (status === 'soon') {
      summary.soonLots += 1;
    }
    if (lot.expiresOn) {
      const current = summary.nextExpiryByProduct.get(lot.productId);
      if (!current || lot.expiresOn < current) summary.nextExpiryByProduct.set(lot.productId, lot.expiresOn);
    }
  }
  return summary;
}

/** Fecha ISO a dd/mm/aaaa sin pasar por zona horaria. */
export function formatLotDate(iso: string | null): string {
  if (!iso) return 'Sin fecha';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
