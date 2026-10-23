import { supabase } from '@/lib/supabase';
import type { Category } from '../types';

/**
 * Normaliza y limpia mensajes de error arrojados por PostgreSQL / PostgREST.
 */
export function sanitizeCategoryError(err: unknown, defaultMessage: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
    return err.message.replace(/^(P0001|error):\s*/i, '').trim();
  }
  if (err instanceof Error) {
    return err.message.replace(/^(P0001|error):\s*/i, '').trim();
  }
  return defaultMessage;
}

export interface UpsertCategoryParams {
  companyId: string;
  name: string;
  description?: string;
  categoryId?: string;
  isActive?: boolean;
}

/**
 * Consulta las categorías activas pertenecientes a la empresa especificada.
 * La autorización se valida a nivel de fila (RLS) en PostgreSQL contra la membresía del usuario.
 */
export async function fetchCategories(companyId: string): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('id, company_id, name, description, is_active, created_at')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) {
    throw new Error(sanitizeCategoryError(error, 'Error al consultar las categorías de la empresa.'));
  }

  return (data || []).map((row) => ({
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    description: row.description || undefined,
    createdAt: row.created_at,
  }));
}

/**
 * Crea o actualiza una categoría mediante la RPC transaccional public.upsert_category.
 * Exclusivo para usuarios con rol master_admin en la empresa.
 */
export async function upsertCategoryRpc(params: UpsertCategoryParams): Promise<string> {
  const cleanName = params.name.trim();
  const cleanDesc = params.description && params.description.trim() ? params.description.trim() : undefined;

  const { data, error } = await supabase.rpc('upsert_category', {
    p_company_id: params.companyId,
    p_name: cleanName,
    p_description: cleanDesc,
    p_category_id: params.categoryId || undefined,
    p_is_active: params.isActive ?? true,
  });

  if (error) {
    throw new Error(sanitizeCategoryError(error, 'No se pudo guardar la categoría.'));
  }

  if (!data) {
    throw new Error('El servidor no retornó el identificador de la categoría.');
  }

  return data;
}

/**
 * Desactiva lógicamente una categoría mediante la RPC public.upsert_category (is_active = false).
 * Preserva la integridad referencial histórica con products.
 */
export async function deactivateCategoryRpc(
  companyId: string,
  categoryId: string,
  currentName: string,
  currentDescription?: string
): Promise<void> {
  await upsertCategoryRpc({
    companyId,
    categoryId,
    name: currentName,
    description: currentDescription,
    isActive: false,
  });
}
