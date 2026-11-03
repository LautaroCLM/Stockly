/**
 * Aritmética exacta para montos y cantidades con hasta 2 decimales.
 *
 * Los valores se representan como enteros en centésimas (1234,56 -> 123456) para evitar
 * los errores de coma flotante de JavaScript (0,1 + 0,2 !== 0,3). PostgreSQL guarda estos
 * valores como NUMERIC(…, 2), así que el redondeo replica el de round(x, 2).
 */

const DECIMAL_INPUT = /^(\d+)(?:[.,](\d{1,2}))?$/;

/**
 * Convierte texto ingresado por el usuario ("2,2", "10.05", "7") a centésimas.
 * Devuelve null si no es un número no negativo con como máximo 2 decimales.
 */
export function parseHundredths(input: string): number | null {
  const match = DECIMAL_INPUT.exec(input.trim());
  if (!match) return null;

  const integerPart = Number(match[1]);
  const fraction = (match[2] ?? '').padEnd(2, '0');
  const value = integerPart * 100 + Number(fraction);
  return Number.isSafeInteger(value) ? value : null;
}

/**
 * Convierte a centésimas un número que ya tiene como máximo 2 decimales
 * (por ejemplo, un NUMERIC leído de la base); corrige el ruido de coma flotante.
 */
export function toHundredths(value: number): number {
  return Math.round(value * 100);
}

export function fromHundredths(hundredths: number): number {
  return hundredths / 100;
}

/**
 * Precio (centavos) por cantidad (centésimas) redondeado a centavos,
 * igual que round(precio * cantidad, 2) en PostgreSQL (mitad hacia arriba para positivos).
 */
export function multiplyToCents(priceCents: number, quantityHundredths: number): number {
  const product = BigInt(priceCents) * BigInt(quantityHundredths);
  const rounded = (product + 50n) / 100n;
  return Number(rounded);
}
