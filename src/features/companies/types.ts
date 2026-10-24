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

export interface CompanyMember {
  id: string;
  companyId: string;
  userId: string;
  role: CompanyRole;
  isActive: boolean;
  joinedAt: string;
  fullName?: string | null;
  email?: string | null;
}

export interface CompanyInvitation {
  id: string;
  companyId: string;
  email: string;
  role: CompanyRole;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  expiresAt: string;
  createdAt: string;
  acceptedAt?: string | null;
}

export interface InviteUserInput {
  companyId: string;
  email: string;
  role: CompanyRole;
}

export interface InviteUserResult {
  success: boolean;
  token?: string;
  error?: string;
}

export interface CompanySettings {
  id: string;
  name: string;
  taxId: string | null;
  currency: string;
  timezone: string;
  isActive: boolean;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  allowNegativeStock: boolean;
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
