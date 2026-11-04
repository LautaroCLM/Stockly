import React, { useState } from 'react';
import { AlertCircle, Building2, KeyRound, LogOut, Mail, RefreshCw, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useCompany } from '../hooks/useCompany';
import { CreateCompanyForm, JoinCompanyForm } from './OnboardingForms';

interface NoCompanyPageProps {
  userEmail?: string;
  userName?: string;
  onSignOut: () => void;
  onRefresh?: () => void;
}

type Tab = 'create' | 'join';

const TAB_CLASS = 'flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2';

/** Usuario sin empresas: crear una o canjear una invitación. */
export const NoCompanyPage: React.FC<NoCompanyPageProps> = ({ userEmail, userName, onSignOut, onRefresh }) => {
  const { isLoading } = useCompany();
  const [activeTab, setActiveTab] = useState<Tab>('create');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const isBusy = isSubmitting || isLoading;

  const selectTab = (tab: Tab) => {
    setActiveTab(tab);
    setActionError(null);
  };
  // Al crear o canjear, el contexto de empresas pasa solo al espacio de trabajo
  const formProps = { isSubmitting: isBusy, setSubmitting: setIsSubmitting, error: actionError, setError: setActionError, onDone: () => undefined };

  return (
    <div className="min-h-screen bg-bg flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-surface-2 border border-border shadow-lg mb-2">
            <img src="/stockly.png" alt="Logo de Stockly" className="w-9 h-9 object-contain" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">Stockly</h1>
          <p className="text-sm text-text-muted">Empezá creando tu empresa o sumándote a una existente</p>
        </div>

        <div className="bg-surface border border-border rounded-2xl shadow-xl overflow-hidden">
          <div className="p-4 sm:p-5 bg-surface-2/40 border-b border-border space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-warning/10 border border-warning/20 text-warning text-xs">
              <Building2 className="w-4 h-4 shrink-0 mt-0.5 text-warning" />
              <div className="space-y-0.5">
                <p className="font-semibold text-warning-light">Sin membresía activa</p>
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
              {userName && userName !== 'Usuario' && <span className="text-[11px] font-medium text-text-secondary truncate">{userName}</span>}
            </div>
          </div>

          <div className="flex border-b border-border bg-surface-2/20 p-1.5 gap-1.5" role="tablist">
            {(['create', 'join'] as const).map((tab) => (
              <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} onClick={() => selectTab(tab)} disabled={isBusy}
                className={`${TAB_CLASS} ${activeTab === tab ? 'bg-surface text-text-primary shadow-sm border border-border/80' : 'text-text-muted hover:text-text-secondary hover:bg-surface/50'}`}>
                {tab === 'create' ? (
                  <Building2 size={14} className={activeTab === tab ? 'text-primary' : ''} />
                ) : (
                  <KeyRound size={14} className={activeTab === tab ? 'text-accent' : ''} />
                )}
                <span>{tab === 'create' ? 'Crear Empresa' : 'Aceptar Invitación'}</span>
              </button>
            ))}
          </div>

          {actionError && (
            <div role="alert" className="m-4 mb-0 p-3 rounded-xl bg-danger/10 border border-danger/20 flex items-start gap-2 text-danger text-xs">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <p className="leading-relaxed">{actionError}</p>
            </div>
          )}

          {activeTab === 'create' ? (
            <>
              <CreateCompanyForm {...formProps} />
              <p className="mx-5 sm:mx-6 -mt-1 mb-4 p-3 rounded-xl bg-surface-2/40 border border-border/60 text-[11px] text-text-muted leading-relaxed">
                Al crear la empresa, te convertirás automáticamente en su titular y Administrador.
              </p>
            </>
          ) : (
            <JoinCompanyForm {...formProps} />
          )}

          <div className="p-4 bg-surface-2/40 border-t border-border flex items-center justify-between gap-2">
            {onRefresh && (
              <Button variant="outline" size="sm" className="text-xs h-8" onClick={onRefresh} disabled={isBusy}>
                <RefreshCw size={13} className="mr-1.5" />
                <span>Comprobar acceso</span>
              </Button>
            )}
            <Button variant="danger" size="sm" className="text-xs h-8" onClick={onSignOut} disabled={isSubmitting}>
              <LogOut size={13} className="mr-1.5" />
              <span>Cerrar sesión</span>
            </Button>
          </div>
        </div>

        <p className="text-center text-[11px] text-text-muted flex items-center justify-center gap-1.5">
          <ShieldAlert size={12} className="text-primary" />
          <span>Cada empresa ve solo sus propios datos</span>
        </p>
      </div>
    </div>
  );
};
