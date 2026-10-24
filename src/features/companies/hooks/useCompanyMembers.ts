import { useState, useEffect, useCallback, useRef } from 'react';
import type { CompanyMember, CompanyInvitation, CompanyRole, InviteUserResult } from '../types';
import {
  fetchCompanyMembers,
  fetchCompanyInvitations,
  inviteUserRpc,
  revokeInvitationRpc,
  deactivateMemberRpc,
  reactivateMemberRpc,
} from '../api/membersApi';

export function useCompanyMembers(companyId: string, isMasterAdmin: boolean) {
  const [members, setMembers] = useState<CompanyMember[]>([]);
  const [invitations, setInvitations] = useState<CompanyInvitation[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef<boolean>(true);
  const currentCompanyIdRef = useRef<string>(companyId);
  currentCompanyIdRef.current = companyId;

  const loadData = useCallback(
    async (targetCompanyId: string) => {
      if (!targetCompanyId) {
        setMembers([]);
        setInvitations([]);
        setIsLoading(false);
        setError(null);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const membersPromise = fetchCompanyMembers(targetCompanyId);
        const invitationsPromise = isMasterAdmin
          ? fetchCompanyInvitations(targetCompanyId).catch((err) => {
              console.warn('Invitaciones no disponibles para este usuario:', err);
              return [] as CompanyInvitation[];
            })
          : Promise.resolve([] as CompanyInvitation[]);

        const [membersData, invitationsData] = await Promise.all([
          membersPromise,
          invitationsPromise,
        ]);

        if (isMountedRef.current && currentCompanyIdRef.current === targetCompanyId) {
          setMembers(membersData);
          setInvitations(invitationsData);
          setError(null);
        }
      } catch (err) {
        if (isMountedRef.current && currentCompanyIdRef.current === targetCompanyId) {
          const message = err instanceof Error ? err.message : 'Error al cargar miembros de la empresa.';
          setError(message);
        }
      } finally {
        if (isMountedRef.current && currentCompanyIdRef.current === targetCompanyId) {
          setIsLoading(false);
        }
      }
    },
    [isMasterAdmin]
  );

  useEffect(() => {
    isMountedRef.current = true;
    loadData(companyId);
    return () => {
      isMountedRef.current = false;
    };
  }, [companyId, loadData]);

  const reload = useCallback(async () => {
    await loadData(companyId);
  }, [companyId, loadData]);

  const inviteUser = useCallback(
    async (email: string, role: CompanyRole): Promise<InviteUserResult> => {
      try {
        const token = await inviteUserRpc({
          companyId,
          email,
          role,
        });

        await loadData(companyId);
        return { success: true, token };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error al generar la invitación.';
        return { success: false, error: message };
      }
    },
    [companyId, loadData]
  );

  const revokeInvitation = useCallback(
    async (invitationId: string): Promise<{ success: boolean; error?: string }> => {
      try {
        await revokeInvitationRpc(companyId, invitationId);
        await loadData(companyId);
        return { success: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'No se pudo revocar la invitación.';
        return { success: false, error: message };
      }
    },
    [companyId, loadData]
  );

  const deactivateMember = useCallback(
    async (userId: string, reason: string): Promise<{ success: boolean; error?: string }> => {
      try {
        await deactivateMemberRpc(companyId, userId, reason);
        await loadData(companyId);
        return { success: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'No se pudo desactivar al colaborador.';
        return { success: false, error: message };
      }
    },
    [companyId, loadData]
  );

  const reactivateMember = useCallback(
    async (
      userId: string,
      newRole: CompanyRole,
      reason: string
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        await reactivateMemberRpc(companyId, userId, newRole, reason);
        await loadData(companyId);
        return { success: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'No se pudo reactivar al colaborador.';
        return { success: false, error: message };
      }
    },
    [companyId, loadData]
  );

  return {
    members,
    invitations,
    isLoading,
    error,
    reload,
    inviteUser,
    revokeInvitation,
    deactivateMember,
    reactivateMember,
  };
}
