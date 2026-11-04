import type { Category } from './types';

/** Valida el nombre de una categoría (obligatorio, hasta 100 caracteres y sin repetir). */
export function validateCategoryName(name: string, categories: Category[], excludeId?: string): string | null {
  const clean = name.trim();
  if (!clean) return 'El nombre de la categoría es obligatorio.';
  if (clean.length > 100) return 'El nombre no puede superar los 100 caracteres.';
  const duplicate = categories.some((c) => c.id !== excludeId && c.name.trim().toLowerCase() === clean.toLowerCase());
  return duplicate ? `Ya existe una categoría llamada "${clean}" en esta empresa.` : null;
}
