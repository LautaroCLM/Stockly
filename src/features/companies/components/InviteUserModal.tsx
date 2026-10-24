import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { UserPlus, AlertCircle, Loader2, X, Copy, Check, KeyRound, Info } from 'lucide-react';
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
  const [hasCopied, setHasCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setEmail('');
      setRole('employee');
      setActionError(null);
      setGeneratedToken(null);
      setHasCopied(false);
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

  const handleCopyToken = () => {
    if (generatedToken) {
      navigator.clipboard.writeText(generatedToken);
      setHasCopied(true);
      setTimeout(() => setHasCopied(false), 3000);
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
                Emisión de token de acceso criptográfico
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
          <div className="p-4 sm:p-5 space-y-4">
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
              <Check size={16} className="shrink-0" />
              <span>Invitación generada exitosamente. Vigencia: 7 días.</span>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-text-primary flex items-center gap-1.5">
                <KeyRound size={13} className="text-accent" />
                <span>Token Criptográfico (Un Solo Uso)</span>
              </label>
              <div className="relative">
                <textarea
                  readOnly
                  value={generatedToken}
                  rows={3}
                  className="w-full text-xs font-mono bg-surface-2 border border-border rounded-lg p-2.5 pr-10 text-text-primary resize-none select-all focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopyToken}
                  className="absolute right-2 top-2 p-1.5 rounded-md text-text-muted hover:text-text-primary bg-surface-3 hover:bg-surface border border-border transition-colors"
                  title="Copiar token"
                >
                  {hasCopied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                </button>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-surface-2/60 border border-border/80 text-[11px] text-text-muted space-y-1.5">
              <div className="flex items-center gap-1.5 text-text-secondary font-medium">
                <Info size={13} className="text-primary shrink-0" />
                <span>Instrucciones de entrega</span>
              </div>
              <p className="leading-relaxed">
                Entrégale este código al usuario <strong>{email}</strong>. Debe ingresar a Stockly y canjearlo desde la opción <em>«Aceptar invitación»</em> en el selector de empresa superior.
              </p>
            </div>

            <Button
              type="button"
              variant="primary"
              className="w-full text-xs h-9 justify-center"
              onClick={onClose}
            >
              Listo, Cerrar Ventana
            </Button>
          </div>
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

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-text-secondary">
                Rol en la Empresa
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRole('employee')}
                  disabled={isSubmitting}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    role === 'employee'
                      ? 'bg-primary/10 border-primary/40 text-primary-light shadow-sm'
                      : 'bg-surface-2/50 border-border/70 text-text-secondary hover:bg-surface-2'
                  }`}
                >
                  <span className="text-xs font-bold block">Empleado</span>
                  <span className="text-[10px] text-text-muted block mt-0.5">
                    Ventas y catálogo en modo operativo.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setRole('master_admin')}
                  disabled={isSubmitting || !isOwner}
                  title={!isOwner ? 'Solo el titular puede invitar administradores' : undefined}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    !isOwner
                      ? 'opacity-40 cursor-not-allowed bg-surface-2/30 border-border/40'
                      : role === 'master_admin'
                      ? 'bg-accent/10 border-accent/40 text-accent shadow-sm'
                      : 'bg-surface-2/50 border-border/70 text-text-secondary hover:bg-surface-2'
                  }`}
                >
                  <span className="text-xs font-bold block">Administrador</span>
                  <span className="text-[10px] text-text-muted block mt-0.5">
                    Acceso total a gobierno y configuración.
                  </span>
                </button>
              </div>

              {!isOwner && (
                <p className="text-[10px] text-text-muted italic">
                  * Solo el titular de la empresa puede invitar nuevos administradores.
                </p>
              )}
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
