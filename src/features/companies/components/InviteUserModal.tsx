import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Loader2, UserPlus, X } from 'lucide-react';
import { InvitationTokenView } from './InvitationTokenView';
import { InviteRolePicker } from './InviteRolePicker';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { CompanyRole, InviteUserResult } from '../types';

interface InviteUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  isOwner: boolean;
  onInvite: (email: string, role: CompanyRole) => Promise<InviteUserResult>;
}

export const InviteUserModal: React.FC<InviteUserModalProps> = ({
  isOpen,
  onClose,
  isOwner,
  onInvite,
}) => {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<CompanyRole>('employee');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setEmail('');
      setRole('employee');
      setActionError(null);
      setGeneratedToken(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(cleanEmail)) {
      setActionError('Ingresa un correo electrónico con formato válido.');
      return;
    }

    if (role === 'master_admin' && !isOwner) {
      setActionError('Operación restringida: Solo el titular (dueño) de la empresa puede invitar a un administrador.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await onInvite(cleanEmail, role);
      if (result.success && result.token) {
        setGeneratedToken(result.token);
      } else {
        setActionError(result.error || 'No se pudo generar la invitación.');
      }
    } catch {
      setActionError('Error de comunicación con el servidor.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150 overflow-y-auto">
      <div
        className="fixed inset-0 -z-10"
        onClick={() => !isSubmitting && onClose()}
        aria-hidden="true"
      />

      <div
        className="relative w-full max-w-md bg-surface border border-border rounded-2xl shadow-2xl flex flex-col max-h-[calc(100vh-2rem)] sm:max-h-[90vh] my-auto overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 p-4 sm:p-5 border-b border-border flex items-center justify-between bg-surface-2/40">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
              <UserPlus size={18} />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-text-primary">
                Invitar Colaborador
              </h2>
              <p className="text-[11px] text-text-muted">
                Generá un código de invitación para tu equipo
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

        {/* Error Alert */}
        {actionError && (
          <div className="shrink-0 mx-4 mt-3 -mb-1 p-3 rounded-xl bg-danger/10 border border-danger/20 flex items-start gap-2.5 text-danger text-xs">
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            <p className="leading-relaxed">{actionError}</p>
          </div>
        )}

        {/* Generated Token Screen */}
        {generatedToken ? (
          <InvitationTokenView token={generatedToken} email={email} onClose={onClose} />
        ) : (
          /* Formulario de Emisión */
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            <Input
              label="Correo Electrónico del Destinatario"
              type="email"
              placeholder="colaborador@empresa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isSubmitting}
              required
            />

            <InviteRolePicker role={role} isOwner={isOwner} disabled={isSubmitting} onChange={setRole} />

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
                variant="primary"
                className="flex-1 text-xs h-9 justify-center"
                disabled={isSubmitting || !email.trim()}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={13} className="mr-1.5 animate-spin" />
                    <span>Generando...</span>
                  </>
                ) : (
                  <span>Emitir Invitación</span>
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null;
};
