import React, { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { StocklyLoadingScreen } from '@/components/shared/StocklyLoadingScreen';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { LoginPage } from '@/features/auth/components/LoginPage';
import { useCompany } from '@/features/companies/hooks/useCompany';
import { NoCompanyPage } from '@/features/companies/components/NoCompanyPage';
import { AppWorkspace } from './AppWorkspace';

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

/** Tiempo mínimo de la bienvenida inicial y duración de su fundido de salida. */
const MIN_SPLASH_MS = 800;
const FADE_MS = 300;

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/**
 * Bienvenida del arranque: se ve al menos MIN_SPLASH_MS y sale con un fundido, una sola vez por apertura.
 * Si la carga real tarda más, sigue hasta que termine. Con "reducir movimiento" no hay espera ni fundido.
 */
function useSplash(isBooting: boolean): 'show' | 'leaving' | 'gone' {
  const [minElapsed, setMinElapsed] = useState(prefersReducedMotion);
  const [phase, setPhase] = useState<'show' | 'leaving' | 'gone'>('show');

  useEffect(() => {
    if (minElapsed) return;
    const timer = window.setTimeout(() => setMinElapsed(true), MIN_SPLASH_MS);
    return () => window.clearTimeout(timer);
  }, [minElapsed]);

  useEffect(() => {
    if (phase !== 'show' || isBooting || !minElapsed) return;
    if (prefersReducedMotion()) {
      setPhase('gone');
      return;
    }
    setPhase('leaving');
  }, [phase, isBooting, minElapsed]);

  useEffect(() => {
    if (phase !== 'leaving') return;
    const timer = window.setTimeout(() => setPhase('gone'), FADE_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  return phase;
}

/** Decide qué mostrar según la sesión y las empresas del usuario. */
export const AppAuthShell: React.FC = () => {
  const { user, profile, isLoading: isAuthLoading, signOut } = useAuth();
  const { companies, activeCompany, userRole, isLoading: isCompanyLoading, error, selectCompany, refreshCompanies } =
    useCompany();

  const isBooting = isAuthLoading || Boolean(user && isCompanyLoading);
  const splash = useSplash(isBooting);

  // Después de la bienvenida, una recarga posterior de empresas muestra la pantalla sin fundido
  if (splash === 'show' || (splash === 'gone' && isBooting)) return <StocklyLoadingScreen />;

  let content: React.ReactNode;
  if (!user) {
    content = <LoginPage />;
  } else if (error) {
    content = <CompanyErrorScreen message={error} onRetry={refreshCompanies} onSignOut={signOut} />;
  } else if (!activeCompany || companies.length === 0) {
    content = <NoCompanyPage userEmail={user.email} userName={profile?.full_name} onSignOut={signOut} onRefresh={refreshCompanies} />;
  } else {
    content = (
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
  }

  return splash === 'leaving' ? <>{content}<StocklyLoadingScreen leaving /></> : <>{content}</>;
};
