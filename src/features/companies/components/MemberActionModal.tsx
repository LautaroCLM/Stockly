import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ShieldAlert, Loader2, X, UserX, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { CompanyMember, CompanyRole } from '../types';

interface MemberActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: CompanyMember | null;
  mode: 'deactivate' | 'reactivate';
  onConfirmDeactivate: (userId: string, reason: string) => Promise<{ success: boolean; error?: string }>;
  onConfirmReactivate: (
    userId: string,
    newRole: CompanyRole,
    reason: string
  ) => Promise<{ success: boolean; error?: string }>;
}

export const MemberActionModal: React.FC<MemberActionModalProps> = ({
  isOpen,
  onClose,
  member,
  mode,
  onConfirmDeactivate,
  onConfirmReactivate,
}) => {
  const [reason, setReason] = useState('');
  const [newRole, setNewRole] = useState<CompanyRole>('employee');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setNewRole(member?.role || 'employee');
      setActionError(null);
    }
  }, [isOpen, member]);

  if (!isOpen || !member) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);

    const cleanReason = reason.trim();
    if (!cleanReason) {
      setActionError('Debes ingresar un motivo justificatorio obligatorio para la auditoría.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result =
        mode === 'deactivate'
          ? await onConfirmDeactivate(member.userId, cleanReason)
          : await onConfirmReactivate(member.userId, newRole, cleanReason);

      if (result.success) {
        onClose();
      } else {
        setActionError(result.error || 'No se pudo completar la operación.');
      }
    } catch {
      setActionError('Error de comunicación con el servidor.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isDeactivate = mode === 'deactivate';

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150 overflow-y-auto">
      <div className="fixed inset-0 -z-10" onClick={() => !isSubmitting && onClose()} aria-hidden="true" />

      <div
        className="relative w-full max-w-md bg-surface border border-border rounded-2xl shadow-2xl flex flex-col my-auto overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between bg-surface-2/40">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
                isDeactivate
                  ? 'bg-danger/10 border-danger/20 text-danger'
                  : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              }`}
            >
              {isDeactivate ? <UserX size={18} /> : <UserCheck size={18} />}
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-text-primary">
                {isDeactivate ? 'Desactivar Colaborador' : 'Reactivar Colaborador'}
              </h2>
              <p className="text-[11px] text-text-muted">
                {member.email || member.fullName || `Usuario ${member.userId.substring(0, 8)}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>

        {actionError && (
          <div className="mx-4 mt-3 -mb-1 p-3 rounded-xl bg-danger/10 border border-danger/20 flex items-start gap-2.5 text-danger text-xs">
            <ShieldAlert size={15} className="shrink-0 mt-0.5" />
            <p className="leading-relaxed">{actionError}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
          {!isDeactivate && (
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-text-secondary">
                Rol a Asignar
              </label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as CompanyRole)}
                disabled={isSubmitting}
                className="w-full h-9 text-xs bg-surface-2 border border-border rounded-lg px-2.5 text-text-primary focus:outline-none focus:border-primary"
              >
                <option value="employee">Empleado</option>
                <option value="master_admin">Administrador</option>
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-text-secondary">
              Motivo Justificatorio (Auditado en PostgreSQL)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                isDeactivate
                  ? 'Ej: Baja temporal de actividades o cese de relación laboral...'
                  : 'Ej: Reincorporación al equipo operativo...'
              }
              rows={3}
              disabled={isSubmitting}
              className="w-full text-xs bg-surface-2 border border-border focus:border-primary rounded-lg p-2.5 text-text-primary placeholder:text-text-muted focus:outline-none resize-none"
              required
            />
          </div>

          <div className="pt-2 flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1 text-xs h-9"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant={isDeactivate ? 'danger' : 'primary'}
              className="flex-1 text-xs h-9 justify-center"
              disabled={isSubmitting || !reason.trim()}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={13} className="mr-1.5 animate-spin" />
                  <span>Procesando...</span>
                </>
              ) : (
                <span>{isDeactivate ? 'Confirmar Baja' : 'Reactivar'}</span>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null;
};
