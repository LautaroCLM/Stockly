import { supabase } from '@/lib/supabase';
import { toUserMessage } from '@/lib/errorMessages';
import type { RouteId } from '@/types';
import { parseHiddenRoutes } from '../schemas';

/** Módulos que la persona ocultó de su menú. Sin fila guardada: ninguno (todo visible). */
export async function fetchHiddenRoutes(userId: string): Promise<RouteId[]> {
  const { data, error } = await supabase
    .from('user_preferences')
    .select('hidden_routes')
    .eq('user_id', userId)
    .maybeSingle();
  // PGRST205: la tabla todavía no existe en el servidor (falta aplicar la migración)
  if (error?.code === 'PGRST205') throw new Error('Esta opción todavía no está activada en el servidor.');
  if (error) throw new Error(toUserMessage(error, 'No se pudieron cargar tus preferencias.'));
  return parseHiddenRoutes(data?.hidden_routes);
}

export type SavePreferencesResult = { ok: true } | { ok: false; message: string };

export async function saveHiddenRoutes(userId: string, hidden: readonly RouteId[]): Promise<SavePreferencesResult> {
  try {
    const { error } = await supabase
      .from('user_preferences')
      .upsert({ user_id: userId, hidden_routes: [...hidden] }, { onConflict: 'user_id' });
    if (error) return { ok: false, message: toUserMessage(error, 'No se pudieron guardar tus preferencias.') };
    return { ok: true };
  } catch {
    return { ok: false, message: 'No se pudieron guardar tus preferencias. Intentá de nuevo.' };
  }
}
