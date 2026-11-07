import { supabase } from '@/lib/supabase';
import { isNetworkOrUncertainError, toUserMessage } from '@/lib/errorMessages';
import type { CollectionActionResult, CustomerBalance, NewCollectionInput, StatementEntry } from '../types';

const UNCERTAIN_MESSAGE =
  'No pudimos confirmar la operación por un problema de conexión. Revisá el estado de cuenta antes de reintentar: si se guardó, no la repitas.';

const cleanMessage = (message: string) => message.replace(/^(P0001|error):\s*/i, '').trim();
const num = (value: unknown): number => Number(value ?? 0);

/** Saldo de cada cliente que tuvo cuenta corriente, de mayor a menor deuda. */
export async function fetchCustomerBalances(companyId: string): Promise<CustomerBalance[]> {
  const { data, error } = await supabase.rpc('customer_balances', { p_company_id: companyId });
  if (error) throw new Error(toUserMessage(error, 'No se pudieron cargar los saldos de los clientes.'));
  return (data ?? []).map((r) => ({
    customerId: r.customer_id,
    customerName: r.customer_name,
    chargedTotal: num(r.charged_total),
    collectedTotal: num(r.collected_total),
    balance: num(r.balance),
    lastActivity: r.last_activity,
    oldestOpenSince: r.oldest_open_since,
  }));
}

/** Ventas a crédito y cobros vigentes de un cliente, en orden cronológico. */
export async function fetchCustomerStatement(companyId: string, customerId: string): Promise<StatementEntry[]> {
  const { data, error } = await supabase.rpc('customer_statement', { p_company_id: companyId, p_customer_id: customerId });
  if (error) throw new Error(toUserMessage(error, 'No se pudo cargar el estado de cuenta.'));
  return (data ?? []).map((r) => ({
    kind: r.kind === 'payment' ? 'payment' : 'sale',
    referenceId: r.reference_id,
    document: r.document,
    occurredAt: r.occurred_at,
    amount: num(r.amount),
  }));
}

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

export const registerCollectionRpc = (companyId: string, input: NewCollectionInput) =>
  runAction(() =>
    supabase.rpc('register_customer_payment', {
      p_company_id: companyId,
      p_customer_id: input.customerId,
      p_payments: input.parts.map((p) => ({ method: p.method, amount: p.amount })),
      p_notes: input.notes,
      p_into_cash: input.intoCash,
      p_idempotency_key: input.idempotencyKey,
    })
  );

export const voidCollectionRpc = (companyId: string, paymentId: string, reason: string) =>
  runAction(() => supabase.rpc('void_customer_payment', { p_company_id: companyId, p_payment_id: paymentId, p_reason: reason }));
