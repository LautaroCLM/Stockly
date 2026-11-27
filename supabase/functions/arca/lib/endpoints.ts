/** Ambientes de ARCA: homologación (prueba, sin validez fiscal) y producción. */
export type ArcaEnvironment = 'homologacion' | 'produccion';

export const ARCA_URLS: Record<ArcaEnvironment, { wsaa: string; wsfe: string }> = {
  homologacion: {
    wsaa: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
    wsfe: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
  },
  produccion: {
    wsaa: 'https://wsaa.afip.gov.ar/ws/services/LoginCms',
    wsfe: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx',
  },
};

export function toEnvironment(raw: unknown): ArcaEnvironment {
  return raw === 'produccion' ? 'produccion' : 'homologacion';
}

export type InvoiceLetter = 'A' | 'B' | 'C';

/** Código de tipo de comprobante de ARCA para cada factura. */
export const INVOICE_TYPE_CODES: Record<InvoiceLetter, number> = { A: 1, B: 6, C: 11 };

/**
 * Facturas que emite la empresa según su condición frente al IVA.
 * Misma regla que src/features/facturacion/vat.ts (la función no puede importar código del frontend).
 */
export function lettersForTaxCondition(taxCondition: string): InvoiceLetter[] {
  if (taxCondition === 'responsable_inscripto') return ['A', 'B'];
  if (taxCondition === 'monotributo' || taxCondition === 'exento') return ['C'];
  return [];
}

/** CUIT solo con dígitos (como lo pide ARCA); null si no tiene 11. */
export function cuitDigits(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/\D/g, '');
  return digits.length === 11 ? digits : null;
}
