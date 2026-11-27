/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** Clave del proyecto de Sentry (alertas de errores). Sin ella, no se envía nada. */
  readonly VITE_SENTRY_DSN?: string;
}

/** Versión publicada (commit de Vercel o "local"), para saber en qué publicación apareció un error. */
declare const __APP_RELEASE__: string;

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
