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
