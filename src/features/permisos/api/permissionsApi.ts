import { supabase } from '@/lib/supabase';
import { isNetworkOrUncertainError, toUserMessage } from '@/lib/errorMessages';
import { DEFAULT_LEVELS, MODULE_KEYS } from '../types';
import type { ModuleLevel, ModuleLevels, PermissionsActionResult } from '../types';

const isLevel = (value: unknown): value is ModuleLevel => value === 'none' || value === 'view' || value === 'operate';

/** Permisos del rol empleado en cada módulo de la empresa (lo no configurado trae el valor por defecto). */
export async function fetchModulePermissions(companyId: string): Promise<ModuleLevels> {
  const { data, error } = await supabase.rpc('get_module_permissions', { p_company_id: companyId });
  if (error) throw new Error(toUserMessage(error, 'No se pudieron cargar los permisos.'));
  const levels: ModuleLevels = { ...DEFAULT_LEVELS };
  for (const row of data ?? []) {
    const key = MODULE_KEYS.find((k) => k === row.module);
    if (key && isLevel(row.employee_level)) levels[key] = row.employee_level;
  }
  return levels;
}

/** Guarda los permisos del rol empleado. Solo el administrador puede hacerlo. */
export async function saveModulePermissions(companyId: string, levels: ModuleLevels): Promise<PermissionsActionResult> {
  try {
    const { error } = await supabase.rpc('set_module_permissions', { p_company_id: companyId, p_levels: levels });
    if (!error) return { ok: true };
    if (isNetworkOrUncertainError(error.message)) {
      return { ok: false, message: 'No pudimos confirmar el cambio por un problema de conexión. Revisá los permisos antes de reintentar.' };
    }
    return { ok: false, message: toUserMessage(error, 'No se pudieron guardar los permisos.') };
  } catch {
    return { ok: false, message: 'No se pudieron guardar los permisos. Intentá de nuevo.' };
  }
}
