export type ParsedNumber = { ok: true; value: number | null } | { ok: false };

/** Tipos de celda que entrega la lectura de una planilla. */
const isEmptyCell = (raw: unknown): boolean => raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '');

/**
 * Número desde una celda. Entiende "1.234,56" (es-AR), "1234,56", "1,234.56", "$ 1.234" y números de Excel.
 * Una celda vacía da null; un texto que no es un número, un error. Se redondea a 2 decimales.
 */
export function parseDecimal(raw: unknown): ParsedNumber {
  if (isEmptyCell(raw)) return { ok: true, value: null };
  if (typeof raw === 'number') return Number.isFinite(raw) ? { ok: true, value: round2(raw) } : { ok: false };
  if (typeof raw !== 'string') return { ok: false };

  let text = raw.trim().replace(/[\s$]/g, '').replace(/^ars/i, '');
  if (text === '' || !/^[-+]?[\d.,]+$/.test(text)) return { ok: false };

  const lastDot = text.lastIndexOf('.');
  const lastComma = text.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    // Ambos símbolos: el último es el decimal y el otro separa miles
    const decimal = lastDot > lastComma ? '.' : ',';
    const thousands = decimal === '.' ? ',' : '.';
    text = text.split(thousands).join('').replace(decimal, '.');
  } else if (lastComma >= 0) {
    text = /^[-+]?\d{1,3}(,\d{3})+$/.test(text) && text.split(',').length > 2 ? text.split(',').join('') : text.replace(',', '.');
  } else if (lastDot >= 0 && /^[-+]?[1-9]\d{0,2}(\.\d{3})+$/.test(text)) {
    // 1.234 o 1.234.567: puntos de miles (con 0 adelante, como 0.500, es un decimal)
    text = text.split('.').join('');
  }
  if ((text.match(/\./g) ?? []).length > 1) return { ok: false };
  const value = Number(text);
  return Number.isFinite(value) ? { ok: true, value: round2(value) } : { ok: false };
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export const PRODUCT_UNITS = ['unidad', 'kg', 'litro', 'metro', 'bulto', 'par'] as const;
export type ProductUnit = (typeof PRODUCT_UNITS)[number];

/** Unidades que no admiten cantidades con decimales. */
export const INDIVISIBLE_UNITS: readonly string[] = ['unidad', 'bulto', 'par'];

const UNIT_SYNONYMS: Record<string, ProductUnit> = {
  unidad: 'unidad', unidades: 'unidad', un: 'unidad', u: 'unidad', unid: 'unidad', uni: 'unidad', und: 'unidad', pieza: 'unidad', piezas: 'unidad',
  kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg', kilogramo: 'kg', kilogramos: 'kg',
  litro: 'litro', litros: 'litro', l: 'litro', lt: 'litro', lts: 'litro', ltr: 'litro',
  metro: 'metro', metros: 'metro', m: 'metro', mt: 'metro', mts: 'metro',
  bulto: 'bulto', bultos: 'bulto', caja: 'bulto', cajas: 'bulto', pack: 'bulto',
  par: 'par', pares: 'par',
};

/** Unidad válida desde el texto de una celda; null si está vacía y undefined si no se reconoce. */
export function parseUnit(raw: unknown): ProductUnit | null | undefined {
  if (isEmptyCell(raw)) return null;
  const key = String(raw)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  return UNIT_SYNONYMS[key];
}

/** Texto de una celda, sin espacios de más; vacío si no hay nada. */
export function cellText(raw: unknown): string {
  if (isEmptyCell(raw)) return '';
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  // Un número entero grande (código de barras) no debe salir en notación científica
  if (typeof raw === 'number' && Number.isInteger(raw)) return raw.toLocaleString('fullwide', { useGrouping: false });
  return String(raw).trim();
}
