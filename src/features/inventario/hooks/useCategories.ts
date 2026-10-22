import { useState, useEffect, useCallback } from 'react';
import { TenantId } from '@/types';
import { Category, Product } from '../types';

export function getCategoryStorageKey(tenantId: TenantId): string {
  return `stockly_categories_${tenantId}_v1`;
}

function getProductStorageKey(tenantId: TenantId): string {
  return `stockly_products_${tenantId}_v1`;
}

export function loadCategoriesFromStorage(tenantId: TenantId): Category[] {
  try {
    const raw = localStorage.getItem(getCategoryStorageKey(tenantId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn(`Error al leer categorías de ${tenantId} desde localStorage:`, err);
  }

  // Idempotent local migration: Derive initial categories from existing products if any
  try {
    const productsRaw = localStorage.getItem(getProductStorageKey(tenantId));
    if (productsRaw) {
      const products: Product[] = JSON.parse(productsRaw);
      if (Array.isArray(products) && products.length > 0) {
        const uniqueMap = new Map<string, string>(); // lowerCase -> original
        for (const p of products) {
          const clean = p.category?.trim();
          if (clean && !uniqueMap.has(clean.toLowerCase())) {
            uniqueMap.set(clean.toLowerCase(), clean);
          }
        }

        const initialCategories: Category[] = Array.from(uniqueMap.values())
          .sort()
          .map((name, idx) => ({
            id: `cat-${tenantId.slice(0, 3)}-${(idx + 1).toString().padStart(3, '0')}`,
            companyId: tenantId,
            name,
            createdAt: new Date().toISOString(),
          }));

        if (initialCategories.length > 0) {
          localStorage.setItem(getCategoryStorageKey(tenantId), JSON.stringify(initialCategories));

          // Also link existing products with their categoryId
          const updatedProducts = products.map((prod) => {
            const cat = initialCategories.find(
              (c) => c.name.toLowerCase() === prod.category?.trim().toLowerCase()
            );
            return cat ? { ...prod, categoryId: cat.id } : prod;
          });
          localStorage.setItem(getProductStorageKey(tenantId), JSON.stringify(updatedProducts));

          return initialCategories;
        }
      }
    }
  } catch (err) {
    console.warn(`Error al inicializar categorías desde productos para ${tenantId}:`, err);
  }

  return [];
}

export function saveCategoriesToStorage(tenantId: TenantId, categories: Category[]): boolean {
  try {
    localStorage.setItem(getCategoryStorageKey(tenantId), JSON.stringify(categories));
    return true;
  } catch (err) {
    console.error(`Error al persistir categorías de ${tenantId} en localStorage:`, err);
    return false;
  }
}

export interface CategoryValidationResult {
  valid: boolean;
  error?: string;
}

export function useCategories(
  tenantId: TenantId,
  onRenameCategoryInProducts?: (categoryId: string, oldName: string, newName: string) => void
) {
  const [categories, setCategories] = useState<Category[]>(() =>
    loadCategoriesFromStorage(tenantId)
  );

  // Reload categories on company switch
  useEffect(() => {
    setCategories(loadCategoriesFromStorage(tenantId));
  }, [tenantId]);

  const validateName = useCallback(
    (name: string, excludeId?: string): CategoryValidationResult => {
      const clean = name.trim();
      if (!clean) {
        return { valid: false, error: 'El nombre de la categoría es obligatorio.' };
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
    (
      name: string,
      description?: string
    ): { success: boolean; error?: string; category?: Category } => {
      const validation = validateName(name);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      const newCategory: Category = {
        id: `cat-${tenantId.slice(0, 3)}-${Date.now()}`,
        companyId: tenantId,
        name: name.trim(),
        description: description?.trim() || undefined,
        createdAt: new Date().toISOString(),
      };

      const updated = [...categories, newCategory].sort((a, b) =>
        a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
      );

      const saved = saveCategoriesToStorage(tenantId, updated);
      if (!saved) {
        return { success: false, error: 'Error al persistir la categoría en localStorage.' };
      }

      setCategories(updated);
      return { success: true, category: newCategory };
    },
    [tenantId, categories, validateName]
  );

  const renameCategory = useCallback(
    (
      id: string,
      newName: string,
      description?: string
    ): { success: boolean; error?: string; category?: Category } => {
      const validation = validateName(newName, id);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      const index = categories.findIndex((c) => c.id === id);
      if (index === -1) {
        return { success: false, error: 'Categoría no encontrada.' };
      }

      const existing = categories[index];
      const oldName = existing.name;
      const cleanNewName = newName.trim();

      const updatedCategory: Category = {
        ...existing,
        name: cleanNewName,
        description: description !== undefined ? description.trim() || undefined : existing.description,
      };

      const updated = [...categories];
      updated[index] = updatedCategory;
      updated.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));

      const saved = saveCategoriesToStorage(tenantId, updated);
      if (!saved) {
        return { success: false, error: 'Error al persistir la categoría renombrada.' };
      }

      setCategories(updated);

      // Cascade update to all associated products
      if (onRenameCategoryInProducts) {
        onRenameCategoryInProducts(id, oldName, cleanNewName);
      }

      return { success: true, category: updatedCategory };
    },
    [tenantId, categories, validateName, onRenameCategoryInProducts]
  );

  const deleteCategory = useCallback(
    (id: string, productCount: number): { success: boolean; error?: string } => {
      if (productCount > 0) {
        return {
          success: false,
          error: `No se puede eliminar la categoría porque tiene ${productCount} producto(s) asociado(s). Reasigna o elimina los productos primero.`,
        };
      }

      const target = categories.find((c) => c.id === id);
      if (!target) {
        return { success: false, error: 'Categoría no encontrada.' };
      }

      const updated = categories.filter((c) => c.id !== id);
      const saved = saveCategoriesToStorage(tenantId, updated);
      if (!saved) {
        return { success: false, error: 'Error al eliminar la categoría en localStorage.' };
      }

      setCategories(updated);
      return { success: true };
    },
    [tenantId, categories]
  );

  return {
    categories,
    createCategory,
    renameCategory,
    deleteCategory,
    validateName,
  };
}
