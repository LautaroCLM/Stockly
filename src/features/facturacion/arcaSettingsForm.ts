import { MAX_ARCA_POINT_OF_SALE, type ArcaSettings, type ArcaSettingsFormValues } from './types';

export function toArcaFormValues(s: ArcaSettings): ArcaSettingsFormValues {
  return {
    pointOfSale: s.pointOfSale === null ? '' : String(s.pointOfSale),
    activityStartDate: s.activityStartDate,
    grossIncomeNumber: s.grossIncomeNumber,
  };
}

/** Fecha local de hoy en YYYY-MM-DD (no UTC: a la noche en Argentina sería mañana). */
export function todayIso(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Valida y convierte el formulario; devuelve el mensaje de error o los datos listos para guardar. */
export function parseArcaForm(
  v: ArcaSettingsFormValues,
  today: string = todayIso()
): { ok: true; value: ArcaSettings } | { ok: false; message: string } {
  const posText = v.pointOfSale.trim();
  let pointOfSale: number | null = null;
  if (posText !== '') {
    if (!/^\d+$/.test(posText)) return { ok: false, message: 'El punto de venta tiene que ser un número.' };
    pointOfSale = Number(posText);
    if (pointOfSale < 1 || pointOfSale > MAX_ARCA_POINT_OF_SALE) {
      return { ok: false, message: `El punto de venta debe estar entre 1 y ${MAX_ARCA_POINT_OF_SALE}.` };
    }
  }

  const date = v.activityStartDate.trim();
  if (date !== '' && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < '1900-01-01' || date > today)) {
    return { ok: false, message: 'La fecha de inicio de actividades no es válida.' };
  }

  const grossIncome = v.grossIncomeNumber.trim();
  if (grossIncome.length > 30) return { ok: false, message: 'El número de ingresos brutos no puede superar 30 caracteres.' };

  return { ok: true, value: { pointOfSale, activityStartDate: date, grossIncomeNumber: grossIncome } };
}

/** Ejemplo: 3 → "00003" (ARCA usa 5 dígitos para el punto de venta). */
export function formatArcaPointOfSale(pos: number | null): string {
  return pos === null ? '' : String(pos).padStart(5, '0');
}
