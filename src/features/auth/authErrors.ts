/**
 * Traduce los errores de Supabase Auth a mensajes en español para el usuario.
 * Supabase devuelve los mensajes en inglés; se prioriza el `code` estable
 * y se usa el status HTTP como respaldo.
 */
interface AuthErrorLike {
  message: string;
  code?: string;
  status?: number;
  name?: string;
}

const MESSAGES_BY_CODE: Record<string, string> = {
  invalid_credentials: 'El correo o la contraseña son incorrectos.',
  email_not_confirmed: 'El correo todavía no fue confirmado. Pedile al administrador que lo confirme.',
  user_banned: 'Este usuario está deshabilitado. Contactá al administrador.',
  user_not_found: 'El correo o la contraseña son incorrectos.',
  over_request_rate_limit: 'Demasiados intentos. Esperá unos minutos y volvé a probar.',
  over_email_send_rate_limit: 'Demasiados intentos. Esperá unos minutos y volvé a probar.',
  session_expired: 'Tu sesión expiró. Volvé a iniciar sesión.',
  session_not_found: 'Tu sesión expiró. Volvé a iniciar sesión.',
  refresh_token_not_found: 'Tu sesión expiró. Volvé a iniciar sesión.',
  refresh_token_already_used: 'Tu sesión expiró. Volvé a iniciar sesión.',
};

export const GENERIC_AUTH_ERROR = 'No se pudo iniciar sesión. Intentá de nuevo en unos minutos.';
export const NETWORK_AUTH_ERROR = 'No hay conexión con el servidor. Revisá tu conexión a internet.';

export function translateAuthError(error: AuthErrorLike): string {
  if (error.code && MESSAGES_BY_CODE[error.code]) {
    return MESSAGES_BY_CODE[error.code];
  }
  if (error.name === 'AuthRetryableFetchError' || error.status === 0) {
    return NETWORK_AUTH_ERROR;
  }
  if (error.status === 400 && /invalid login credentials/i.test(error.message)) {
    return MESSAGES_BY_CODE.invalid_credentials;
  }
  if (error.status === 429) {
    return MESSAGES_BY_CODE.over_request_rate_limit;
  }
  if (error instanceof TypeError || /failed to fetch|networkerror/i.test(error.message)) {
    return NETWORK_AUTH_ERROR;
  }
  return GENERIC_AUTH_ERROR;
}
