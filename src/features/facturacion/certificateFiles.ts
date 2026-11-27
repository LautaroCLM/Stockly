const MAX_CERTIFICATE_BYTES = 20_000;

/** Descarga un texto como archivo (el pedido de certificado para subir a ARCA). */
export function downloadTextFile(filename: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/pkcs10' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Nombre del archivo del pedido: incluye el CUIT para no confundir el de una empresa con el de otra. */
export function csrFilename(cuit: string, environment: string): string {
  const digits = cuit.replace(/\D/g, '') || 'empresa';
  return `stockly-${digits}-${environment}.csr`;
}

/** Valida el texto del certificado antes de mandarlo: tiene que ser PEM. */
export function certificateTextError(text: string): string | null {
  if (text.length > MAX_CERTIFICATE_BYTES) return 'El archivo es demasiado grande para ser un certificado.';
  if (!text.includes('-----BEGIN CERTIFICATE-----')) {
    return 'El archivo no tiene el formato esperado. Subí el certificado en texto (.crt o .pem) que te dio ARCA.';
  }
  return null;
}

export async function readCertificateFile(file: File): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
  if (file.size > MAX_CERTIFICATE_BYTES) return { ok: false, message: 'El archivo es demasiado grande para ser un certificado.' };
  const text = await file.text();
  const error = certificateTextError(text);
  return error ? { ok: false, message: error } : { ok: true, text };
}
