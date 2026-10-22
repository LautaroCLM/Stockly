import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Lock, Mail, AlertCircle, Loader2 } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { signIn, isLoading, error, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setValidationError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setValidationError('Por favor, ingresá tu correo electrónico.');
      return;
    }

    if (!password) {
      setValidationError('Por favor, ingresá tu contraseña.');
      return;
    }

    await signIn(trimmedEmail, password);
  };

  const displayError = validationError || error;

  return (
    <div className="min-h-screen w-full bg-background flex flex-col justify-center items-center p-4 selection:bg-primary/30">
      {/* Brand logo & title */}
      <div className="flex flex-col items-center mb-8 text-center animate-in fade-in duration-300">
        <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-border flex items-center justify-center p-2 mb-3 shadow-xl shadow-black/40">
          <img
            src="/stockly.png"
            alt="Logo Stockly"
            className="w-full h-full object-contain"
          />
        </div>
        <h1 className="text-2xl font-bold font-brand tracking-tight text-text-primary">
          Stockly
        </h1>
        <p className="text-xs text-text-muted mt-1 max-w-xs">
          Gestión de stock e inventario multiempresa para La Perla Desarrolladora S.A.
        </p>
      </div>

      {/* Login Card */}
      <Card className="w-full max-w-md shadow-2xl shadow-black/60 border-border/80 bg-surface/90 backdrop-blur-md animate-in fade-in zoom-in-95 duration-200">
        <CardContent className="p-6 sm:p-8">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-text-primary">
              Iniciar sesión
            </h2>
            <p className="text-xs text-text-muted mt-0.5">
              Ingresá tus credenciales para acceder a tus empresas.
            </p>
          </div>

          {displayError && (
            <div className="mb-5 p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger flex items-start gap-2.5 text-xs animate-in fade-in">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">
                {displayError}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-medium text-text-secondary mb-1.5"
              >
                Correo electrónico
              </label>
              <div className="relative">
                <Mail
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ejemplo@stockly.com"
                  disabled={isLoading}
                  className="w-full h-10 pl-9 pr-3 text-xs bg-surface-2 border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/40 transition-colors disabled:opacity-50"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-medium text-text-secondary mb-1.5"
              >
                Contraseña
              </label>
              <div className="relative">
                <Lock
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                />
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={isLoading}
                  className="w-full h-10 pl-9 pr-3 text-xs bg-surface-2 border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/40 transition-colors disabled:opacity-50"
                />
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={isLoading}
              className="w-full mt-2 font-semibold shadow-md shadow-primary/25"
            >
              {isLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin mr-2" />
                  <span>Verificando credenciales...</span>
                </>
              ) : (
                <span>Ingresar al sistema</span>
              )}
            </Button>
          </form>

          <div className="mt-6 pt-4 border-t border-border flex items-center justify-between text-[11px] text-text-muted">
            <span>Ambiente: Supabase Local</span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>RLS Activo</span>
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
