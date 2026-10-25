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
