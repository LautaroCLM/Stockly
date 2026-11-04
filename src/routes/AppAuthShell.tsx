import React from 'react';
import { Building2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { LoginPage } from '@/features/auth/components/LoginPage';
import { useCompany } from '@/features/companies/hooks/useCompany';
import { NoCompanyPage } from '@/features/companies/components/NoCompanyPage';
import { AppWorkspace } from './AppWorkspace';

const LoadingScreen: React.FC = () => (
  <div className="min-h-screen w-full bg-bg flex flex-col justify-center items-center p-4">
    <div className="w-12 h-12 rounded-xl bg-surface-2 border border-border flex items-center justify-center p-2 mb-4 shadow-lg shadow-black/30">
      <img src="/stockly.png" alt="Logo de Stockly" className="w-full h-full object-contain" />
    </div>
    <div className="flex items-center gap-2 text-text-muted text-xs">
      <Loader2 size={16} className="animate-spin text-primary" />
      <span>Verificando membresías corporativas...</span>
    </div>
  </div>
);

const CompanyErrorScreen: React.FC<{ message: string; onRetry: () => void; onSignOut: () => void }> = ({
  message,
  onRetry,
  onSignOut,
}) => (
  <div className="min-h-screen bg-bg flex flex-col justify-center items-center p-4">
    <div className="w-full max-w-md bg-surface border border-danger/40 rounded-2xl p-6 shadow-xl space-y-4 text-center">
      <div className="w-12 h-12 rounded-full bg-danger/10 text-danger flex items-center justify-center mx-auto">
        <Building2 className="w-6 h-6" />
      </div>
      <h2 className="text-lg font-bold text-text-primary">Error al cargar empresas</h2>
      <p className="text-xs text-text-secondary leading-relaxed">{message}</p>
      <div className="flex gap-2 pt-2">
        <Button variant="outline" className="flex-1 text-xs" onClick={onRetry}>
          Reintentar
        </Button>
        <Button variant="danger" className="flex-1 text-xs" onClick={onSignOut}>
          Cerrar sesión
        </Button>
      </div>
    </div>
  </div>
);

/** Decide qué mostrar según la sesión y las empresas del usuario. */
export const AppAuthShell: React.FC = () => {
  const { user, profile, isLoading: isAuthLoading, signOut } = useAuth();
  const { companies, activeCompany, userRole, isLoading: isCompanyLoading, error, selectCompany, refreshCompanies } =
    useCompany();

  if (isAuthLoading || (user && isCompanyLoading)) return <LoadingScreen />;
  if (!user) return <LoginPage />;
  if (error) return <CompanyErrorScreen message={error} onRetry={refreshCompanies} onSignOut={signOut} />;

  if (!activeCompany || companies.length === 0) {
    return (
      <NoCompanyPage userEmail={user.email} userName={profile?.full_name} onSignOut={signOut} onRefresh={refreshCompanies} />
    );
  }

  return (
    <AppWorkspace
      user={user}
      profile={profile}
      companies={companies}
      activeCompany={activeCompany}
      userRole={userRole}
      onSelectCompany={(comp) => selectCompany(comp.id)}
      onSignOut={signOut}
    />
  );
};
