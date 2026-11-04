/**
 * Convierte cualquier error en un mensaje claro en español para el usuario.
 *
 * - Errores de red del navegador ("TypeError: Failed to fetch", "NetworkError…", "Load failed")
 *   se traducen a un aviso de conexión.
 * - Los mensajes de la base (RAISE EXCEPTION en español) se muestran sin el prefijo técnico.
 * - Si no hay mensaje usable, se usa `fallback`.
 */
export const NETWORK_ERROR_MESSAGE =
  'No hay conexión con el servidor. Revisá tu conexión a internet; los datos se actualizan solos al volver.';

const NETWORK_PATTERNS = [
  /failed to fetch/i,
  /networkerror/i,
  /network request failed/i,
  /load failed/i,
  /fetch failed/i,
  /err_connection/i,
  /err_internet_disconnected/i,
];

function rawMessage(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
    return err.message;
  }
  return '';
}

export function isNetworkErrorMessage(message: string): boolean {
  return NETWORK_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * Falla de conectividad o de transporte (incluye cortes y timeouts): en una escritura deja
 * en duda si la base llegó a aplicar el cambio. Acepta errores, objetos con `message` o texto.
 */
export function isNetworkOrUncertainError(err: unknown): boolean {
  if (!err) return false;
  const str = (rawMessage(err) || String(err)).toLowerCase();
  return (
    str.includes('failed to fetch') ||
    str.includes('networkerror') ||
    str.includes('network') ||
    str.includes('timeout') ||
    str.includes('connection refused') ||
    str.includes('abort') ||
    isNetworkErrorMessage(str)
  );
}

export function toUserMessage(err: unknown, fallback: string): string {
  const message = rawMessage(err).trim();
  if (!message) return fallback;
  if (isNetworkErrorMessage(message)) return NETWORK_ERROR_MESSAGE;
  const cleaned = message.replace(/^(TypeError|Error|P0001|error):\s*/i, '').trim();
  return cleaned || fallback;
}
