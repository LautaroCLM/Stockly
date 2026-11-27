import type { SupabaseClient } from '@supabase/supabase-js';
import { toEnvironment, type ArcaEnvironment } from './endpoints.ts';
import type { AccessTicket } from './wsaaMessages.ts';

export interface AdminContext {
  userId: string;
  companyName: string;
  cuit: string | null;
  environment: ArcaEnvironment;
  pointOfSale: number | null;
  taxCondition: string;
}

export class ForbiddenError extends Error {}

const clean = (message: string) => message.replace(/^(P0001|error):\s*/i, '').trim();

/** Confirma, con el token del usuario, que es Master Admin de la empresa. */
export async function getAdminContext(userClient: SupabaseClient, companyId: string): Promise<AdminContext> {
  const { data, error } = await userClient.rpc('arca_admin_context', { p_company_id: companyId });
  if (error || typeof data !== 'object' || data === null) {
    throw new ForbiddenError('Solo el Master Admin de la empresa puede configurar la factura electrónica.');
  }
  const d = data as Record<string, unknown>;
  return {
    userId: String(d.userId),
    companyName: String(d.companyName ?? ''),
    cuit: typeof d.cuit === 'string' ? d.cuit : null,
    environment: toEnvironment(d.environment),
    pointOfSale: typeof d.pointOfSale === 'number' ? d.pointOfSale : null,
    taxCondition: String(d.taxCondition ?? ''),
  };
}

/** Operaciones con credenciales: solo con el cliente service_role. */
export class CredentialsStore {
  constructor(private readonly db: SupabaseClient, private readonly companyId: string, private readonly env: ArcaEnvironment) {}

  private async call(fn: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await this.db.rpc(fn, { p_company_id: this.companyId, p_environment: this.env, ...args });
    if (error) throw new Error(clean(error.message));
    return data;
  }

  async saveCsr(privateKeyPem: string, csrPem: string, userId: string): Promise<void> {
    await this.call('arca_store_csr', { p_private_key_pem: privateKeyPem, p_csr_pem: csrPem, p_user_id: userId });
  }

  async saveCertificate(certificatePem: string, expiresAt: string, subject: string, userId: string): Promise<void> {
    await this.call('arca_store_certificate', {
      p_certificate_pem: certificatePem, p_expires_at: expiresAt, p_subject: subject, p_user_id: userId,
    });
  }

  async credentials(): Promise<{ privateKeyPem: string; certificatePem: string | null } | null> {
    const data = (await this.call('arca_get_credentials', {})) as Record<string, unknown> | null;
    if (!data || typeof data.privateKeyPem !== 'string') return null;
    return {
      privateKeyPem: data.privateKeyPem,
      certificatePem: typeof data.certificatePem === 'string' ? data.certificatePem : null,
    };
  }

  async saveTestResult(ok: boolean, message: string): Promise<void> {
    await this.call('arca_store_test_result', { p_ok: ok, p_message: message });
  }

  async cachedTicket(service: string): Promise<AccessTicket | null> {
    const data = (await this.call('arca_get_token', { p_service: service })) as Record<string, unknown> | null;
    if (!data || typeof data.token !== 'string' || typeof data.sign !== 'string') return null;
    return { token: data.token, sign: data.sign, expiresAt: String(data.expiresAt) };
  }

  async saveTicket(service: string, ticket: AccessTicket): Promise<void> {
    await this.call('arca_store_token', {
      p_service: service, p_token: ticket.token, p_sign: ticket.sign, p_expires_at: ticket.expiresAt,
    });
  }
}
