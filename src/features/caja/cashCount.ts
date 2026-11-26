import { fromHundredths, parseHundredths } from '@/lib/decimal';

/** Billetes y monedas en circulación en Argentina, de mayor a menor (en pesos). */
export const DENOMINATIONS = [20000, 10000, 2000, 1000, 500, 200, 100, 50, 20, 10] as const;
export type Denomination = (typeof DENOMINATIONS)[number];

/** Cantidad de billetes escrita por la persona: entero de 0 a 9999. Vacío cuenta como 0. */
export function parseCount(input: string): number | null {
  const text = input.trim();
  if (text === '') return 0;
  if (!/^\d{1,4}$/.test(text)) return null;
  return Number(text);
}

export interface CountResult {
  /** Total contado en pesos, o null si algún campo no es válido. */
  total: number | null;
  /** Denominaciones con un valor inválido, para marcarlas en pantalla. */
  invalid: Denomination[];
}

/**
 * Suma del arqueo por billetes: cantidad × valor de cada denominación, más un monto suelto
 * (monedas chicas u otros). Se calcula en centavos enteros para no arrastrar errores de coma flotante.
 */
export function countCash(counts: Partial<Record<Denomination, string>>, looseInput: string): CountResult {
  const invalid: Denomination[] = [];
  let cents = 0;
  for (const value of DENOMINATIONS) {
    const qty = parseCount(counts[value] ?? '');
    if (qty === null) invalid.push(value);
    else cents += qty * value * 100;
  }
  const loose = looseInput.trim() === '' ? 0 : parseHundredths(looseInput);
  if (invalid.length > 0 || loose === null) return { total: null, invalid };
  return { total: fromHundredths(cents + loose), invalid };
}
