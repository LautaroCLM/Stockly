import { scrubEvent, type ScrubbableEvent } from './scrubEvent';

/**
 * Alertas de errores con Sentry. Solo se activa en producción y si está la clave VITE_SENTRY_DSN;
 * la librería se descarga en segundo plano después de abrir la app (no pesa al arrancar).
 * Sin clave (desarrollo, tests) todo esto no hace nada.
 */
type SentryModule = typeof import('@sentry/react');

let sentry: SentryModule | null = null;
let pending: { error: unknown; context?: Record<string, string> }[] = [];
let scope: { userId?: string; companyId?: string; route?: string } = {};

const dsn = import.meta.env.VITE_SENTRY_DSN;
export const isErrorReportingEnabled = (): boolean => Boolean(dsn) && import.meta.env.PROD;

/** Dónde corre: app instalada (PWA) o navegador. */
const platform = (): string =>
  typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches ? 'app instalada' : 'navegador';

function applyScope(s: SentryModule): void {
  s.setUser(scope.userId ? { id: scope.userId } : null);
  s.setTag('empresa', scope.companyId ?? 'ninguna');
  s.setTag('pantalla', scope.route ?? 'inicio');
}

export function initErrorReporting(): void {
  if (!isErrorReportingEnabled()) return;
  void import('@sentry/react').then((s) => {
    s.init({
      dsn,
      environment: import.meta.env.MODE,
      release: `stockly@${__APP_RELEASE__}`,
      sendDefaultPii: false,
      // Solo errores: sin seguimiento de rendimiento ni grabación de pantalla (privacidad y plan gratis)
      tracesSampleRate: 0,
      integrations: (defaults) => defaults.filter((i) => i.name !== 'Replay'),
      // Errores del navegador o de la red que no son de Stockly
      ignoreErrors: ['ResizeObserver loop', 'Failed to fetch', 'NetworkError', 'Load failed', 'AbortError'],
      beforeSend: (event) => scrubEvent(event as ScrubbableEvent) as typeof event,
      beforeBreadcrumb: (crumb) => (crumb.category === 'console' && crumb.level !== 'error' ? null : crumb),
    });
    s.setTag('plataforma', platform());
    sentry = s;
    applyScope(s);
    for (const item of pending) s.captureException(item.error, { tags: item.context });
    pending = [];
  }).catch(() => {
    // Si no se pudo cargar (sin conexión), la app sigue igual
  });
}

/** Usuario (solo el id), empresa y pantalla actuales: se adjuntan a cada error. */
export function setErrorContext(next: { userId?: string; companyId?: string; route?: string }): void {
  scope = { ...scope, ...next };
  if (sentry) applyScope(sentry);
}

/** Informa un error atrapado (por ejemplo, una pantalla que no se pudo dibujar). */
export function reportError(error: unknown, context?: Record<string, string>): void {
  if (!isErrorReportingEnabled()) return;
  if (sentry) sentry.captureException(error, { tags: context });
  else if (pending.length < 20) pending.push({ error, context });
}
