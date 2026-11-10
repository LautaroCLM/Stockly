import { multiplyToCents, parseHundredths } from '@/lib/decimal';
import type { DocType, ItemFormValues } from './types';

/** Número como se ve en los comprobantes argentinos: punto de venta de 4 dígitos y número de 8 (0001-00000123). */
export function formatDocumentNumber(pointOfSale: number, number: number): string {
  return `${String(pointOfSale).padStart(4, '0')}-${String(number).padStart(8, '0')}`;
}

/** Cantidad (hasta 2 decimales, mayor a cero) en centésimas, o null si no es válida. */
export function parseQuantity(text: string): number | null {
  const value = parseHundredths(text);
  return value !== null && value > 0 ? value : null;
}

/** Importe de una línea en centavos, o null si cantidad o precio no son válidos. */
export function lineCents(item: Pick<ItemFormValues, 'quantity' | 'unitPrice'>): number | null {
  const quantity = parseQuantity(item.quantity);
  const price = item.unitPrice.trim() === '' ? 0 : parseHundredths(item.unitPrice);
  if (quantity === null || price === null) return null;
  return multiplyToCents(price, quantity);
}

export interface DocumentTotals {
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
}

/** Subtotal, descuento y total en centavos. Las líneas incompletas no suman. */
export function computeTotals(items: ItemFormValues[], discountText: string, showPrices: boolean): DocumentTotals {
  if (!showPrices) return { subtotalCents: 0, discountCents: 0, totalCents: 0 };
  const subtotalCents = items.reduce((sum, item) => sum + (lineCents(item) ?? 0), 0);
  const discountCents = discountText.trim() === '' ? 0 : (parseHundredths(discountText) ?? 0);
  return { subtotalCents, discountCents, totalCents: subtotalCents - discountCents };
}

/** ¿Este tipo de documento siempre lleva precios? Ticket y presupuesto sí; garantía nunca; el remito a elección. */
export function priceMode(type: DocType): 'always' | 'never' | 'optional' {
  if (type === 'ticket' || type === 'presupuesto') return 'always';
  return type === 'garantia' ? 'never' : 'optional';
}

/** Vencimiento de la garantía: la fecha de emisión más los meses del plazo. */
export function warrantyEndDate(issueDate: string, months: number): string {
  const [year, month, day] = issueDate.split('-').map(Number);
  const target = new Date(year, month - 1 + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  const end = new Date(target.getFullYear(), target.getMonth(), Math.min(day, lastDay));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
}
