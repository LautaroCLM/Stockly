import type { SupabaseClient } from '@supabase/supabase-js';
import { toEnvironment, type ArcaEnvironment } from './endpoints.ts';
import { ForbiddenError } from './db.ts';
import type { InvoiceData } from './wsfeInvoice.ts';

export interface InvoiceContext {
  userId: string;
  environment: ArcaEnvironment;
  cuit: string;
}

const clean = (message: string) => message.replace(/^(P0001|error):\s*/i, '').trim();

/** Confirma, con el token del usuario, que puede facturar en la empresa. */
export async function getInvoiceContext(userClient: SupabaseClient, companyId: string, invoiceId: string): Promise<InvoiceContext> {
  const { data, error } = await userClient.rpc('arca_invoice_context', { p_company_id: companyId, p_invoice_id: invoiceId });
  if (error || typeof data !== 'object' || data === null) {
    throw new ForbiddenError(error ? clean(error.message) : 'No tenés permiso para facturar en esta empresa.');
  }
  const d = data as Record<string, unknown>;
  return { userId: String(d.userId), environment: toEnvironment(d.environment), cuit: String(d.cuit ?? '') };
}

function toAssociated(raw: unknown): InvoiceData['associated'] {
  if (typeof raw !== 'object' || raw === null) return null;
  const a = raw as Record<string, unknown>;
  if (typeof a.number !== 'number') throw new Error('La factura asociada no tiene número de ARCA.');
  return { invoiceType: Number(a.invoiceType), pointOfSale: Number(a.pointOfSale), number: a.number, issueDate: String(a.issueDate) };
}

function toInvoice(raw: unknown): InvoiceData {
  const d = raw as Record<string, unknown>;
  const lines = Array.isArray(d.vatLines) ? (d.vatLines as Record<string, unknown>[]) : [];
  return {
    id: String(d.id),
    invoiceType: Number(d.invoiceType),
    pointOfSale: Number(d.pointOfSale),
    issueDate: String(d.issueDate),
    receiverDocType: Number(d.receiverDocType),
    receiverDocNumber: String(d.receiverDocNumber),
    receiverVatConditionId: Number(d.receiverVatConditionId),
    netAmount: Number(d.netAmount),
    vatAmount: Number(d.vatAmount),
    totalAmount: Number(d.totalAmount),
    status: d.status === 'authorized' || d.status === 'rejected' ? d.status : 'pending',
    attemptNumber: typeof d.attemptNumber === 'number' ? d.attemptNumber : null,
    vatLines: lines.map((l) => ({ arcaVatId: Number(l.arcaVatId), base: Number(l.base), amount: Number(l.amount) })),
    associated: toAssociated(d.associated),
  };
}

/** Lectura y escritura de facturas desde la función (service_role). */
export class InvoiceStore {
  constructor(private readonly db: SupabaseClient, private readonly invoiceId: string) {}

  private async call(fn: string, args: Record<string, unknown> = {}): Promise<unknown> {
    const { data, error } = await this.db.rpc(fn, { p_invoice_id: this.invoiceId, ...args });
    if (error) throw new Error(clean(error.message));
    return data;
  }

  async get(): Promise<InvoiceData> {
    const data = await this.call('arca_get_invoice');
    if (!data) throw new ForbiddenError('Factura no encontrada.');
    return toInvoice(data);
  }

  async lock(seconds: number): Promise<boolean> {
    return (await this.call('arca_lock_numbering', { p_seconds: seconds })) === true;
  }

  async unlock(): Promise<void> {
    await this.call('arca_unlock_numbering');
  }

  async setAttempt(number: number): Promise<void> {
    await this.call('arca_set_invoice_attempt', { p_number: number });
  }

  async saveAuthorized(number: number, cae: string, caeExpiresAt: string, message: string | null): Promise<void> {
    await this.call('arca_store_invoice_result', {
      p_status: 'authorized', p_number: number, p_cae: cae, p_cae_expires_at: caeExpiresAt, p_message: message,
    });
  }

  async saveRejected(message: string): Promise<void> {
    await this.call('arca_store_invoice_result', {
      p_status: 'rejected', p_number: null, p_cae: null, p_cae_expires_at: null, p_message: message,
    });
  }

  async savePendingMessage(message: string): Promise<void> {
    await this.call('arca_store_invoice_result', {
      p_status: 'pending', p_number: null, p_cae: null, p_cae_expires_at: null, p_message: message,
    });
  }
}
