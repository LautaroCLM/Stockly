/** Lote con unidades de un producto que controla vencimiento (public.stock_lots_list). */
export interface StockLot {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  lotCode: string | null;
  /** Fecha ISO (YYYY-MM-DD); null = lote "sin fecha". */
  expiresOn: string | null;
  remaining: number;
  initial: number;
  purchaseNumber: string | null;
  /** Días hasta el vencimiento en la fecha local de la empresa; negativo = vencido; null = sin fecha. */
  daysLeft: number | null;
}

export type LotStatus = 'expired' | 'soon' | 'ok' | 'undated';

export type LotActionResult = { ok: true } | { ok: false; message: string };

export const DEFAULT_EXPIRY_WARNING_DAYS = 30;
