/**
 * Describe a qué Supabase está conectada la app, según la URL configurada.
 * Evita mostrar un ambiente fijo que no coincida con el real.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function describeSupabaseEnvironment(url: string): string {
  try {
    const host = new URL(url).hostname;
    if (LOCAL_HOSTS.has(host) || host.endsWith('.localhost')) {
      return 'Supabase local';
    }
    return 'Supabase en la nube';
  } catch {
    return 'Supabase (URL inválida)';
  }
}
