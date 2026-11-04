import { useState, useEffect, useCallback, useRef } from 'react';
import type { TenantId } from '@/types';
import type { Category } from '../types';
import { fetchCategories, upsertCategoryRpc, deactivateCategoryRpc } from '../api/categoriesApi';
import { validateCategoryName } from '../categoryValidation';
import { useOnDataChange } from '@/features/realtime/hooks/useOnDataChange';
import type { DataTable } from '@/features/realtime/changeBus';
import { toUserMessage } from '@/lib/errorMessages';

/** Tablas cuyos cambios (de cualquier usuario de la empresa) recargan este hook. */
const REALTIME_TABLES: readonly DataTable[] = ['categories'];

export interface CategoryValidationResult {
  valid: boolean;
  error?: string;
}

export interface CategoryOperationResult {
  success: boolean;
  error?: string;
  category?: Category;
}

/** Catálogo de categorías de la empresa activa: carga, refresco en vivo, alta, renombre y baja. */
export function useCategories(
  companyId: TenantId,
  onRenameCategoryInProducts?: (categoryId: string, oldName: string, newName: string) => void
) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const currentCompanyIdRef = useRef<string>(companyId);
  currentCompanyIdRef.current = companyId;
  const isCurrent = (target: string) => isMountedRef.current && currentCompanyIdRef.current === target;

  const loadCategories = useCallback(async (targetCompanyId: string) => {
    if (!targetCompanyId) {
      setCategories([]);
      setIsLoading(false);
      setError(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchCategories(targetCompanyId);
      if (isMountedRef.current && currentCompanyIdRef.current === targetCompanyId) setCategories(data);
    } catch (err) {
      // Se conservan las categorías ya visibles: un corte breve no debe vaciar la lista
      if (isMountedRef.current && currentCompanyIdRef.current === targetCompanyId) {
        setError(toUserMessage(err, 'No se pudieron cargar las categorías.'));
      }
    } finally {
      if (isMountedRef.current && currentCompanyIdRef.current === targetCompanyId) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    setCategories([]);
    void loadCategories(companyId);
    return () => {
      isMountedRef.current = false;
    };
  }, [companyId, loadCategories]);

  useOnDataChange(REALTIME_TABLES, () => {
    void loadCategories(companyId);
  });

  /** Relee las categorías tras una operación confirmada y las devuelve. */
  const refresh = async (): Promise<Category[]> => {
    const fresh = await fetchCategories(companyId);
    if (isCurrent(companyId)) setCategories(fresh);
    return fresh;
  };

  const validateName = useCallback(
    (name: string, excludeId?: string): CategoryValidationResult => {
      const invalid = validateCategoryName(name, categories, excludeId);
      return invalid ? { valid: false, error: invalid } : { valid: true };
    },
    [categories]
  );

  const createCategory = async (name: string, description?: string): Promise<CategoryOperationResult> => {
    const invalid = validateCategoryName(name, categories);
    if (invalid) return { success: false, error: invalid };
    try {
      const newId = await upsertCategoryRpc({ companyId, name: name.trim(), description: description?.trim() });
      const created = (await refresh()).find((c) => c.id === newId) || {
        id: newId,
        companyId,
        name: name.trim(),
        description: description?.trim() || undefined,
        createdAt: new Date().toISOString(),
      };
      return { success: true, category: created };
    } catch (err) {
      return { success: false, error: toUserMessage(err, 'Error al crear la categoría.') };
    }
  };

  const renameCategory = async (id: string, newName: string, description?: string): Promise<CategoryOperationResult> => {
    const invalid = validateCategoryName(newName, categories, id);
    if (invalid) return { success: false, error: invalid };
    const existing = categories.find((c) => c.id === id);
    if (!existing) return { success: false, error: 'Categoría no encontrada.' };

    const cleanName = newName.trim();
    const nextDescription = description !== undefined ? description.trim() || undefined : existing.description;
    try {
      await upsertCategoryRpc({ companyId, categoryId: id, name: cleanName, description: nextDescription, isActive: true });
      const updated = (await refresh()).find((c) => c.id === id) || { ...existing, name: cleanName, description: nextDescription };
      onRenameCategoryInProducts?.(id, existing.name, cleanName);
      return { success: true, category: updated };
    } catch (err) {
      return { success: false, error: toUserMessage(err, 'Error al renombrar la categoría.') };
    }
  };

  const deleteCategory = async (id: string, productCount: number): Promise<CategoryOperationResult> => {
    if (productCount > 0) {
      return {
        success: false,
        error: `No se puede eliminar la categoría porque tiene ${productCount} producto(s) asociado(s). Reasigna los productos primero.`,
      };
    }
    const target = categories.find((c) => c.id === id);
    if (!target) return { success: false, error: 'Categoría no encontrada.' };
    try {
      await deactivateCategoryRpc(companyId, id, target.name, target.description);
      await refresh();
      return { success: true };
    } catch (err) {
      return { success: false, error: toUserMessage(err, 'Error al eliminar la categoría.') };
    }
  };

  return {
    categories,
    isLoading,
    error,
    createCategory,
    renameCategory,
    deleteCategory,
    validateName,
    reloadCategories: () => loadCategories(companyId),
  };
}
