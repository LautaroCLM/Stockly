import { supabase } from '@/lib/supabase';
import { Company } from '@/types';
import type { CompanyRole, CreateCompanyInput } from '../types';

export function deriveInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.trim().substring(0, 2).toUpperCase() || 'ST';
}

/**
 * Limpia y normaliza mensajes de error arrojados por funciones SQL de Supabase.
 */
export function sanitizeRpcError(err: unknown, defaultMessage: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
    // Elimina prefijos comunes de excepciones plpgsql
    return err.message.replace(/^(P0001|error):\s*/i, '').trim();
  }
  if (err instanceof Error) {
    return err.message.replace(/^(P0001|error):\s*/i, '').trim();
  }
  return defaultMessage;
}

/**
 * Consulta las membresías activas del usuario autenticado y las empresas asociadas.
 * Utiliza exclusivamente el cliente Supabase estándar con la sesión del usuario (RLS).
 */
export async function fetchUserCompanies(userId: string): Promise<Company[]> {
  const { data, error } = await supabase
    .from('company_members')
    .select(`
      role,
      is_active,
      companies (
        id,
        name,
        tax_id,
        currency,
        timezone,
        is_active,
        owner_id,
        created_at,
        updated_at
      )
    `)
    .eq('user_id', userId)
    .eq('is_active', true);

  if (error) {
    throw new Error(sanitizeRpcError(error, 'Error al consultar empresas asociadas.'));
  }

  if (!data || data.length === 0) {
    return [];
  }

  const companies: Company[] = [];

  for (const row of data) {
    const comp = row.companies;
    if (comp && comp.is_active) {
      companies.push({
        id: comp.id,
        name: comp.name,
        cuit: comp.tax_id || '',
        initials: deriveInitials(comp.name),
        currency: comp.currency,
        timezone: comp.timezone,
        role: row.role as CompanyRole,
        isOwner: comp.owner_id === userId,
      });
    }
  }

  return companies;
}

/**
 * Invoca el RPC create_company para registrar atómicamente un nuevo tenant,
 * otorgando membresía master_admin y titularidad al usuario autenticado.
 */
export async function createCompanyRpc(input: CreateCompanyInput): Promise<string> {
  const cleanName = input.name.trim();
  const cleanTaxId = input.taxId && input.taxId.trim() ? input.taxId.trim() : null;

  const { data, error } = await supabase.rpc('create_company', {
    p_name: cleanName,
    p_tax_id: cleanTaxId as unknown as string,
    p_currency: input.currency || 'ARS',
    p_timezone: input.timezone || 'America/Argentina/Buenos_Aires',
  });

  if (error) {
    throw new Error(sanitizeRpcError(error, 'No se pudo crear la empresa.'));
  }

  if (!data) {
    throw new Error('El servidor no retornó el identificador de la nueva empresa.');
  }

  return data;
}

/**
 * Invoca el RPC accept_company_invitation para canjear un token criptográfico
 * e incorporar al usuario autenticado a la empresa correspondiente.
 */
export async function acceptCompanyInvitationRpc(token: string): Promise<string> {
  const cleanToken = token.trim();

  const { data, error } = await supabase.rpc('accept_company_invitation', {
    p_token: cleanToken,
  });

  if (error) {
    throw new Error(sanitizeRpcError(error, 'La invitación no es válida, ha expirado o ya fue utilizada.'));
  }

  if (!data) {
    throw new Error('El servidor no retornó el identificador de la empresa.');
  }

  return data;
}
