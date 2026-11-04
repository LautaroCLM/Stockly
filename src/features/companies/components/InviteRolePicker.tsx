import React from 'react';
import type { CompanyRole } from '../types';

interface InviteRolePickerProps {
  role: CompanyRole;
  isOwner: boolean;
  disabled: boolean;
  onChange: (role: CompanyRole) => void;
}

/** Rol de la persona invitada; solo el titular puede invitar administradores. */
export const InviteRolePicker: React.FC<InviteRolePickerProps> = ({ role, isOwner, disabled, onChange }) => (
  <div className="space-y-1.5">
    <span className="block text-xs font-medium text-text-secondary">Rol en la Empresa</span>
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Rol en la empresa">
      <button type="button" role="radio" aria-checked={role === 'employee'} onClick={() => onChange('employee')} disabled={disabled}
        className={`p-3 rounded-xl border text-left transition-all ${
          role === 'employee' ? 'bg-primary/10 border-primary/40 text-primary-light shadow-sm' : 'bg-surface-2/50 border-border/70 text-text-secondary hover:bg-surface-2'
        }`}>
        <span className="text-xs font-bold block">Empleado</span>
        <span className="text-[10px] text-text-muted block mt-0.5">Ventas y catálogo en modo operativo.</span>
      </button>
      <button type="button" role="radio" aria-checked={role === 'master_admin'} onClick={() => onChange('master_admin')}
        disabled={disabled || !isOwner} title={!isOwner ? 'Solo el titular puede invitar administradores' : undefined}
        className={`p-3 rounded-xl border text-left transition-all ${
          !isOwner
            ? 'opacity-40 cursor-not-allowed bg-surface-2/30 border-border/40'
            : role === 'master_admin'
              ? 'bg-accent/10 border-accent/40 text-accent shadow-sm'
              : 'bg-surface-2/50 border-border/70 text-text-secondary hover:bg-surface-2'
        }`}>
        <span className="text-xs font-bold block">Administrador</span>
        <span className="text-[10px] text-text-muted block mt-0.5">Acceso total a la configuración de la empresa.</span>
      </button>
    </div>
    {!isOwner && <p className="text-[10px] text-text-muted italic">* Solo el titular de la empresa puede invitar nuevos administradores.</p>}
  </div>
);
