export const LOGO_MAX_SIDE = 512;
/** Tope del texto base64 que acepta la base (coincide con la migración). */
export const LOGO_MAX_CHARS = 200_000;
/** Tope del archivo original que se intenta leer. */
export const LOGO_MAX_INPUT_BYTES = 8 * 1024 * 1024;
export const LOGO_ACCEPT = 'image/png,image/jpeg,image/webp';

const SUPPORTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export const isSupportedLogoType = (type: string): boolean => SUPPORTED_TYPES.includes(type);

/** Tamaño final conservando las proporciones: el lado mayor no pasa de `max` y nunca se agranda. */
export function fitWithin(width: number, height: number, max: number = LOGO_MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
