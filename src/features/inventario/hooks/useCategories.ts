import { useState, useEffect, useCallback, useRef } from 'react';
import type { TenantId } from '@/types';
import type { Category } from '../types';
import {
  fetchCategories,
  upsertCategoryRpc,
  deactivateCategoryRpc,
} from '../api/categoriesApi';
import { useOnDataChange } from '@/features/realtime/hooks/useOnDataChange';
import type { DataTable } from '@/features/realtime/changeBus';

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
      if (isMountedRef.current && currentCompanyIdRef.current === targetCompanyId) {
        setCategories(data);
        setIsLoading(false);
      }
    } catch (err) {
      if (isMountedRef.current && currentCompanyIdRef.current === targetCompanyId) {
        const message = err instanceof Error ? err.message : 'Error al cargar las categorías.';
        setError(message);
        setCategories([]);
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    setCategories([]);
    loadCategories(companyId);

    return () => {
      isMountedRef.current = false;
    };
  }, [companyId, loadCategories]);

  const validateName = useCallback(
    (name: string, excludeId?: string): CategoryValidationResult => {
      const clean = name.trim();
      if (!clean) {
        return { valid: false, error: 'El nombre de la categoría es obligatorio.' };
      }
      if (clean.length > 100) {
        return { valid: false, error: 'El nombre no puede superar los 100 caracteres.' };
      }

      const duplicate = categories.some(
        (c) => c.id !== excludeId && c.name.trim().toLowerCase() === clean.toLowerCase()
      );

      if (duplicate) {
        return {
          valid: false,
          error: `Ya existe una categoría llamada "${clean}" en esta empresa.`,
        };
      }

      return { valid: true };
    },
    [categories]
  );

  const createCategory = useCallback(
    async (name: string, description?: string): Promise<CategoryOperationResult> => {
      const validation = validateName(name);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      try {
        const newId = await upsertCategoryRpc({
          companyId,
          name: name.trim(),
          description: description?.trim(),
        });

        // Actualización directa desde Supabase tras mutación exitosa
        const freshData = await fetchCategories(companyId);
        if (isMountedRef.current && currentCompanyIdRef.current === companyId) {
          setCategories(freshData);
        }

        const created = freshData.find((c) => c.id === newId) || {
          id: newId,
          companyId,
          name: name.trim(),
          description: description?.trim() || undefined,
          createdAt: new Date().toISOString(),
        };

        return { success: true, category: created };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error al crear la categoría.';
        return { success: false, error: message };
      }
    },
    [companyId, validateName]
  );

  const renameCategory = useCallback(
    async (id: string, newName: string, description?: string): Promise<CategoryOperationResult> => {
      const validation = validateName(newName, id);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      const existing = categories.find((c) => c.id === id);
      if (!existing) {
        return { success: false, error: 'Categoría no encontrada.' };
      }

      const oldName = existing.name;
      const cleanNewName = newName.trim();

      try {
        await upsertCategoryRpc({
          companyId,
          categoryId: id,
          name: cleanNewName,
          description: description !== undefined ? description?.trim() : existing.description,
          isActive: true,
        });

        // Actualización directa desde Supabase tras mutación exitosa
        const freshData = await fetchCategories(companyId);
        if (isMountedRef.current && currentCompanyIdRef.current === companyId) {
          setCategories(freshData);
        }

        const updated = freshData.find((c) => c.id === id) || {
          ...existing,
          name: cleanNewName,
          description: description !== undefined ? description?.trim() || undefined : existing.description,
        };

        if (onRenameCategoryInProducts) {
          onRenameCategoryInProducts(id, oldName, cleanNewName);
        }

        return { success: true, category: updated };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error al renombrar la categoría.';
        return { success: false, error: message };
      }
    },
    [companyId, categories, validateName, onRenameCategoryInProducts]
  );

  const deleteCategory = useCallback(
    async (id: string, productCount: number): Promise<CategoryOperationResult> => {
      if (productCount > 0) {
        return {
          success: false,
          error: `No se puede eliminar la categoría porque tiene ${productCount} producto(s) asociado(s). Reasigna los productos primero.`,
        };
      }

      const target = categories.find((c) => c.id === id);
      if (!target) {
        return { success: false, error: 'Categoría no encontrada.' };
      }

      try {
        await deactivateCategoryRpc(companyId, id, target.name, target.description);

        // Actualización directa desde Supabase tras mutación exitosa
        const freshData = await fetchCategories(companyId);
        if (isMountedRef.current && currentCompanyIdRef.current === companyId) {
          setCategories(freshData);
        }

        return { success: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error al eliminar la categoría.';
        return { success: false, error: message };
      }
    },
    [companyId, categories]
  );

  useOnDataChange(REALTIME_TABLES, () => {
    void loadCategories(companyId);
  });

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
