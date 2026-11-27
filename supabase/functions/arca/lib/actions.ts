import { wsaaLogin, wsfeDummy, wsfeLastAuthorized } from './arcaClient.ts';
import { CertificateError, generateKeyAndCsr, inspectCertificate, signTra } from './certs.ts';
import type { AdminContext, CredentialsStore } from './db.ts';
import { INVOICE_TYPE_CODES, cuitDigits, lettersForTaxCondition } from './endpoints.ts';
import type { ArcaResponse } from './request.ts';
import { buildTra, type AccessTicket } from './wsaaMessages.ts';
import { serversAreUp } from './wsfeMessages.ts';

const SERVICE = 'wsfe';
const ENV_LABEL = { homologacion: 'homologación', produccion: 'producción' } as const;

function requireCuit(ctx: AdminContext): string {
  const cuit = cuitDigits(ctx.cuit);
  if (!cuit) throw new CertificateError('La empresa no tiene un CUIT válido cargado.');
  return cuit;
}

export async function generateCsr(ctx: AdminContext, store: CredentialsStore): Promise<ArcaResponse> {
  const cuit = requireCuit(ctx);
  const { privateKeyPem, csrPem } = await generateKeyAndCsr(ctx.companyName, cuit);
  await store.saveCsr(privateKeyPem, csrPem, ctx.userId);
  return { ok: true, message: 'Pedido de certificado generado.', data: { csrPem } };
}

export async function uploadCertificate(ctx: AdminContext, store: CredentialsStore, certificatePem: string): Promise<ArcaResponse> {
  const cuit = requireCuit(ctx);
  const creds = await store.credentials();
  if (!creds) return { ok: false, message: 'Primero generá el pedido de certificado.' };
  const info = inspectCertificate(certificatePem, creds.privateKeyPem, cuit, new Date());
  await store.saveCertificate(certificatePem.trim(), info.expiresAt, info.subject, ctx.userId);
  return { ok: true, message: 'Certificado cargado. Ahora probá la conexión.', data: { ...info } };
}

/** Acceso de WSAA: el guardado si sigue vigente, o uno nuevo (ARCA no da otro mientras haya uno válido). */
async function accessTicket(ctx: AdminContext, store: CredentialsStore, certificatePem: string, privateKeyPem: string) {
  const cached = await store.cachedTicket(SERVICE);
  if (cached) return { ok: true as const, ticket: cached };
  const now = new Date();
  const login = await wsaaLogin(ctx.environment, signTra(buildTra(SERVICE, now), certificatePem, privateKeyPem, now));
  if (!login.ok) return login;
  await store.saveTicket(SERVICE, login.ticket);
  return { ok: true as const, ticket: login.ticket };
}

async function lastNumbers(ctx: AdminContext, ticket: AccessTicket, cuit: string, pointOfSale: number) {
  const parts: string[] = [];
  for (const letter of lettersForTaxCondition(ctx.taxCondition)) {
    const auth = { token: ticket.token, sign: ticket.sign, cuit };
    const result = await wsfeLastAuthorized(ctx.environment, auth, pointOfSale, INVOICE_TYPE_CODES[letter]);
    if (!result.ok) return { ok: false as const, message: result.message };
    parts.push(`Factura ${letter} n.º ${result.number}`);
  }
  return { ok: true as const, summary: parts.join(', ') };
}

/** Estado de ARCA, acceso con el certificado y última numeración del punto de venta. */
export async function testConnection(ctx: AdminContext, store: CredentialsStore): Promise<ArcaResponse> {
  const env = ENV_LABEL[ctx.environment];
  const finish = async (ok: boolean, message: string, hasCredentials: boolean): Promise<ArcaResponse> => {
    if (hasCredentials) await store.saveTestResult(ok, message);
    return ok ? { ok: true, message } : { ok: false, message };
  };

  const dummy = await wsfeDummy(ctx.environment);
  const creds = await store.credentials();
  const hasCreds = creds !== null;
  if (!dummy.ok) return finish(false, dummy.message, hasCreds);
  if (!serversAreUp(dummy.status)) {
    const s = dummy.status;
    return finish(false, `ARCA (${env}) tiene servicios caídos: aplicación ${s.app}, base ${s.db}, autenticación ${s.auth}.`, hasCreds);
  }
  if (!creds || !creds.certificatePem) {
    return finish(false, `Los servidores de ARCA (${env}) responden, pero falta cargar el certificado.`, hasCreds);
  }

  const cuit = requireCuit(ctx);
  const access = await accessTicket(ctx, store, creds.certificatePem, creds.privateKeyPem);
  if (!access.ok) return finish(false, access.message, true);
  if (ctx.pointOfSale === null) {
    return finish(false, `El acceso a ARCA (${env}) funciona, pero falta cargar el punto de venta electrónico.`, true);
  }
  if (lettersForTaxCondition(ctx.taxCondition).length === 0) {
    return finish(false, 'Con la condición de IVA actual la empresa no emite factura electrónica.', true);
  }

  const numbers = await lastNumbers(ctx, access.ticket, cuit, ctx.pointOfSale);
  if (!numbers.ok) return finish(false, numbers.message, true);
  const pos = String(ctx.pointOfSale).padStart(5, '0');
  return finish(true, `Conexión correcta con ARCA (${env}). Punto de venta ${pos}, últimos números: ${numbers.summary}.`, true);
}
