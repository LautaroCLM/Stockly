import React, { useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useCompany } from '../hooks/useCompany';
import { validateCuit, formatCuit } from '../utils/cuitValidator';
import { PermissionsEditor } from '@/features/permisos/components/PermissionsEditor';
import { saveModulePermissions } from '@/features/permisos/api/permissionsApi';
import { DEFAULT_LEVELS, MODULE_KEYS } from '@/features/permisos/types';
import type { ModuleLevels } from '@/features/permisos/types';

/** Un token de invitación es hexadecimal y largo: si lo pegan como nombre, se avisa. */
export function isTokenLike(value: string): boolean {
  const clean = value.trim();
  return clean.length >= 32 && /^[0-9a-fA-F]+$/.test(clean);
}

interface OnboardingFormProps {
  isSubmitting: boolean;
  setSubmitting: (value: boolean) => void;
  error: string | null;
  setError: (message: string | null) => void;
  onDone: () => void;
  /** Sin onCancel no se muestra el botón Cancelar (pantalla completa, no modal). */
  onCancel?: () => void;
}

const SubmitLabel: React.FC<{ busy: boolean; busyText: string; text: string }> = ({ busy, busyText, text }) =>
  busy ? (
    <>
      <Loader2 size={13} className="mr-1.5 animate-spin" />
      <span>{busyText}</span>
    </>
  ) : (
    <span>{text}</span>
  );

/** Alta de una empresa nueva (nombre y CUIT opcional). */
export const CreateCompanyForm: React.FC<OnboardingFormProps> = ({ isSubmitting, setSubmitting, error, setError, onDone, onCancel }) => {
  const { createCompany } = useCompany();
  const [companyName, setCompanyName] = useState('');
  const [cuit, setCuit] = useState('');
  const [cuitError, setCuitError] = useState<string | null>(null);
  const [levels, setLevels] = useState<ModuleLevels>(DEFAULT_LEVELS);
  const [showPermissions, setShowPermissions] = useState(false);

  const handleCuitChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCuit(e.target.value);
    setCuit(formatted);
    setCuitError(formatted.trim() !== '' && !validateCuit(formatted) ? 'El CUIT ingresado no es válido (algoritmo Módulo 11).' : null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const name = companyName.trim();
    if (name.length < 2) return setError('El nombre de la empresa debe tener al menos 2 caracteres.');
    if (isTokenLike(name)) {
      return setError('El texto ingresado coincide con un token de invitación. Por favor seleccioná la pestaña "Aceptar Invitación" para canjearlo.');
    }
    if (cuit && !validateCuit(cuit)) return setError('El CUIT no cumple con la validación de integridad numérica.');

    setSubmitting(true);
    try {
      const result = await createCompany({ name, taxId: cuit ? cuit.replace(/-/g, '') : undefined });
      if (result.success) {
        // Solo se guarda si el dueño cambió algo: sin configuración rige lo de siempre. Si falla, se edita después en Permisos.
        const changed = MODULE_KEYS.some((k) => levels[k] !== DEFAULT_LEVELS[k]);
        if (changed && result.companyId) await saveModulePermissions(result.companyId, levels);
        onDone();
      } else setError(result.error || 'No se pudo crear la empresa.');
    } catch {
      setError('Error inesperado de comunicación con el servidor.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
      <Input
        label="Nombre de la Empresa"
        placeholder="Ej: Ferretería Norte S.A."
        value={companyName}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          setCompanyName(e.target.value);
          if (isTokenLike(e.target.value)) {
            setError('Parece que pegaste un token de invitación. Seleccioná la pestaña "Aceptar Invitación" arriba.');
          } else if (error?.includes('token de invitación')) {
            setError(null);
          }
        }}
        disabled={isSubmitting}
        error={isTokenLike(companyName) ? 'Parece un token de invitación. Usá la pestaña "Aceptar Invitación".' : undefined}
        required
      />
      <div className="space-y-1">
        <Input label="CUIT (Opcional)" placeholder="30-XXXXXXXX-X" value={cuit} onChange={handleCuitChange}
          disabled={isSubmitting} error={cuitError || undefined} />
        <p className="text-[10px] text-text-muted">Formato numérico con Módulo 11 para Argentina.</p>
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
      <div className="space-y-2">
        <button type="button" onClick={() => setShowPermissions((v) => !v)} aria-expanded={showPermissions}
          className="text-xs font-semibold text-primary hover:underline">
          {showPermissions ? 'Ocultar permisos del equipo' : 'Elegir qué puede usar tu equipo (opcional)'}
        </button>
        {showPermissions && (
          <>
            <PermissionsEditor levels={levels} onChange={setLevels} disabled={isSubmitting} />
            <p className="text-[10px] text-text-muted">Los administradores siempre ven todo. Podés cambiarlo cuando quieras desde Permisos.</p>
          </>
        )}
      </div>
      <div className="pt-2 flex gap-2">
        {onCancel && <Button type="button" variant="outline" className="flex-1 text-xs h-9" onClick={onCancel} disabled={isSubmitting}>Cancelar</Button>}
        <Button type="submit" variant="primary" className="flex-1 text-xs h-9 justify-center"
          disabled={isSubmitting || !!cuitError || companyName.trim().length < 2 || isTokenLike(companyName)}>
          <SubmitLabel busy={isSubmitting} busyText="Creando..." text="Crear y Entrar" />
        </Button>
      </div>
    </form>
  );
};

/** Canje de una invitación con su token. */
export const JoinCompanyForm: React.FC<OnboardingFormProps> = ({ isSubmitting, setSubmitting, error, setError, onDone, onCancel }) => {
  const { acceptInvitation } = useCompany();
  const [token, setToken] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = token.trim();
    if (!trimmed) return setError('Por favor ingresa el token de invitación recibido.');
    setSubmitting(true);
    try {
      const result = await acceptInvitation(trimmed);
      if (result.success) onDone();
      else setError(result.error || 'La invitación es inválida, expiró o no corresponde a tu usuario.');
    } catch {
      setError('Error inesperado al canjear la invitación.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="invitation-token" className="block text-xs font-semibold text-text-primary flex items-center gap-1.5">
          <KeyRound size={13} className="text-accent" />
          <span>Token Criptográfico de Invitación</span>
        </label>
        <textarea id="invitation-token" value={token} rows={3} required disabled={isSubmitting}
          onChange={(e) => {
            setToken(e.target.value);
            if (error) setError(null);
          }}
          placeholder="Pegá aquí el token hexadecimal de 64 caracteres recibido..."
          className="w-full text-xs font-mono bg-surface-2 border border-border/80 focus:border-accent/60 rounded-lg p-2.5 text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/40 resize-none transition-all" />
        <p className="text-[10px] text-text-muted leading-relaxed">
          El token es intransferible y debe coincidir con el correo electrónico de tu cuenta autenticada.
        </p>
      </div>
      <div className="pt-2 flex gap-2">
        {onCancel && <Button type="button" variant="outline" className="flex-1 text-xs h-9" onClick={onCancel} disabled={isSubmitting}>Cancelar</Button>}
        <Button type="submit" variant="primary" className="flex-1 text-xs h-9 justify-center bg-accent hover:bg-accent/90 text-white"
          disabled={isSubmitting || !token.trim()}>
          <SubmitLabel busy={isSubmitting} busyText="Validando..." text="Canjear Invitación" />
        </Button>
      </div>
    </form>
  );
};
