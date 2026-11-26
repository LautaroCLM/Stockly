import { fromHundredths, toHundredths } from '@/lib/decimal';

/**
 * Importe a devolver por una línea, igual que process_sale_return:
 * parte proporcional del subtotal de la línea y, encima, el mismo descuento que tuvo la venta.
 * Redondeo a centavos (mitad hacia arriba, como round() de PostgreSQL con positivos).
 */
export function lineRefund(lineSubtotal: number, soldQty: number, returnQty: number, saleSubtotal: number, saleTotal: number): number {
  if (!(returnQty > 0) || !(soldQty > 0)) return 0;
  let cents = Math.round((toHundredths(lineSubtotal) * returnQty) / soldQty);
  if (saleSubtotal > 0) cents = Math.round((cents * toHundredths(saleTotal)) / toHundredths(saleSubtotal));
  return fromHundredths(cents);
}

/** Cantidad válida para devolver (texto escrito), entre 0 y lo que queda; null si no es válida. */
export function parseReturnQty(text: string, remaining: number): number | null {
  const t = text.trim().replace(',', '.');
  if (t === '') return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return n <= remaining ? n : null;
}
