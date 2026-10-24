import React, { useState } from 'react';
import { Building2, ShieldAlert, LogOut, RefreshCw, Mail, KeyRound, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useCompany } from '../hooks/useCompany';
import { validateCuit, formatCuit } from '../utils/cuitValidator';

interface NoCompanyPageProps {
  userEmail?: string;
  userName?: string;
  onSignOut: () => void;
  onRefresh?: () => void;
}

function isTokenLike(value: string): boolean {
  const clean = value.trim();
  return clean.length >= 32 && /^[0-9a-fA-F]+$/.test(clean);
}

export const NoCompanyPage: React.FC<NoCompanyPageProps> = ({
  userEmail,
  userName,
  onSignOut,
  onRefresh,
}) => {
  const { createCompany, acceptInvitation, isLoading } = useCompany();
  const [activeTab, setActiveTab] = useState<'create' | 'join'>('create');

  // Form: Crear Empresa
  const [companyName, setCompanyName] = useState('');
  const [cuit, setCuit] = useState('');
  const [cuitError, setCuitError] = useState<string | null>(null);

  // Form: Unirse por Invitación
  const [token, setToken] = useState('');

  // Estados de mutación
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

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

      if (!result.success) {
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

      if (!result.success) {
        setActionError(result.error || 'La invitación es inválida, expiró o no corresponde a tu usuario.');
      }
    } catch {
      setActionError('Error inesperado al canjear la invitación.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-lg space-y-6">
        {/* Header con isotipo */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-surface-2 border border-border shadow-lg mb-2">
            <img
              src="/stockly.png"
              alt="Logo de Stockly"
              className="w-9 h-9 object-contain"
            />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            Stockly
          </h1>
          <p className="text-sm text-text-muted">
            Onboarding y Gestión Multiempresa
          </p>
        </div>

        {/* Tarjeta principal de onboarding */}
        <div className="bg-surface border border-border rounded-2xl shadow-xl overflow-hidden space-y-0">
          {/* Alerta de contexto */}
          <div className="p-4 sm:p-5 bg-surface-2/40 border-b border-border space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-warning/10 border border-warning/20 text-warning text-xs">
              <Building2 className="w-4 h-4 shrink-0 mt-0.5 text-warning" />
              <div className="space-y-0.5">
                <p className="font-semibold text-warning-light">
                  Sin membresía activa
                </p>
                <p className="text-text-secondary leading-relaxed">
                  Para ingresar al espacio de trabajo, crea una nueva empresa o canjea una invitación enviada a tu correo.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-text-muted px-1">
              <div className="flex items-center gap-1.5 truncate">
                <Mail className="w-3.5 h-3.5 text-text-muted shrink-0" />
                <span className="truncate">{userEmail || 'Usuario autenticado'}</span>
              </div>
              {userName && userName !== 'Usuario' && (
                <span className="text-[11px] font-medium text-text-secondary truncate">{userName}</span>
              )}
            </div>
          </div>

          {/* Selector de pestañas */}
          <div className="flex border-b border-border bg-surface-2/20 p-1.5 gap-1.5">
            <button
              type="button"
              onClick={() => {
                setActiveTab('create');
                setActionError(null);
              }}
              disabled={isSubmitting || isLoading}
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
              disabled={isSubmitting || isLoading}
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

          {/* Banner de error de acción */}
          {actionError && (
            <div className="m-4 mb-0 p-3 rounded-xl bg-danger/10 border border-danger/20 flex items-start gap-2 text-danger text-xs">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <p className="leading-relaxed">{actionError}</p>
            </div>
          )}

          {/* Tab 1: Formulario Crear Empresa */}
          {activeTab === 'create' && (
            <form onSubmit={handleCreateSubmit} className="p-5 sm:p-6 space-y-4">
              <Input
                label="Nombre de la Empresa"
                placeholder="Ej: Distribuidora Central S.A."
                value={companyName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCompanyName(e.target.value)}
                disabled={isSubmitting || isLoading}
                required
              />

              <div className="space-y-1">
                <Input
                  label="CUIT (Opcional)"
                  placeholder="30-XXXXXXXX-X"
                  value={cuit}
                  onChange={handleCuitChange}
                  disabled={isSubmitting || isLoading}
                  error={cuitError || undefined}
                />
                <p className="text-[10px] text-text-muted">
                  Formato de 11 dígitos con validación algorítmica Módulo 11 para Argentina.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 text-[11px] text-text-muted">
                <div className="p-2.5 rounded-lg bg-surface-2/60 border border-border/60">
                  <span className="block text-[10px] uppercase font-mono text-text-muted">Moneda</span>
                  <span className="font-semibold text-text-secondary">Pesos (ARS)</span>
                </div>
                <div className="p-2.5 rounded-lg bg-surface-2/60 border border-border/60">
                  <span className="block text-[10px] uppercase font-mono text-text-muted">Zona Horaria</span>
                  <span className="font-semibold text-text-secondary truncate block">Buenos Aires</span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-surface-2/40 border border-border/60 text-[11px] text-text-muted leading-relaxed">
                Al crear la empresa, te convertirás automáticamente en su titular y Administrador con máximos privilegios de gobernanza.
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  className="w-full text-xs h-10 justify-center shadow-sm"
                  disabled={isSubmitting || isLoading || !!cuitError || companyName.trim().length < 2}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={14} className="mr-2 animate-spin" />
                      <span>Creando empresa y asignando membresía...</span>
                    </>
                  ) : (
                    <span>Crear Empresa y Entrar</span>
                  )}
                </Button>
              </div>
            </form>
          )}

          {/* Tab 2: Formulario Aceptar Invitación */}
          {activeTab === 'join' && (
            <form onSubmit={handleJoinSubmit} className="p-5 sm:p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-text-secondary">
                  Token Criptográfico de Invitación
                </label>
                <textarea
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Pega aquí el token recibido por correo electrónico..."
                  disabled={isSubmitting || isLoading}
                  rows={3}
                  className="w-full text-xs font-mono bg-surface-2 border border-border/80 focus:border-primary/50 rounded-lg p-2.5 text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary/40 resize-none transition-all"
                  required
                />
                <p className="text-[10px] text-text-muted leading-relaxed">
                  El token es intransferible y debe coincidir exactamente con el correo electrónico de tu cuenta autenticada.
                </p>
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  className="w-full text-xs h-10 justify-center shadow-sm"
                  disabled={isSubmitting || isLoading || !token.trim()}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={14} className="mr-2 animate-spin" />
                      <span>Verificando y canjeando invitación...</span>
                    </>
                  ) : (
                    <span>Canjear Invitación e Ingresar</span>
                  )}
                </Button>
              </div>
            </form>
          )}

          {/* Pie con opciones secundarias */}
          <div className="p-4 bg-surface-2/40 border-t border-border flex items-center justify-between gap-2">
            {onRefresh && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-8"
                onClick={onRefresh}
                disabled={isSubmitting || isLoading}
              >
                <RefreshCw size={13} className="mr-1.5" />
                <span>Comprobar acceso</span>
              </Button>
            )}
            <Button
              variant="danger"
              size="sm"
              className="text-xs h-8"
              onClick={onSignOut}
              disabled={isSubmitting}
            >
              <LogOut size={13} className="mr-1.5" />
              <span>Cerrar sesión</span>
            </Button>
          </div>
        </div>

        {/* Pie institucional */}
        <p className="text-center text-[11px] text-text-muted flex items-center justify-center gap-1.5">
          <ShieldAlert size={12} className="text-primary" />
          <span>Aislamiento multiempresa gobernado por Supabase RLS</span>
        </p>
      </div>
    </div>
  );
};
