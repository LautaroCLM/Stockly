import React, { useState } from 'react';
import { Company } from '@/types';
import { Button } from '@/components/ui/Button';
import { ShieldAlert } from 'lucide-react';
import type { CompanyMember, CompanyInvitation, CompanyRole, InviteUserResult } from '../types';
import { InviteUserModal } from './InviteUserModal';
import { MemberActionModal } from './MemberActionModal';
import { MembersTable } from './MembersTable';
import { InvitationsTable } from './InvitationsTable';
import { MembersHeader, type MembersNotice } from './MembersHeader';

export interface MembersPageProps {
  company: Company;
  members: CompanyMember[];
  invitations: CompanyInvitation[];
  isLoading: boolean;
  error: string | null;
  isMasterAdmin: boolean;
  isOwner?: boolean;
  currentUserId?: string;
  onReload: () => Promise<void>;
  onInviteUser: (email: string, role: CompanyRole) => Promise<InviteUserResult>;
  onRevokeInvitation: (invitationId: string) => Promise<{ success: boolean; error?: string }>;
  onDeactivateMember: (userId: string, reason: string) => Promise<{ success: boolean; error?: string }>;
  onReactivateMember: (
    userId: string,
    newRole: CompanyRole,
    reason: string
  ) => Promise<{ success: boolean; error?: string }>;
}

export const MembersPage: React.FC<MembersPageProps> = ({
  company,
  members,
  invitations,
  isLoading,
  error,
  isMasterAdmin,
  isOwner,
  currentUserId,
  onReload,
  onInviteUser,
  onRevokeInvitation,
  onDeactivateMember,
  onReactivateMember,
}) => {
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [actionMember, setActionMember] = useState<CompanyMember | null>(null);
  const [actionType, setActionType] = useState<'deactivate' | 'reactivate'>('deactivate');
  const [isActionModalOpen, setIsActionModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<MembersNotice>(null);

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), type === 'error' ? 8000 : 4000);
  };

  const handleManualReload = async () => {
    setIsRefreshing(true);
    try {
      await onReload();
      showNotification('Colaboradores e invitaciones actualizados.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleOpenDeactivate = (m: CompanyMember) => {
    setActionMember(m);
    setActionType('deactivate');
    setIsActionModalOpen(true);
  };

  const handleOpenReactivate = (m: CompanyMember) => {
    setActionMember(m);
    setActionType('reactivate');
    setIsActionModalOpen(true);
  };

  const handleRevokeInvitation = async (invitationId: string) => {
    if (!window.confirm('¿Confirmás la revocación de esta invitación? El token ya no podrá ser utilizado.')) {
      return;
    }

    setRevokingId(invitationId);
    try {
      const res = await onRevokeInvitation(invitationId);
      if (res.success) {
        showNotification('Invitación revocada correctamente.');
      } else {
        showNotification(res.error || 'Error al revocar la invitación.', 'error');
      }
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      <MembersHeader company={company} isMasterAdmin={isMasterAdmin} isBusy={isLoading || isRefreshing} notice={notice}
        onReload={() => void handleManualReload()} onInvite={() => setIsInviteOpen(true)} />

      {error && (
        <div className="p-4 rounded-xl bg-danger/10 border border-danger/20 text-danger text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldAlert size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
          <Button variant="outline" size="sm" onClick={onReload} className="text-xs shrink-0">
            Reintentar
          </Button>
        </div>
      )}

      {/* Tabla de Miembros */}
      <MembersTable
        members={members}
        isLoading={isLoading}
        isMasterAdmin={isMasterAdmin}
        currentUserId={currentUserId}
        onOpenDeactivate={handleOpenDeactivate}
        onOpenReactivate={handleOpenReactivate}
      />

      {/* Tabla de Invitaciones (solo master_admin) */}
      {isMasterAdmin && (
        <InvitationsTable
          invitations={invitations}
          isLoading={isLoading}
          revokingId={revokingId}
          onRevoke={handleRevokeInvitation}
        />
      )}

      {/* Modal Invitar */}
      <InviteUserModal
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
        isOwner={Boolean(isOwner ?? company.isOwner)}
        onInvite={async (em, r) => {
          const res = await onInviteUser(em, r);
          if (res.success) {
            showNotification(`Invitación emitida para ${em}.`);
          }
          return res;
        }}
      />

      {/* Modal Acción (Desactivar / Reactivar) */}
      <MemberActionModal
        isOpen={isActionModalOpen}
        onClose={() => setIsActionModalOpen(false)}
        member={actionMember}
        mode={actionType}
        onConfirmDeactivate={async (userId, reason) => {
          const res = await onDeactivateMember(userId, reason);
          if (res.success) showNotification('Membresía desactivada correctamente.');
          return res;
        }}
        onConfirmReactivate={async (userId, newRole, reason) => {
          const res = await onReactivateMember(userId, newRole, reason);
          if (res.success) showNotification('Membresía reactivada correctamente.');
          return res;
        }}
      />
    </div>
  );
};
