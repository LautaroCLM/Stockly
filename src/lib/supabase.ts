import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Faltan variables de entorno para Supabase. Asegúrese de definir VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en su archivo .env.local.'
  );
}

/**
 * Cliente Supabase tipado con el esquema multiempresa de Stockly.
 * Configurado con persistencia de sesión en localStorage y refresco automático de tokens.
 */
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
