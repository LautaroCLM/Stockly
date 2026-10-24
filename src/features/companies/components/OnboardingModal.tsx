import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Building2, KeyRound, AlertCircle, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useCompany } from '../hooks/useCompany';
import { validateCuit, formatCuit } from '../utils/cuitValidator';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'create' | 'join';
}

function isTokenLike(value: string): boolean {
  const clean = value.trim();
  return clean.length >= 32 && /^[0-9a-fA-F]+$/.test(clean);
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'create',
}) => {
  const { createCompany, acceptInvitation } = useCompany();
  const [activeTab, setActiveTab] = useState<'create' | 'join'>(initialTab);

  // Form: Crear Empresa
  const [companyName, setCompanyName] = useState('');
  const [cuit, setCuit] = useState('');
  const [cuitError, setCuitError] = useState<string | null>(null);

  // Form: Unirse por Invitación
  const [token, setToken] = useState('');

  // Estados de mutación
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Sincronizar tab inicial al abrir y cerrar con Escape
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setActionError(null);
    }
  }, [isOpen, initialTab]);

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

  const handleCuitChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const formatted = formatCuit(raw);
    setCuit(formatted);

    if (formatted.trim() === '') {
      setCuitError(null);
    } else if (!validateCuit(formatted)) {
      setCuitError('El CUIT ingresado no es válido (algoritmo Módulo 11).');
    } else {
      setCuitError(null);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);

    const trimmedName = companyName.trim();
    if (!trimmedName || trimmedName.length < 2) {
      setActionError('El nombre de la empresa debe tener al menos 2 caracteres.');
      return;
    }

    if (isTokenLike(trimmedName)) {
      setActionError(
        'El texto ingresado coincide con un token de invitación. Por favor seleccioná la pestaña "Aceptar Invitación" para canjearlo.'
      );
      return;
    }

    if (cuit && !validateCuit(cuit)) {
      setActionError('El CUIT no cumple con la validación de integridad numérica.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createCompany({
        name: trimmedName,
        taxId: cuit ? cuit.replace(/-/g, '') : undefined,
      });

      if (result.success) {
        onClose();
      } else {
        setActionError(result.error || 'No se pudo crear la empresa.');
      }
    } catch {
      setActionError('Error inesperado de comunicación con el servidor.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);

    const trimmedToken = token.trim();
    if (!trimmedToken) {
      setActionError('Por favor ingresa el token de invitación recibido.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await acceptInvitation(trimmedToken);

      if (result.success) {
        onClose();
      } else {
        setActionError(result.error || 'La invitación es inválida, expiró o no corresponde a tu usuario.');
      }
    } catch {
      setActionError('Error inesperado al canjear la invitación.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150 overflow-y-auto">
      {/* Fondo interactivo para cerrar */}
      <div
        className="fixed inset-0 -z-10"
        onClick={() => !isSubmitting && onClose()}
        aria-hidden="true"
      />

      {/* Contenedor del Modal: siempre visible y con scroll interno si la pantalla es baja */}
      <div
        className="relative w-full max-w-md bg-surface border border-border rounded-2xl shadow-2xl flex flex-col max-h-[calc(100vh-2rem)] sm:max-h-[90vh] my-auto overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Encabezado fijo superior */}
        <div className="shrink-0 p-4 sm:p-5 border-b border-border flex items-center justify-between bg-surface-2/40">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Building2 size={18} />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-text-primary">
                Gestión Multiempresa
              </h2>
              <p className="text-[11px] text-text-muted">
                Creación y vinculación de tenants
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors disabled:opacity-50"
            title="Cerrar ventana"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs de navegación fijas */}
        <div className="shrink-0 flex border-b border-border bg-surface-2/30 p-1.5 gap-1.5">
          <button
            type="button"
            onClick={() => {
              setActiveTab('create');
              setActionError(null);
            }}
            disabled={isSubmitting}
            className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${
              activeTab === 'create'
                ? 'bg-surface text-text-primary shadow-sm border border-border font-bold'
                : 'text-text-muted hover:text-text-secondary hover:bg-surface/50 border border-transparent'
            }`}
          >
            <Building2 size={14} className={activeTab === 'create' ? 'text-primary' : ''} />
            <span>Crear Empresa</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('join');
              setActionError(null);
            }}
            disabled={isSubmitting}
            className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${
              activeTab === 'join'
                ? 'bg-surface text-accent shadow-sm border border-border font-bold'
                : 'text-text-muted hover:text-text-secondary hover:bg-surface/50 border border-transparent'
            }`}
          >
            <KeyRound size={14} className={activeTab === 'join' ? 'text-accent' : ''} />
            <span>Aceptar Invitación</span>
          </button>
        </div>

        {/* Mensaje de error general fijo */}
        {actionError && (
          <div className="shrink-0 mx-4 mt-3 -mb-1 p-3 rounded-xl bg-danger/10 border border-danger/20 flex items-start gap-2.5 text-danger text-xs">
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            <p className="leading-relaxed">{actionError}</p>
          </div>
        )}

        {/* Contenido scrolleable: Tab Crear Empresa */}
        {activeTab === 'create' && (
          <form onSubmit={handleCreateSubmit} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            <Input
              label="Nombre de la Empresa"
              placeholder="Ej: Ferretería Norte S.A."
              value={companyName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setCompanyName(e.target.value);
                if (isTokenLike(e.target.value)) {
                  setActionError('Parece que pegaste un token de invitación. Seleccioná la pestaña "Aceptar Invitación" arriba.');
                } else if (actionError?.includes('token de invitación')) {
                  setActionError(null);
                }
              }}
              disabled={isSubmitting}
              error={isTokenLike(companyName) ? 'Parece un token de invitación. Usá la pestaña "Aceptar Invitación".' : undefined}
              required
            />

            <div className="space-y-1">
              <Input
                label="CUIT (Opcional)"
                placeholder="30-XXXXXXXX-X"
                value={cuit}
                onChange={handleCuitChange}
                disabled={isSubmitting}
                error={cuitError || undefined}
              />
              <p className="text-[10px] text-text-muted">
                Formato numérico con Módulo 11 para Argentina.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1 text-[11px] text-text-muted">
              <div className="p-2 rounded-lg bg-surface-2/60 border border-border/60">
                <span className="block text-[10px] uppercase font-mono text-text-muted">Moneda</span>
                <span className="font-semibold text-text-secondary">Pesos (ARS)</span>
              </div>
              <div className="p-2 rounded-lg bg-surface-2/60 border border-border/60">
                <span className="block text-[10px] uppercase font-mono text-text-muted">Zona Horaria</span>
                <span className="font-semibold text-text-secondary truncate block">Buenos Aires</span>
              </div>
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
                disabled={isSubmitting || !!cuitError || companyName.trim().length < 2 || isTokenLike(companyName)}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={13} className="mr-1.5 animate-spin" />
                    <span>Creando...</span>
                  </>
                ) : (
                  <span>Crear y Entrar</span>
                )}
              </Button>
            </div>
          </form>
        )}

        {/* Contenido scrolleable: Tab Aceptar Invitación */}
        {activeTab === 'join' && (
          <form onSubmit={handleJoinSubmit} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-text-primary flex items-center gap-1.5">
                <KeyRound size={13} className="text-accent" />
                <span>Token Criptográfico de Invitación</span>
              </label>
              <textarea
                value={token}
                onChange={(e) => {
                  setToken(e.target.value);
                  if (actionError) setActionError(null);
                }}
                placeholder="Pegá aquí el token hexadecimal de 64 caracteres recibido..."
                disabled={isSubmitting}
                rows={3}
                className="w-full text-xs font-mono bg-surface-2 border border-border/80 focus:border-accent/60 rounded-lg p-2.5 text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/40 resize-none transition-all"
                required
              />
              <p className="text-[10px] text-text-muted leading-relaxed">
                El token es intransferible y debe coincidir con el correo electrónico de tu cuenta autenticada.
              </p>
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
                className="flex-1 text-xs h-9 justify-center bg-accent hover:bg-accent/90 text-white"
                disabled={isSubmitting || !token.trim()}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={13} className="mr-1.5 animate-spin" />
                    <span>Validando...</span>
                  </>
                ) : (
                  <span>Canjear Invitación</span>
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
