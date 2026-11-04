import type { Company } from '@/types';

const STORAGE_ACTIVE_COMPANY_KEY = 'stockly_active_company_id_v1';

// El navegador puede bloquear localStorage (modo privado, permisos): nunca debe romper la app

export function readSavedCompanyId(): string | null {
  try {
    return localStorage.getItem(STORAGE_ACTIVE_COMPANY_KEY);
  } catch {
    return null;
  }
}

export function saveActiveCompanyId(companyId: string): void {
  try {
    localStorage.setItem(STORAGE_ACTIVE_COMPANY_KEY, companyId);
  } catch {
    // Sin persistencia: se vuelve a elegir la primera empresa la próxima vez
  }
}

export function clearActiveCompanyId(): void {
  try {
    localStorage.removeItem(STORAGE_ACTIVE_COMPANY_KEY);
  } catch {
    // Nada que limpiar
  }
}

/**
 * Empresa a activar, solo entre las que el servidor confirmó para el usuario:
 * la preferida (recién creada o canjeada), si no la guardada, si no la primera.
 */
export function pickActiveCompany(list: Company[], preferredId?: string, savedId?: string | null): Company | null {
  if (list.length === 0) return null;
  return (
    (preferredId ? list.find((c) => c.id === preferredId) : undefined) ??
    (savedId ? list.find((c) => c.id === savedId) : undefined) ??
    list[0]
  );
}
