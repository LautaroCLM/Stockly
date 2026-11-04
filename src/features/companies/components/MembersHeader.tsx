import React from 'react';
import { CheckCircle2, RefreshCw, ShieldAlert, UserPlus, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { Company } from '@/types';

export type MembersNotice = { type: 'success' | 'error'; message: string } | null;

interface MembersHeaderProps {
  company: Company;
  isMasterAdmin: boolean;
  isBusy: boolean;
  notice: MembersNotice;
  onReload: () => void;
  onInvite: () => void;
}

/** Título de Miembros con recarga, invitación y el aviso de la última operación. */
export const MembersHeader: React.FC<MembersHeaderProps> = ({ company, isMasterAdmin, isBusy, notice, onReload, onInvite }) => (
  <>
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
      <div>
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold text-text-primary tracking-tight">Gestión de Miembros e Invitaciones</h1>
        </div>
        <p className="text-xs text-text-secondary mt-1">
          Empresa activa: <span className="font-semibold text-text-primary">{company.name}</span>
          {company.cuit ? ` (${company.cuit})` : ''} — Quién tiene acceso y con qué rol.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onReload} disabled={isBusy} className="text-xs h-9">
          <RefreshCw size={14} className={`mr-1.5 ${isBusy ? 'animate-spin' : ''}`} />
          <span>Actualizar</span>
        </Button>
        {isMasterAdmin ? (
          <Button variant="primary" size="sm" onClick={onInvite} className="text-xs h-9 shadow-md shadow-primary/20">
            <UserPlus size={14} className="mr-1.5" />
            <span>Invitar Colaborador</span>
          </Button>
        ) : (
          <span className="text-[11px] text-text-muted bg-surface-2 px-2.5 py-1.5 rounded-lg border border-border">Solo lectura (Rol Empleado)</span>
        )}
      </div>
    </div>

    {notice && (
      <div role={notice.type === 'error' ? 'alert' : 'status'}
        className={`p-3 rounded-xl text-xs flex items-center gap-2 animate-in fade-in border ${
          notice.type === 'error' ? 'bg-danger/10 border-danger/20 text-danger' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
        }`}>
        {notice.type === 'error' ? <ShieldAlert size={15} /> : <CheckCircle2 size={15} />}
        <span>{notice.message}</span>
      </div>
    )}
  </>
);
