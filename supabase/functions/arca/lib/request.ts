/** Pedido que manda la app a la función `arca`, validado en el borde. */
export type ArcaRequest =
  | { action: 'generate_csr'; companyId: string }
  | { action: 'upload_certificate'; companyId: string; certificatePem: string }
  | { action: 'test_connection'; companyId: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CERTIFICATE_LENGTH = 20_000;

export class BadRequestError extends Error {}

export function parseArcaRequest(raw: unknown): ArcaRequest {
  if (typeof raw !== 'object' || raw === null) throw new BadRequestError('Pedido inválido.');
  const body = raw as Record<string, unknown>;
  const companyId = body.companyId;
  if (typeof companyId !== 'string' || !UUID.test(companyId)) throw new BadRequestError('Empresa inválida.');

  switch (body.action) {
    case 'generate_csr':
      return { action: 'generate_csr', companyId };
    case 'test_connection':
      return { action: 'test_connection', companyId };
    case 'upload_certificate': {
      const pem = body.certificatePem;
      if (typeof pem !== 'string' || pem.trim() === '' || pem.length > MAX_CERTIFICATE_LENGTH) {
        throw new BadRequestError('El certificado está vacío o es demasiado grande.');
      }
      return { action: 'upload_certificate', companyId, certificatePem: pem };
    }
    default:
      throw new BadRequestError('Acción desconocida.');
  }
}

/** Respuesta de la función: siempre 200 con ok/mensaje, así la app muestra el motivo. */
export type ArcaResponse = { ok: true; message: string; data?: Record<string, unknown> } | { ok: false; message: string };
