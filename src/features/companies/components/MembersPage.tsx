import React, { useState } from 'react';
import { Company } from '@/types';
import { Button } from '@/components/ui/Button';
import {
  Users,
  UserPlus,
  RefreshCw,
  ShieldAlert,
  CheckCircle2,
} from 'lucide-react';
import type { CompanyMember, CompanyInvitation, CompanyRole, InviteUserResult } from '../types';
import { InviteUserModal } from './InviteUserModal';
import { MemberActionModal } from './MemberActionModal';
import { MembersTable } from './MembersTable';
import { InvitationsTable } from './InvitationsTable';

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
  const [notice, setNotice] = useState<string | null>(null);

  const showNotification = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 4000);
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
        alert(res.error || 'Error al revocar la invitación.');
      }
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold text-text-primary tracking-tight">
              Gestión de Miembros e Invitaciones
            </h1>
          </div>
          <p className="text-xs text-text-secondary mt-1">
            Empresa activa: <span className="font-semibold text-text-primary">{company.name}</span>
            {company.cuit ? ` (${company.cuit})` : ''} — Gobierno de accesos corporativos.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualReload}
            disabled={isLoading || isRefreshing}
            className="text-xs h-9"
          >
            <RefreshCw
              size={14}
              className={`mr-1.5 ${isLoading || isRefreshing ? 'animate-spin' : ''}`}
            />
            <span>Actualizar</span>
          </Button>

          {isMasterAdmin ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsInviteOpen(true)}
              className="text-xs h-9 shadow-md shadow-primary/20"
            >
              <UserPlus size={14} className="mr-1.5" />
              <span>Invitar Colaborador</span>
            </Button>
          ) : (
            <span className="text-[11px] text-text-muted bg-surface-2 px-2.5 py-1.5 rounded-lg border border-border">
              Solo lectura (Rol Empleado)
            </span>
          )}
        </div>
      </div>

      {notice && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 size={15} />
          <span>{notice}</span>
        </div>
      )}

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
