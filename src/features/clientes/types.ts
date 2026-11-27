import type { CustomerVatCondition } from '@/features/facturacion/vat';

export type CustomerIdentificationType =
  | 'DNI'
  | 'CUIT'
  | 'CUIL'
  | 'PASAPORTE'
  | 'OTRO'
  | 'EXTRANJERO';

export interface Customer {
  id: string;
  companyId: string;
  name: string;
  identificationType: CustomerIdentificationType;
  taxId?: string | null;
  /** Condición frente al IVA (define si se le hace Factura A o B). */
  vatCondition: CustomerVatCondition;
  /** Lista de precios del cliente (null: precio normal). */
  priceListId: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  isActive: boolean;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertCustomerInput {
  customerId?: string;
  companyId: string;
  name: string;
  identificationType?: CustomerIdentificationType;
  taxId?: string | null;
  /** Si se omite, no se cambia (el cliente nuevo queda como consumidor final). */
  vatCondition?: CustomerVatCondition;
  /** Si se omite, no se cambia. */
  priceListId?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  isActive?: boolean;
}

export interface CustomerActionResult {
  success: boolean;
  error?: string;
  customerId?: string;
}
