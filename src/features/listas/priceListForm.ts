import { ROUNDING_STEPS, type PriceList, type PriceListFormValues, type RoundingStep } from './types';

export const EMPTY_LIST_FORM: PriceListFormValues = { name: '', percentText: '', roundingStep: 10, isActive: true };

export function toListForm(list: PriceList): PriceListFormValues {
  return {
    name: list.name,
    percentText: String(list.adjustmentPercent).replace('.', ','),
    roundingStep: list.roundingStep,
    isActive: list.isActive,
  };
}

export function toRoundingStep(raw: unknown): RoundingStep {
  const value = Number(raw);
  return (ROUNDING_STEPS as readonly number[]).includes(value) ? (value as RoundingStep) : 0.01;
}

/** Valida el formulario; acepta coma o punto decimal. */
export function parseListForm(
  v: PriceListFormValues
): { ok: true; value: { name: string; percent: number; roundingStep: RoundingStep; isActive: boolean } } | { ok: false; message: string } {
  const name = v.name.trim();
  if (name === '' || name.length > 60) return { ok: false, message: 'El nombre es obligatorio y no puede superar 60 caracteres.' };
  const text = v.percentText.trim().replace(',', '.');
  if (!/^[+-]?\d+(\.\d{1,2})?$/.test(text)) return { ok: false, message: 'Escribí el porcentaje como número (ej. -15 o 10,5).' };
  const percent = Number(text);
  if (percent < -90 || percent > 1000) return { ok: false, message: 'El porcentaje debe estar entre -90 % y 1000 %.' };
  return { ok: true, value: { name, percent, roundingStep: v.roundingStep, isActive: v.isActive } };
}

/** Ejemplo: -15 → "−15 % sobre el precio de venta"; 0 → "Igual al precio de venta". */
export function describeAdjustment(percent: number): string {
  if (percent === 0) return 'Igual al precio de venta';
  const text = `${String(Math.abs(percent)).replace('.', ',')} %`;
  return percent < 0 ? `${text} menos que el precio de venta` : `${text} más que el precio de venta`;
}
