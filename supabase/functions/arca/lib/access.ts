import { wsaaLogin } from './arcaClient.ts';
import { signTra } from './certs.ts';
import type { CredentialsStore } from './db.ts';
import type { ArcaEnvironment } from './endpoints.ts';
import { buildTra, type AccessTicket } from './wsaaMessages.ts';

export const WSFE_SERVICE = 'wsfe';

export type AccessResult = { ok: true; ticket: AccessTicket } | { ok: false; message: string };

/** Acceso de WSAA: el guardado si sigue vigente, o uno nuevo (ARCA no da otro mientras haya uno válido). */
export async function accessTicket(
  environment: ArcaEnvironment, store: CredentialsStore, certificatePem: string, privateKeyPem: string
): Promise<AccessResult> {
  const cached = await store.cachedTicket(WSFE_SERVICE);
  if (cached) return { ok: true, ticket: cached };
  const now = new Date();
  const login = await wsaaLogin(environment, signTra(buildTra(WSFE_SERVICE, now), certificatePem, privateKeyPem, now));
  if (!login.ok) return { ok: false, message: login.message };
  await store.saveTicket(WSFE_SERVICE, login.ticket);
  return { ok: true, ticket: login.ticket };
}
