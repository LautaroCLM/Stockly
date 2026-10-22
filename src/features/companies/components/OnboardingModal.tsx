import React, { useState } from 'react';
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between bg-surface-2/40">
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
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors disabled:opacity-50"
            title="Cerrar ventana"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs de navegación */}
        <div className="flex border-b border-border bg-surface-2/20 p-1 gap-1">
          <button
            type="button"
            onClick={() => {
              setActiveTab('create');
              setActionError(null);
            }}
            disabled={isSubmitting}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${
              activeTab === 'create'
                ? 'bg-surface text-text-primary shadow-sm border border-border/80'
                : 'text-text-muted hover:text-text-secondary hover:bg-surface/50'
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
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${
              activeTab === 'join'
                ? 'bg-surface text-text-primary shadow-sm border border-border/80'
                : 'text-text-muted hover:text-text-secondary hover:bg-surface/50'
            }`}
          >
            <KeyRound size={14} className={activeTab === 'join' ? 'text-accent' : ''} />
            <span>Aceptar Invitación</span>
          </button>
        </div>

        {/* Mensaje de error general */}
        {actionError && (
          <div className="m-4 mb-0 p-3 rounded-xl bg-danger/10 border border-danger/20 flex items-start gap-2.5 text-danger text-xs">
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            <p className="leading-relaxed">{actionError}</p>
          </div>
        )}

        {/* Contenido: Tab Crear Empresa */}
        {activeTab === 'create' && (
          <form onSubmit={handleCreateSubmit} className="p-4 sm:p-5 space-y-4">
            <Input
              label="Nombre de la Empresa"
              placeholder="Ej: Ferretería Norte S.A."
              value={companyName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCompanyName(e.target.value)}
              disabled={isSubmitting}
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
                disabled={isSubmitting || !!cuitError || companyName.trim().length < 2}
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

        {/* Contenido: Tab Aceptar Invitación */}
        {activeTab === 'join' && (
          <form onSubmit={handleJoinSubmit} className="p-4 sm:p-5 space-y-4">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-text-secondary">
                Token Criptográfico de Invitación
              </label>
              <textarea
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Pega aquí el código recibido por correo..."
                disabled={isSubmitting}
                rows={3}
                className="w-full text-xs font-mono bg-surface-2 border border-border/80 focus:border-primary/50 rounded-lg p-2.5 text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary/40 resize-none transition-all"
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
                className="flex-1 text-xs h-9 justify-center"
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
};
