import { formatCurrency, formatDateTime, formatNumber } from '@/lib/formatters';
import { paymentMethodLabel } from './paymentMethods';
import type { Sale } from './types';

/**
 * Celular argentino en el formato que usa WhatsApp (54 9 + código de área + número, sin 0 ni 15).
 * Acepta lo que la gente suele escribir: "011 15-2345-6789", "+54 9 11 2345-6789", "11 2345 6789".
 * Si no se puede interpretar con seguridad devuelve null y WhatsApp deja elegir el contacto.
 */
export function normalizeArPhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('549') && digits.length === 13) return digits;
  if (digits.startsWith('54') && digits.length === 12) return `549${digits.slice(2)}`;
  if (digits.startsWith('0')) digits = digits.slice(1);
  // Código de área (2 a 4 dígitos) + "15" + número local: se quita el 15
  const with15 = /^(\d{2,4})15(\d{6,8})$/.exec(digits);
  if (with15 && with15[1].length + with15[2].length === 10) digits = with15[1] + with15[2];
  return digits.length === 10 ? `549${digits}` : null;
}

const DEFAULT_CLIENT = 'consumidor final';

/** Texto del comprobante para mandar por WhatsApp (con *negritas* de WhatsApp). */
export function buildTicketMessage(sale: Sale, companyName: string): string {
  const lines: string[] = [`*${companyName}*`, `Comprobante ${sale.saleNumber} · ${formatDateTime(sale.createdAt)}`];
  if (sale.clientName && sale.clientName.trim().toLowerCase() !== DEFAULT_CLIENT) lines.push(`Cliente: ${sale.clientName}`);
  if (sale.status === 'anulada') lines.push('*VENTA ANULADA*');
  lines.push('');
  for (const item of sale.items) {
    lines.push(`${formatNumber(item.quantity)} x ${item.name} — ${formatCurrency(item.subtotal)}`);
  }
  lines.push('');
  if (sale.discountAmount > 0) {
    lines.push(`Subtotal: ${formatCurrency(sale.subtotal)}`);
    lines.push(`Descuento (${formatNumber(sale.discountPercent)}%): -${formatCurrency(sale.discountAmount)}`);
  }
  lines.push(`*Total: ${formatCurrency(sale.total)}*`);
  const payments = sale.payments.map((p) => `${paymentMethodLabel(p.method)} ${formatCurrency(p.amount)}`);
  if (payments.length > 0) lines.push(`Pago: ${payments.join(' + ')}`);
  lines.push('', '¡Gracias por su compra!', '_Comprobante no fiscal_');
  return lines.join('\n');
}

/** Enlace que abre WhatsApp (app o web) con el mensaje escrito y, si hay, el chat del número. */
export function whatsappUrl(phone: string | null, message: string): string {
  const text = encodeURIComponent(message);
  return phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
}
