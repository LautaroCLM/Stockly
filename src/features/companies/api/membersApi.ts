import { supabase } from '@/lib/supabase';
import { fetchAllRows } from '@/lib/fetchAllRows';
import type { CompanyMember, CompanyInvitation, InviteUserInput, CompanyRole } from '../types';

export function sanitizeGovernanceError(err: unknown, defaultMessage: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
    return err.message.replace(/^(P0001|error):\s*/i, '').trim();
  }
  if (err instanceof Error) {
    return err.message.replace(/^(P0001|error):\s*/i, '').trim();
  }
  return defaultMessage;
}

/**
 * Consulta los miembros registrados para la empresa activa.
 * El aislamiento se rige por la política RLS 'company_members_select_colleagues'.
 */
export async function fetchCompanyMembers(companyId: string): Promise<CompanyMember[]> {
  const { data, error } = await fetchAllRows((from, to) =>
    supabase
      .from('company_members')
      .select(`
        id,
        company_id,
        user_id,
        role,
        is_active,
        joined_at,
        profiles:user_id (
          id,
          email,
          full_name
        )
      `)
      .eq('company_id', companyId)
      .order('joined_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to)
  );

  if (error) {
    throw new Error(sanitizeGovernanceError(error, 'Error al consultar miembros de la empresa.'));
  }

  return data.map((row) => {
    const prof = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return {
      id: row.id,
      companyId: row.company_id,
      userId: row.user_id,
      role: row.role as CompanyRole,
      isActive: row.is_active,
      joinedAt: row.joined_at,
      fullName: prof?.full_name || null,
      email: prof?.email || null,
    };
  });
}

/**
 * Consulta las invitaciones emitidas para la empresa activa.
 * RLS restringe esta vista a master_admin activos de la empresa.
 */
export async function fetchCompanyInvitations(companyId: string): Promise<CompanyInvitation[]> {
  const { data, error } = await fetchAllRows((from, to) =>
    supabase
      .from('company_invitations')
      .select('id, company_id, email, role, status, expires_at, created_at, accepted_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, to)
  );

  if (error) {
    throw new Error(sanitizeGovernanceError(error, 'Error al consultar invitaciones de la empresa.'));
  }

  return data.map((row) => ({
    id: row.id,
    companyId: row.company_id,
    email: row.email,
    role: row.role as CompanyRole,
    status: row.status as CompanyInvitation['status'],
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    acceptedAt: row.accepted_at,
  }));
}

/**
 * Emite una invitación para incorporar a un usuario mediante token criptográfico.
 * Retorna el token en claro de 64 caracteres.
 */
export async function inviteUserRpc(params: InviteUserInput): Promise<string> {
  const cleanEmail = params.email.trim().toLowerCase();

  const { data, error } = await supabase.rpc('invite_user_to_company', {
    p_company_id: params.companyId,
    p_email: cleanEmail,
    p_role: params.role,
  });

  if (error) {
    throw new Error(sanitizeGovernanceError(error, 'No se pudo generar la invitación.'));
  }

  if (!data) {
    throw new Error('El servidor no retornó el token de la invitación.');
  }

  return data;
}

/**
 * Revoca una invitación pendiente impidiendo su canje futuro.
 */
export async function revokeInvitationRpc(companyId: string, invitationId: string): Promise<void> {
  const { error } = await supabase.rpc('revoke_company_invitation', {
    p_company_id: companyId,
    p_invitation_id: invitationId,
  });

  if (error) {
    throw new Error(sanitizeGovernanceError(error, 'No se pudo revocar la invitación.'));
  }
}

/**
 * Desactiva la membresía de un colaborador en la empresa indicando motivo obligatorio.
 */
export async function deactivateMemberRpc(
  companyId: string,
  userId: string,
  reason: string
): Promise<void> {
  const cleanReason = reason.trim();
  if (!cleanReason) {
    throw new Error('El motivo de desactivación es obligatorio.');
  }

  const { error } = await supabase.rpc('deactivate_member', {
    p_company_id: companyId,
    p_user_id: userId,
    p_reason: cleanReason,
  });

  if (error) {
    throw new Error(sanitizeGovernanceError(error, 'No se pudo desactivar al miembro.'));
  }
}

/**
 * Reactiva a un colaborador con membresía previamente inactiva asignando rol y motivo.
 */
export async function reactivateMemberRpc(
  companyId: string,
  userId: string,
  newRole: CompanyRole,
  reason: string
): Promise<void> {
  const cleanReason = reason.trim();
  if (!cleanReason) {
    throw new Error('El motivo de reactivación es obligatorio.');
  }

  const { error } = await supabase.rpc('reactivate_member', {
    p_company_id: companyId,
    p_user_id: userId,
    p_new_role: newRole,
    p_reason: cleanReason,
  });

  if (error) {
    throw new Error(sanitizeGovernanceError(error, 'No se pudo reactivar al miembro.'));
  }
}
