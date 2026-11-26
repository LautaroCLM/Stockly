/**
 * Código de barras Code 128 (juego B: letras, números y signos comunes).
 * Lo leen todos los lectores de mostrador. Se genera acá para no sumar una dependencia.
 * Cada patrón son 6 anchos (barra, espacio, barra…) que suman 11 módulos; el de cierre tiene 7.
 */
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
] as const;

export const CODE128_PATTERNS: readonly string[] = PATTERNS;

const START_B = 104;
const STOP = 106;

/** Valores del juego B para el texto, o null si tiene caracteres que Code 128 B no admite. */
export function code128Values(text: string): number[] | null {
  if (text.length === 0) return null;
  const values: number[] = [];
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code > 126) return null;
    values.push(code - 32);
  }
  return values;
}

/** Dígito de control: inicio + suma de (valor × posición), módulo 103. */
export function code128Checksum(values: readonly number[]): number {
  return values.reduce((sum, v, i) => sum + v * (i + 1), START_B) % 103;
}

/** Anchos de barras y espacios alternados (empieza con barra), o null si el texto no se puede codificar. */
export function encodeCode128(text: string): number[] | null {
  const values = code128Values(text);
  if (!values) return null;
  const all = [START_B, ...values, code128Checksum(values), STOP];
  return all.flatMap((v) => [...PATTERNS[v]].map(Number));
}
