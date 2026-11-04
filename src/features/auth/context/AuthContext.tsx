import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import type { User, Session, AuthError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { signInWithEmail, signOutUser, fetchProfile } from '../api/authApi';
import type { AuthContextValue, ProfileRow } from '../types';
import { translateAuthError } from '../authErrors';

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef<boolean>(true);
  const currentProfileUserIdRef = useRef<string | null>(null);

  // Cargar perfil del usuario autenticado evitando duplicaciones y condiciones de carrera
  const loadProfile = useCallback(async (userId: string) => {
    if (currentProfileUserIdRef.current === userId) {
      return;
    }
    currentProfileUserIdRef.current = userId;

    try {
      const p = await fetchProfile(userId);
      if (isMountedRef.current && currentProfileUserIdRef.current === userId) {
        setProfile(p);
      }
    } catch {
      if (isMountedRef.current && currentProfileUserIdRef.current === userId) {
        setProfile(null);
      }
    }
  }, []);

  // Inicializar sesión y suscribirse a cambios de estado de autenticación
  useEffect(() => {
    isMountedRef.current = true;

    async function initializeAuth() {
      try {
        const { data, error: sessionErr } = await supabase.auth.getSession();
        if (!isMountedRef.current) return;

        if (sessionErr) {
          setError(translateAuthError(sessionErr));
          setIsLoading(false);
          return;
        }

        setSession(data.session);
        setUser(data.session?.user ?? null);

        if (data.session?.user) {
          await loadProfile(data.session.user.id);
        } else {
          currentProfileUserIdRef.current = null;
          setProfile(null);
        }
      } catch (err) {
        if (isMountedRef.current) {
          setError(err instanceof Error ? err.message : 'Error al inicializar sesión.');
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    }

    initializeAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (!isMountedRef.current) return;

        if (event === 'SIGNED_OUT') {
          currentProfileUserIdRef.current = null;
          setSession(null);
          setUser(null);
          setProfile(null);
          setIsLoading(false);
          return;
        }

        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (newSession?.user) {
          await loadProfile(newSession.user.id);
        } else {
          currentProfileUserIdRef.current = null;
          setProfile(null);
        }

        setIsLoading(false);
      }
    );

    return () => {
      isMountedRef.current = false;
      authListener.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (isMountedRef.current) {
      setError(null);
      setIsLoading(true);
    }

    try {
      const { error: signInErr } = await signInWithEmail(email, password);
      if (signInErr) {
        if (isMountedRef.current) {
          setError(translateAuthError(signInErr));
        }
        return { error: signInErr };
      }
      return { error: null };
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Error inesperado durante el inicio de sesión.');
      if (isMountedRef.current) {
        setError(translateAuthError(e));
      }
      return { error: e as AuthError };
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const signOut = useCallback(async () => {
    if (isMountedRef.current) {
      setError(null);
      setIsLoading(true);
    }
    currentProfileUserIdRef.current = null;

    try {
      await signOutUser();
      if (isMountedRef.current) {
        setUser(null);
        setSession(null);
        setProfile(null);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : 'Error al cerrar sesión.');
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const clearError = useCallback(() => {
    if (isMountedRef.current) {
      setError(null);
    }
  }, []);

  const value: AuthContextValue = {
    user,
    session,
    profile,
    isLoading,
    error,
    signIn,
    signOut,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe ser utilizado dentro de un AuthProvider.');
  }
  return context;
}
