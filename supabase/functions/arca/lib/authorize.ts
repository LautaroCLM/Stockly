import { accessTicket } from './access.ts';
import { ArcaUnavailableError, wsfeCaeRequest, wsfeConsult, wsfeLastAuthorized } from './arcaClient.ts';
import type { CredentialsStore } from './db.ts';
import type { InvoiceContext, InvoiceStore } from './invoiceStore.ts';
import type { ArcaResponse } from './request.ts';
import { consultMatches } from './wsfeInvoice.ts';
import type { WsfeAuth } from './wsfeMessages.ts';

const LOCK_SECONDS = 90;
const LOCK_TRIES = 5;
const UNCERTAIN =
  'ARCA no respondió a tiempo y no sabemos si autorizó la factura. Tocá "Reintentar": Stockly consulta primero a ARCA y no la duplica.';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const authorized = (number: number, cae: string): ArcaResponse =>
  ({ ok: true, message: 'Factura autorizada por ARCA.', data: { number, cae } });

/** Toma el turno de numeración de su punto de venta y tipo (otra factura puede estar en curso). */
async function takeTurn(invoices: InvoiceStore): Promise<boolean> {
  for (let i = 0; i < LOCK_TRIES; i++) {
    if (await invoices.lock(LOCK_SECONDS)) return true;
    await wait(1500);
  }
  return false;
}

/**
 * Pide el CAE de una factura pendiente. Si un intento anterior quedó sin respuesta, primero
 * consulta a ARCA ese número: si ya la autorizó, guarda ese CAE en vez de pedir otro.
 */
async function requestCae(ctx: InvoiceContext, invoices: InvoiceStore, auth: WsfeAuth): Promise<ArcaResponse> {
  const inv = await invoices.get();
  if (inv.status !== 'pending') return { ok: false, message: 'Esta factura ya no está pendiente.' };

  if (inv.attemptNumber !== null) {
    const previous = await wsfeConsult(ctx.environment, auth, inv.pointOfSale, inv.invoiceType, inv.attemptNumber);
    if ('error' in previous) return { ok: false, message: previous.error };
    if (previous.found && consultMatches(inv, previous)) {
      await invoices.saveAuthorized(inv.attemptNumber, previous.cae, previous.caeExpiresAt, null);
      return authorized(inv.attemptNumber, previous.cae);
    }
  }

  const last = await wsfeLastAuthorized(ctx.environment, auth, inv.pointOfSale, inv.invoiceType);
  if (!last.ok) return { ok: false, message: last.message };
  const number = last.number + 1;
  await invoices.setAttempt(number);

  let result;
  try {
    result = await wsfeCaeRequest(ctx.environment, auth, inv, number);
  } catch (err) {
    if (!(err instanceof ArcaUnavailableError)) throw err;
    await invoices.savePendingMessage(UNCERTAIN);
    return { ok: false, message: UNCERTAIN };
  }

  if (result.status === 'authorized') {
    await invoices.saveAuthorized(number, result.cae, result.caeExpiresAt, result.observations || null);
    return authorized(number, result.cae);
  }
  await invoices.saveRejected(result.message);
  return { ok: false, message: result.message };
}

export async function authorizeInvoice(ctx: InvoiceContext, creds: CredentialsStore, invoices: InvoiceStore): Promise<ArcaResponse> {
  const stored = await creds.credentials();
  if (!stored || !stored.certificatePem) {
    return { ok: false, message: 'Falta cargar el certificado de ARCA en "Datos de Empresa".' };
  }
  const access = await accessTicket(ctx.environment, creds, stored.certificatePem, stored.privateKeyPem);
  if (!access.ok) return { ok: false, message: access.message };
  const auth = { token: access.ticket.token, sign: access.ticket.sign, cuit: ctx.cuit };

  if (!(await takeTurn(invoices))) {
    return { ok: false, message: 'Hay otra factura del mismo tipo en curso. Probá de nuevo en unos segundos.' };
  }
  try {
    return await requestCae(ctx, invoices, auth);
  } finally {
    await invoices.unlock();
  }
}
