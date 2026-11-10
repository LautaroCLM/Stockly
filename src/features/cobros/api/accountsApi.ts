import { supabase } from '@/lib/supabase';
import { isNetworkOrUncertainError, toUserMessage } from '@/lib/errorMessages';
import type { AccountKind } from '../accountKinds';
import type { AccountBalance, CollectionActionResult, NewCollectionInput, StatementEntry } from '../types';

const UNCERTAIN_MESSAGE =
  'No pudimos confirmar la operación por un problema de conexión. Revisá el estado de cuenta antes de reintentar: si se guardó, no la repitas.';

const cleanMessage = (message: string) => message.replace(/^(P0001|error):\s*/i, '').trim();
const num = (value: unknown): number => Number(value ?? 0);

async function runAction(call: () => PromiseLike<{ error: { message: string } | null }>): Promise<CollectionActionResult> {
  try {
    const { error } = await call();
    if (!error) return { ok: true };
    if (isNetworkOrUncertainError(error.message)) return { ok: false, message: UNCERTAIN_MESSAGE, uncertain: true };
    return { ok: false, message: cleanMessage(error.message) };
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (isNetworkOrUncertainError(message)) return { ok: false, message: UNCERTAIN_MESSAGE, uncertain: true };
    return { ok: false, message: 'No se pudo completar la operación. Intentá de nuevo.' };
  }
}

const toParts = (input: NewCollectionInput) => input.parts.map((p) => ({ method: p.method, amount: p.amount }));

/** Operaciones de una cuenta corriente: saldos, estado de cuenta, cobro o pago, y anulación. */
interface AccountsApi {
  fetchBalances: (companyId: string) => Promise<AccountBalance[]>;
  fetchStatement: (companyId: string, partyId: string) => Promise<StatementEntry[]>;
  register: (companyId: string, input: NewCollectionInput) => Promise<CollectionActionResult>;
  voidPayment: (companyId: string, paymentId: string, reason: string) => Promise<CollectionActionResult>;
}

const customerApi: AccountsApi = {
  async fetchBalances(companyId) {
    const { data, error } = await supabase.rpc('customer_balances', { p_company_id: companyId });
    if (error) throw new Error(toUserMessage(error, 'No se pudieron cargar los saldos de los clientes.'));
    return (data ?? []).map((r) => ({
      partyId: r.customer_id, partyName: r.customer_name, chargedTotal: num(r.charged_total),
      settledTotal: num(r.collected_total), balance: num(r.balance), lastActivity: r.last_activity, oldestOpenSince: r.oldest_open_since,
    }));
  },
  async fetchStatement(companyId, partyId) {
    const { data, error } = await supabase.rpc('customer_statement', { p_company_id: companyId, p_customer_id: partyId });
    if (error) throw new Error(toUserMessage(error, 'No se pudo cargar el estado de cuenta.'));
    return (data ?? []).map((r) => ({
      kind: r.kind === 'payment' ? 'payment' : 'charge', referenceId: r.reference_id, document: r.document,
      occurredAt: r.occurred_at, amount: num(r.amount),
    }));
  },
  register: (companyId, input) =>
    runAction(() =>
      supabase.rpc('register_customer_payment', {
        p_company_id: companyId, p_customer_id: input.partyId, p_payments: toParts(input), p_notes: input.notes,
        p_into_cash: input.withCash, p_idempotency_key: input.idempotencyKey,
      })),
  voidPayment: (companyId, paymentId, reason) =>
    runAction(() => supabase.rpc('void_customer_payment', { p_company_id: companyId, p_payment_id: paymentId, p_reason: reason })),
};

const supplierApi: AccountsApi = {
  async fetchBalances(companyId) {
    const { data, error } = await supabase.rpc('supplier_balances', { p_company_id: companyId });
    if (error) throw new Error(toUserMessage(error, 'No se pudieron cargar las deudas con proveedores.'));
    return (data ?? []).map((r) => ({
      partyId: r.supplier_id, partyName: r.supplier_name, chargedTotal: num(r.charged_total),
      settledTotal: num(r.paid_total), balance: num(r.balance), lastActivity: r.last_activity, oldestOpenSince: r.oldest_open_since,
    }));
  },
  async fetchStatement(companyId, partyId) {
    const { data, error } = await supabase.rpc('supplier_statement', { p_company_id: companyId, p_supplier_id: partyId });
    if (error) throw new Error(toUserMessage(error, 'No se pudo cargar el estado de cuenta.'));
    return (data ?? []).map((r) => ({
      kind: r.kind === 'payment' ? 'payment' : 'charge', referenceId: r.reference_id, document: r.document,
      occurredAt: r.occurred_at, amount: num(r.amount),
    }));
  },
  register: (companyId, input) =>
    runAction(() =>
      supabase.rpc('register_supplier_payment', {
        p_company_id: companyId, p_supplier_id: input.partyId, p_payments: toParts(input), p_notes: input.notes,
        p_from_cash: input.withCash, p_idempotency_key: input.idempotencyKey,
      })),
  voidPayment: (companyId, paymentId, reason) =>
    runAction(() => supabase.rpc('void_supplier_payment', { p_company_id: companyId, p_payment_id: paymentId, p_reason: reason })),
};

export const accountsApi = (kind: AccountKind): AccountsApi => (kind === 'customer' ? customerApi : supplierApi);
