import type { TaxCondition } from '@/features/documentos/types';

/** Alícuotas de IVA que acepta ARCA, la general primero. */
export const VAT_RATES = [21, 10.5, 27, 5, 2.5, 0] as const;
export type VatRate = (typeof VAT_RATES)[number];
export const DEFAULT_VAT_RATE: VatRate = 21;

export function isVatRate(value: number): value is VatRate {
  return (VAT_RATES as readonly number[]).includes(value);
}

/** Valor leído de la base (numeric llega como texto o número); 21 % si no es válido. */
export function toVatRate(raw: unknown): VatRate {
  // Number(null) y Number('') dan 0, que es una alícuota válida: un dato ausente no es "0 %"
  if (raw === null || raw === undefined || raw === '') return DEFAULT_VAT_RATE;
  const value = Number(raw);
  return isVatRate(value) ? value : DEFAULT_VAT_RATE;
}

/** Ejemplo: 10.5 → "10,5 %". */
export function formatVatRate(rate: VatRate): string {
  return `${String(rate).replace('.', ',')} %`;
}

/** Condición del cliente frente al IVA (la pide ARCA en cada factura). */
export const CUSTOMER_VAT_CONDITIONS = [
  'consumidor_final',
  'responsable_inscripto',
  'monotributo',
  'exento',
  'no_alcanzado',
] as const;
export type CustomerVatCondition = (typeof CUSTOMER_VAT_CONDITIONS)[number];
export const DEFAULT_CUSTOMER_VAT_CONDITION: CustomerVatCondition = 'consumidor_final';

export const CUSTOMER_VAT_CONDITION_LABELS: Record<CustomerVatCondition, string> = {
  consumidor_final: 'Consumidor final',
  responsable_inscripto: 'Responsable Inscripto',
  monotributo: 'Monotributo',
  exento: 'IVA Exento',
  no_alcanzado: 'IVA No Alcanzado',
};

export function toCustomerVatCondition(raw: unknown): CustomerVatCondition {
  return (CUSTOMER_VAT_CONDITIONS as readonly unknown[]).includes(raw)
    ? (raw as CustomerVatCondition)
    : DEFAULT_CUSTOMER_VAT_CONDITION;
}

/** La Factura A exige el CUIT del comprador: un Responsable Inscripto sin CUIT no se puede facturar. */
export function customerVatConditionError(
  condition: CustomerVatCondition,
  identificationType: string,
  taxId: string
): string | null {
  if (condition !== 'responsable_inscripto') return null;
  if (identificationType !== 'CUIT' || taxId.trim() === '') {
    return 'Un cliente Responsable Inscripto necesita tipo de identificación CUIT y el número cargado.';
  }
  return null;
}

/** El IVA del producto solo se discrimina en facturas A y B (emisor Responsable Inscripto). */
export function issuerUsesVatRates(issuer: TaxCondition): boolean {
  return issuer === 'responsable_inscripto';
}

/** Letras de factura que puede emitir la empresa según su condición frente al IVA. */
export function invoiceLettersFor(issuer: TaxCondition): readonly ('A' | 'B' | 'C')[] {
  if (issuer === 'responsable_inscripto') return ['A', 'B'];
  if (issuer === 'monotributo' || issuer === 'exento') return ['C'];
  return [];
}
