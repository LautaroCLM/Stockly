import { Company } from '@/types';

export type CompanyRole = 'master_admin' | 'employee';

export interface RealCompany extends Company {
  id: string; // UUID
  name: string;
  cuit: string;
  taxId: string | null;
  currency: string;
  timezone: string;
  isActive: boolean;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  role: CompanyRole;
  isOwner: boolean;
}

export interface CreateCompanyInput {
  name: string;
  taxId?: string;
  currency?: string;
  timezone?: string;
}

export interface CompanyActionResult {
  success: boolean;
  companyId?: string;
  error?: string;
}

export interface CompanyContextValue {
  companies: Company[];
  activeCompany: Company | null;
  userRole: CompanyRole | null;
  isLoading: boolean;
  error: string | null;
  selectCompany: (companyId: string) => void;
  refreshCompanies: () => Promise<void>;
  createCompany: (input: CreateCompanyInput) => Promise<CompanyActionResult>;
  acceptInvitation: (token: string) => Promise<CompanyActionResult>;
}
