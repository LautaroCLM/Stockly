/** Datos de la empresa para la factura electrónica (tabla arca_settings). */
export interface ArcaSettings {
  /** Punto de venta "Web Services" dado de alta en ARCA; null si todavía no se cargó. */
  pointOfSale: number | null;
  /** Fecha YYYY-MM-DD, o '' si no se cargó. */
  activityStartDate: string;
  grossIncomeNumber: string;
}

export const EMPTY_ARCA_SETTINGS: ArcaSettings = { pointOfSale: null, activityStartDate: '', grossIncomeNumber: '' };

export type ArcaActionResult = { ok: true } | { ok: false; message: string };

/** Valores del formulario tal como se escriben. */
export interface ArcaSettingsFormValues {
  pointOfSale: string;
  activityStartDate: string;
  grossIncomeNumber: string;
}

export const MAX_ARCA_POINT_OF_SALE = 99998;

export type ArcaEnvironment = 'homologacion' | 'produccion';

export const ARCA_ENVIRONMENT_LABELS: Record<ArcaEnvironment, string> = {
  homologacion: 'Homologación (prueba)',
  produccion: 'Producción',
};

/** Estado del certificado y de la conexión con ARCA (sin secretos). */
export interface ArcaStatus {
  environment: ArcaEnvironment;
  hasCsr: boolean;
  /** Solo llega para el Master Admin. */
  csrPem: string | null;
  hasCertificate: boolean;
  certificateExpiresAt: string | null;
  certificateSubject: string | null;
  lastTestAt: string | null;
  lastTestOk: boolean | null;
  lastTestMessage: string | null;
}

export const EMPTY_ARCA_STATUS: ArcaStatus = {
  environment: 'homologacion', hasCsr: false, csrPem: null, hasCertificate: false, certificateExpiresAt: null,
  certificateSubject: null, lastTestAt: null, lastTestOk: null, lastTestMessage: null,
};

export type ArcaFunctionAction = 'generate_csr' | 'upload_certificate' | 'test_connection';
