import { supabase } from '@/lib/supabase';
import { isNetworkOrUncertainError } from '@/features/inventario/api/stockMovementsApi';
import type { CashActionResult, CashMovement, CashMovementType, CashSession, CashSummary } from '../types';

export const CASH_HISTORY_PAGE_SIZE = 20;

const SESSION_COLUMNS =
  'id, company_id, status, opened_by, opened_at, opening_amount, opening_notes, closed_by, closed_at, expected_amount, counted_amount, difference_amount, closing_notes';

type SessionRow = {
  id: string;
  company_id: string;
  status: string;
  opened_by: string;
  opened_at: string;
  opening_amount: number;
  opening_notes: string | null;
  closed_by: string | null;
  closed_at: string | null;
  expected_amount: number | null;
  counted_amount: number | null;
  difference_amount: number | null;
  closing_notes: string | null;
};

const cleanMessage = (message: string) => message.replace(/^(P0001|error):\s*/i, '').trim();

async function fetchNames(userIds: (string | null)[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return new Map();
  const { data } = await supabase.from('profiles_public').select('id, full_name').in('id', ids);
  return new Map((data ?? []).filter((p) => p.id).map((p) => [p.id as string, p.full_name || 'Usuario']));
}

function toSession(row: SessionRow, names: Map<string, string>): CashSession {
  return {
    id: row.id,
    companyId: row.company_id,
    status: row.status === 'closed' ? 'closed' : 'open',
    openedBy: row.opened_by,
    openedByName: names.get(row.opened_by) ?? 'Usuario',
    openedAt: row.opened_at,
    openingAmount: Number(row.opening_amount),
    openingNotes: row.opening_notes,
    closedBy: row.closed_by,
    closedByName: row.closed_by ? names.get(row.closed_by) ?? 'Usuario' : null,
    closedAt: row.closed_at,
    expectedAmount: row.expected_amount === null ? null : Number(row.expected_amount),
    countedAmount: row.counted_amount === null ? null : Number(row.counted_amount),
    differenceAmount: row.difference_amount === null ? null : Number(row.difference_amount),
    closingNotes: row.closing_notes,
  };
}

/** Caja abierta de la empresa, o null si está cerrada. */
export async function fetchOpenSession(companyId: string): Promise<CashSession | null> {
  const { data, error } = await supabase
    .from('cash_sessions')
    .select(SESSION_COLUMNS)
    .eq('company_id', companyId)
    .eq('status', 'open')
    .maybeSingle();
  if (error) throw new Error('No se pudo consultar el estado de la caja.');
  if (!data) return null;
  return toSession(data, await fetchNames([data.opened_by]));
}

/** Cajas cerradas, de la más reciente a la más antigua. */
export async function fetchClosedSessions(
  companyId: string,
  offset: number
): Promise<{ rows: CashSession[]; total: number }> {
  const { data, error, count } = await supabase
    .from('cash_sessions')
    .select(SESSION_COLUMNS, { count: 'exact' })
    .eq('company_id', companyId)
    .eq('status', 'closed')
    .order('opened_at', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + CASH_HISTORY_PAGE_SIZE - 1);
  if (error) throw new Error('No se pudo cargar el historial de cajas.');
  const rows = data ?? [];
  const names = await fetchNames(rows.flatMap((r) => [r.opened_by, r.closed_by]));
  return { rows: rows.map((r) => toSession(r, names)), total: count ?? 0 };
}

export async function fetchCashMovements(sessionId: string): Promise<CashMovement[]> {
  const { data, error } = await supabase
    .from('cash_movements')
    .select('id, movement_type, amount, reason, created_by, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false });
  if (error) throw new Error('No se pudieron cargar los movimientos de la caja.');
  const rows = data ?? [];
  const names = await fetchNames(rows.map((r) => r.created_by));
  return rows.map((r) => ({
    id: r.id,
    movementType: r.movement_type === 'out' ? 'out' : 'in',
    amount: Number(r.amount),
    reason: r.reason,
    createdByName: names.get(r.created_by) ?? 'Usuario',
    createdAt: r.created_at,
  }));
}

const num = (value: unknown): number => Number(value ?? 0);
const numOrNull = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

export async function fetchCashSummary(companyId: string, sessionId: string): Promise<CashSummary> {
  const { data, error } = await supabase.rpc('cash_session_summary', {
    p_company_id: companyId,
    p_session_id: sessionId,
  });
  if (error) throw new Error(cleanMessage(error.message));
  const s = (data ?? {}) as Record<string, unknown>;
  const other = (s.other_payments ?? {}) as Record<string, unknown>;
  return {
    openingAmount: num(s.opening_amount),
    cashSalesAmount: num(s.cash_sales_amount),
    cashRefundsAmount: num(s.cash_refunds_amount),
    cashInAmount: num(s.cash_in_amount),
    cashOutAmount: num(s.cash_out_amount),
    expectedAmount: num(s.expected_amount),
    completedSalesCount: numOrNull(s.completed_sales_count),
    otherPayments: Object.fromEntries(Object.entries(other).map(([k, v]) => [k, num(v)])),
    countedAmount: numOrNull(s.counted_amount),
    differenceAmount: numOrNull(s.difference_amount),
  };
}

const UNCERTAIN_MESSAGE =
  'No pudimos confirmar la operación por un problema de conexión. Revisá la caja antes de reintentar para no duplicarla.';

async function runAction(call: () => PromiseLike<{ error: { message: string } | null }>): Promise<CashActionResult> {
  try {
    const { error } = await call();
    if (!error) return { ok: true };
    if (isNetworkOrUncertainError(error.message)) return { ok: false, message: UNCERTAIN_MESSAGE, uncertain: true };
    return { ok: false, message: cleanMessage(error.message) };
  } catch (err) {
    if (isNetworkOrUncertainError(err)) return { ok: false, message: UNCERTAIN_MESSAGE, uncertain: true };
    return { ok: false, message: err instanceof Error ? cleanMessage(err.message) : 'No se pudo completar la operación.' };
  }
}

export function openCashSessionRpc(companyId: string, openingAmount: number, notes: string) {
  return runAction(() =>
    supabase.rpc('open_cash_session', {
      p_company_id: companyId,
      p_opening_amount: openingAmount,
      p_notes: notes || undefined,
    })
  );
}

export function registerCashMovementRpc(
  companyId: string,
  sessionId: string,
  movementType: CashMovementType,
  amount: number,
  reason: string
) {
  return runAction(() =>
    supabase.rpc('register_cash_movement', {
      p_company_id: companyId,
      p_session_id: sessionId,
      p_movement_type: movementType,
      p_amount: amount,
      p_reason: reason,
    })
  );
}

export function closeCashSessionRpc(companyId: string, sessionId: string, countedAmount: number, notes: string) {
  return runAction(() =>
    supabase.rpc('close_cash_session', {
      p_company_id: companyId,
      p_session_id: sessionId,
      p_counted_amount: countedAmount,
      p_notes: notes || undefined,
    })
  );
}
