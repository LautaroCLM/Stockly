import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import type { Company } from '@/types';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { toUserMessage } from '@/lib/errorMessages';
import { fetchUserCompanies, createCompanyRpc, acceptCompanyInvitationRpc } from '../api/companiesApi';
import { clearActiveCompanyId, pickActiveCompany, readSavedCompanyId, saveActiveCompanyId } from '../activeCompanyStorage';
import type { CompanyContextValue, CompanyRole, CreateCompanyInput, CompanyActionResult } from '../types';

const CompanyContext = createContext<CompanyContextValue | undefined>(undefined);

/** Empresas del usuario autenticado y la empresa activa. */
export const CompanyProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeCompany, setActiveCompany] = useState<Company | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef<boolean>(true);
  const currentUserIdRef = useRef<string | null>(null);
  const isOperatingRef = useRef<boolean>(false);
  const companiesRef = useRef<Company[]>([]);
  companiesRef.current = companies;

  const loadCompanies = useCallback(async (userId: string, preferredCompanyId?: string) => {
    const isCurrent = () => isMountedRef.current && currentUserIdRef.current === userId;
    setIsLoading(true);
    setError(null);
    try {
      const list = await fetchUserCompanies(userId);
      if (!isCurrent()) return;
      setCompanies(list);
      const selected = pickActiveCompany(list, preferredCompanyId, readSavedCompanyId());
      setActiveCompany(selected);
      // Se guarda solo una empresa que el servidor confirmó para este usuario
      if (selected) saveActiveCompanyId(selected.id);
      else clearActiveCompanyId();
    } catch (err) {
      // En un fallo de recarga se mantiene la selección previa
      if (isCurrent()) setError(toUserMessage(err, 'Error al consultar las empresas asociadas.'));
    } finally {
      if (isCurrent()) setIsLoading(false);
    }
  }, []);

  // Ciclo de vida atado al usuario autenticado
  useEffect(() => {
    isMountedRef.current = true;
    const userId = user?.id ?? null;
    currentUserIdRef.current = userId;
    if (!userId) {
      setCompanies([]);
      setActiveCompany(null);
      setIsLoading(false);
      setError(null);
      clearActiveCompanyId();
      return;
    }
    void loadCompanies(userId);
    return () => {
      isMountedRef.current = false;
    };
  }, [user?.id, loadCompanies]);

  const selectCompany = useCallback((companyId: string) => {
    const found = companiesRef.current.find((c) => c.id === companyId);
    if (!found) return;
    setActiveCompany(found);
    saveActiveCompanyId(found.id);
  }, []);

  const refreshCompanies = useCallback(async () => {
    if (user?.id) await loadCompanies(user.id);
  }, [user?.id, loadCompanies]);

  /** Crea o canjea y, si el usuario sigue siendo el mismo, entra a la empresa resultante. */
  const runCompanyOperation = useCallback(
    async (operation: () => Promise<string>, notLoggedIn: string, fallback: string): Promise<CompanyActionResult> => {
      const actingUserId = user?.id;
      if (!actingUserId) return { success: false, error: notLoggedIn };
      if (isOperatingRef.current) {
        return { success: false, error: 'Ya hay una operación de empresa en curso. Por favor espera.' };
      }
      isOperatingRef.current = true;
      try {
        const companyId = await operation();
        if (isMountedRef.current && currentUserIdRef.current === actingUserId) {
          await loadCompanies(actingUserId, companyId);
        }
        return { success: true, companyId };
      } catch (err) {
        return { success: false, error: toUserMessage(err, fallback) };
      } finally {
        isOperatingRef.current = false;
      }
    },
    [user?.id, loadCompanies]
  );

  const createCompany = useCallback(
    (input: CreateCompanyInput) =>
      runCompanyOperation(() => createCompanyRpc(input), 'Debes iniciar sesión para crear una empresa.', 'Error inesperado al crear la empresa.'),
    [runCompanyOperation]
  );

  const acceptInvitation = useCallback(
    (token: string) =>
      runCompanyOperation(
        () => acceptCompanyInvitationRpc(token),
        'Debes iniciar sesión para aceptar una invitación.',
        'Error inesperado al canjear la invitación.'
      ),
    [runCompanyOperation]
  );

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
  if (!context) throw new Error('useCompany debe ser utilizado dentro de un CompanyProvider.');
  return context;
}
