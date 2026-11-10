import { LOGO_MAX_CHARS, LOGO_MAX_INPUT_BYTES, LOGO_MAX_SIDE, fitWithin, isSupportedLogoType } from './imageFit';

function canvasToDataUrl(canvas: HTMLCanvasElement, type: string, quality?: number): string {
  return canvas.toDataURL(type, quality);
}

/**
 * Reduce el logo a 512 px como máximo y lo comprime para guardarlo en la base (decenas de KB).
 * Mantiene la transparencia: prueba PNG y, si pesa demasiado, WebP con calidad decreciente.
 */
export async function prepareLogo(file: File): Promise<string> {
  if (!isSupportedLogoType(file.type)) throw new Error('El logo tiene que ser una imagen PNG, JPG o WebP.');
  if (file.size > LOGO_MAX_INPUT_BYTES) throw new Error('La imagen pesa más de 8 MB. Probá con una más chica.');

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('No se pudo leer la imagen. Probá con otro archivo.');
  }

  const { width, height } = fitWithin(bitmap.width, bitmap.height, LOGO_MAX_SIDE);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No se pudo procesar la imagen en este navegador.');
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const candidates = [
    () => canvasToDataUrl(canvas, 'image/png'),
    () => canvasToDataUrl(canvas, 'image/webp', 0.9),
    () => canvasToDataUrl(canvas, 'image/webp', 0.75),
    () => canvasToDataUrl(canvas, 'image/webp', 0.6),
  ];
  for (const make of candidates) {
    const url = make();
    if (url.startsWith('data:image/') && url.length <= LOGO_MAX_CHARS) return url;
  }
  throw new Error('La imagen sigue pesando demasiado después de reducirla. Probá con una más simple.');
}
