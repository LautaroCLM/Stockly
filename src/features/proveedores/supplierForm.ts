import { formatCuit, validateCuit } from '@/features/companies/utils/cuitValidator';
import type { Supplier, UpsertSupplierInput } from './types';

export interface SupplierFormValues {
  name: string;
  taxId: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  isActive: boolean;
}

const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export function initialSupplierValues(supplier: Supplier | null | undefined): SupplierFormValues {
  return {
    name: supplier?.name ?? '',
    taxId: supplier?.taxId ? formatCuit(supplier.taxId) : '',
    contactName: supplier?.contactName || '',
    email: supplier?.email || '',
    phone: supplier?.phone || '',
    address: supplier?.address || '',
    isActive: supplier ? supplier.isActive : true,
  };
}

/** Error del CUIT mientras se escribe (vacío es válido: es opcional). */
export function cuitFieldError(value: string): string | null {
  return value.trim() !== '' && !validateCuit(value) ? 'El CUIT ingresado no es válido (algoritmo Módulo 11).' : null;
}

/** Error del correo mientras se escribe (vacío es válido: es opcional). */
export function emailFieldError(value: string): string | null {
  const clean = value.trim();
  return clean && !EMAIL_PATTERN.test(clean) ? 'Formato de correo electrónico inválido.' : null;
}

/** Valida el proveedor antes de guardarlo. Devuelve el mensaje de error o null. */
export function validateSupplierForm(values: SupplierFormValues): string | null {
  const name = values.name.trim();
  if (!name || name.length > 150) return 'El nombre o razón social es obligatorio (máximo 150 caracteres).';
  if (values.taxId && !validateCuit(values.taxId)) return 'El CUIT no cumple con la validación de integridad numérica.';
  if (emailFieldError(values.email)) return 'El formato de correo electrónico no es válido.';
  return null;
}

export function toSupplierInput(values: SupplierFormValues, supplierId?: string): Omit<UpsertSupplierInput, 'companyId'> {
  return {
    supplierId,
    name: values.name.trim(),
    taxId: values.taxId ? values.taxId.replace(/-/g, '').trim() : undefined,
    contactName: values.contactName.trim() || undefined,
    email: values.email.trim() || undefined,
    phone: values.phone.trim() || undefined,
    address: values.address.trim() || undefined,
    isActive: values.isActive,
  };
}
