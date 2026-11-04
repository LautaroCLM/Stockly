import { formatCuit, validateCuit } from '@/features/companies/utils/cuitValidator';
import type { CustomerIdentificationType } from './types';

const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

/** CUIT y CUIL usan el mismo formato y dígito verificador. */
export function usesCuitFormat(idType: CustomerIdentificationType): boolean {
  return idType === 'CUIT' || idType === 'CUIL';
}

/** Da formato al número mientras se escribe (solo CUIT/CUIL). */
export function formatTaxIdInput(idType: CustomerIdentificationType, raw: string): string {
  return usesCuitFormat(idType) ? formatCuit(raw) : raw;
}

/** Error del número de identificación (vacío es válido: es opcional). */
export function taxIdError(idType: CustomerIdentificationType, value: string): string | null {
  if (!usesCuitFormat(idType) || !value.trim()) return null;
  return validateCuit(value) ? null : 'El CUIT/CUIL ingresado no es válido (algoritmo Módulo 11).';
}

/** Error del correo (vacío es válido: es opcional). */
export function emailError(value: string): string | null {
  const clean = value.trim();
  return clean && !EMAIL_PATTERN.test(clean) ? 'Formato de correo electrónico inválido.' : null;
}
