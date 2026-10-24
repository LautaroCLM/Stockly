export interface Supplier {
  id: string;
  companyId: string;
  name: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  taxId?: string | null; // CUIT
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertSupplierInput {
  supplierId?: string;
  companyId: string;
  name: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  taxId?: string | null;
  isActive?: boolean;
}

export interface SupplierActionResult {
  success: boolean;
  error?: string;
  supplierId?: string;
}
