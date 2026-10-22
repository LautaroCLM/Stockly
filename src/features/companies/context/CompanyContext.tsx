import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { Company } from '@/types';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { fetchUserCompanies, createCompanyRpc, acceptCompanyInvitationRpc } from '../api/companiesApi';
import type { CompanyContextValue, CompanyRole, CreateCompanyInput, CompanyActionResult } from '../types';

const STORAGE_ACTIVE_COMPANY_KEY = 'stockly_active_company_id_v1';

const CompanyContext = createContext<CompanyContextValue | undefined>(undefined);

interface CompanyProviderProps {
  children: ReactNode;
}

export const CompanyProvider: React.FC<CompanyProviderProps> = ({ children }) => {
  const { user } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeCompany, setActiveCompany] = useState<Company | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef<boolean>(true);
  const currentUserIdRef = useRef<string | null>(null);
  const isOperatingRef = useRef<boolean>(false);

  const loadCompanies = useCallback(async (userId: string, preferredCompanyId?: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const list = await fetchUserCompanies(userId);
      if (!isMountedRef.current || currentUserIdRef.current !== userId) {
        return;
      }

      setCompanies(list);

      if (list.length === 0) {
        setActiveCompany(null);
        try {
          localStorage.removeItem(STORAGE_ACTIVE_COMPANY_KEY);
        } catch {
          // Ignorar errores de acceso a localStorage
        }
        return;
      }

      // Priorizar preferredCompanyId si está confirmado en la lista
      let targetCompany: Company | null = null;
      if (preferredCompanyId) {
        targetCompany = list.find((c) => c.id === preferredCompanyId) || null;
      }

      // Si no se proveyó o no se encontró el preferido, validar ID persistido en localStorage
      if (!targetCompany) {
        try {
          const savedId = localStorage.getItem(STORAGE_ACTIVE_COMPANY_KEY);
          if (savedId) {
            targetCompany = list.find((c) => c.id === savedId) || null;
          }
        } catch {
          targetCompany = null;
        }
      }

      // Si no hay empresa guardada válida, seleccionar la primera disponible
      const selected = targetCompany || list[0];
      setActiveCompany(selected);

      // Persistir ÚNICAMENTE una vez confirmada su pertenencia a la lista devuelta por el servidor
      try {
        localStorage.setItem(STORAGE_ACTIVE_COMPANY_KEY, selected.id);
      } catch {
        // Ignorar errores de acceso a localStorage
      }
    } catch (err) {
      if (isMountedRef.current && currentUserIdRef.current === userId) {
        const message = err instanceof Error ? err.message : 'Error al consultar las empresas asociadas.';
        setError(message);
        // En fallo de recarga: mantener la selección previa si era segura o dejarla sin confirmar
        setActiveCompany((prev) => (prev && prev.id ? prev : null));
      }
    } finally {
      if (isMountedRef.current && currentUserIdRef.current === userId) {
        setIsLoading(false);
      }
    }
  }, []);

  // Sincronizar ciclo de vida con el usuario autenticado
  useEffect(() => {
    isMountedRef.current = true;
    const userId = user?.id ?? null;
    currentUserIdRef.current = userId;

    if (!userId) {
      // Usuario desautenticado o sesión cerrada: limpiar estado y purgar referencia de empresa activa
      setCompanies([]);
      setActiveCompany(null);
      setIsLoading(false);
      setError(null);
      try {
        localStorage.removeItem(STORAGE_ACTIVE_COMPANY_KEY);
      } catch {
        // Ignorar
      }
      return;
    }

    loadCompanies(userId);

    return () => {
      isMountedRef.current = false;
    };
  }, [user?.id, loadCompanies]);

  const selectCompany = useCallback((companyId: string) => {
    setCompanies((prev) => {
      const found = prev.find((c) => c.id === companyId);
      if (found) {
        setActiveCompany(found);
        try {
          localStorage.setItem(STORAGE_ACTIVE_COMPANY_KEY, found.id);
        } catch {
          // Ignorar
        }
      }
      return prev;
    });
  }, []);

  const refreshCompanies = useCallback(async () => {
    if (user?.id) {
      await loadCompanies(user.id);
    }
  }, [user?.id, loadCompanies]);

  const createCompany = useCallback(async (input: CreateCompanyInput): Promise<CompanyActionResult> => {
    const actingUserId = user?.id;
    if (!actingUserId) {
      return { success: false, error: 'Debes iniciar sesión para crear una empresa.' };
    }

    if (isOperatingRef.current) {
      return { success: false, error: 'Ya hay una operación de empresa en curso. Por favor espera.' };
    }

    isOperatingRef.current = true;

    try {
      const companyId = await createCompanyRpc(input);

      // Verificar si la sesión cambió durante la llamada RPC asíncrona
      if (!isMountedRef.current || currentUserIdRef.current !== actingUserId) {
        return { success: true, companyId };
      }

      // Recargar empresas con la confirmación del servidor antes de persistir la selección
      await loadCompanies(actingUserId, companyId);
      return { success: true, companyId };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error inesperado al crear la empresa.';
      return { success: false, error: message };
    } finally {
      isOperatingRef.current = false;
    }
  }, [user?.id, loadCompanies]);

  const acceptInvitation = useCallback(async (token: string): Promise<CompanyActionResult> => {
    const actingUserId = user?.id;
    if (!actingUserId) {
      return { success: false, error: 'Debes iniciar sesión para aceptar una invitación.' };
    }

    if (isOperatingRef.current) {
      return { success: false, error: 'Ya hay una operación de empresa en curso. Por favor espera.' };
    }

    isOperatingRef.current = true;

    try {
      const companyId = await acceptCompanyInvitationRpc(token);

      // Verificar si la sesión cambió durante la llamada RPC asíncrona
      if (!isMountedRef.current || currentUserIdRef.current !== actingUserId) {
        return { success: true, companyId };
      }

      // Recargar empresas con la confirmación del servidor antes de persistir la selección
      await loadCompanies(actingUserId, companyId);
      return { success: true, companyId };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error inesperado al canjear la invitación.';
      return { success: false, error: message };
    } finally {
      isOperatingRef.current = false;
    }
  }, [user?.id, loadCompanies]);

  const userRole: CompanyRole | null = activeCompany?.role ?? null;

  const value: CompanyContextValue = {
    companies,
    activeCompany,
    userRole,
    isLoading,
    error,
    selectCompany,
    refreshCompanies,
    createCompany,
    acceptInvitation,
  };

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
};

export function useCompany(): CompanyContextValue {
  const context = useContext(CompanyContext);
  if (!context) {
    throw new Error('useCompany debe ser utilizado dentro de un CompanyProvider.');
  }
  return context;
}
