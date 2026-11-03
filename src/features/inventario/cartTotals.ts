import { fromHundredths, multiplyToCents, toHundredths } from '@/lib/decimal';

export interface CartLine {
  unitPrice: number;
  quantity: number;
}

export interface CartTotalsCents {
  lineCents: number[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
}

/**
 * Calcula los totales del carrito en centavos con el mismo redondeo que process_sale:
 * cada línea se redondea a 2 decimales y el subtotal es la suma de las líneas.
 * El descuento se redondea a pesos enteros y nunca supera el subtotal.
 */
export function calculateCartTotalsCents(lines: CartLine[], discountPercent: number): CartTotalsCents {
  const lineCents = lines.map((line) =>
    multiplyToCents(toHundredths(line.unitPrice), toHundredths(line.quantity))
  );
  const subtotalCents = lineCents.reduce((sum, cents) => sum + cents, 0);

  const clampedPercent = Math.max(0, Math.min(100, discountPercent));
  const discountPesos = Math.round((subtotalCents * clampedPercent) / 10000);
  const discountCents = Math.min(subtotalCents, discountPesos * 100);

  return {
    lineCents,
    subtotalCents,
    discountCents,
    totalCents: subtotalCents - discountCents,
  };
}

/** Totales del carrito como montos con 2 decimales exactos, listos para mostrar y enviar. */
export function calculateCartTotals(lines: CartLine[], discountPercent: number) {
  const cents = calculateCartTotalsCents(lines, discountPercent);
  return {
    lineAmounts: cents.lineCents.map(fromHundredths),
    subtotal: fromHundredths(cents.subtotalCents),
    discountAmount: fromHundredths(cents.discountCents),
    total: fromHundredths(cents.totalCents),
  };
}
