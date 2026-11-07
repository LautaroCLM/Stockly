import { supabase } from '@/lib/supabase';
import { isNetworkOrUncertainError } from '@/lib/errorMessages';
import { EXPENSE_CATEGORIES, EXPENSE_PAYMENT_METHODS } from '../types';
import type {
  Expense, ExpenseActionResult, ExpenseCategory, ExpenseFilters, ExpensePaymentMethod, NewExpenseInput,
} from '../types';

export const EXPENSES_PAGE_SIZE = 25;

const COLUMNS =
  'id, expense_date, category, description, amount, payment_method, supplier_id, machine_id, cash_movement_id, status, void_reason, created_by, created_at';

const UNCERTAIN_MESSAGE =
  'No pudimos confirmar la operación por un problema de conexión. Revisá la lista de gastos antes de reintentar para no duplicarlo.';

const cleanMessage = (message: string) => message.replace(/^(P0001|error):\s*/i, '').trim();

const asCategory = (value: string): ExpenseCategory =>
  (EXPENSE_CATEGORIES as readonly string[]).includes(value) ? (value as ExpenseCategory) : 'otros';
const asMethod = (value: string): ExpensePaymentMethod =>
  (EXPENSE_PAYMENT_METHODS as readonly string[]).includes(value) ? (value as ExpensePaymentMethod) : 'otro';

async function fetchPeopleNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const { data } = await supabase.from('profiles_public').select('id, full_name').in('id', unique);
  return new Map((data ?? []).filter((p) => p.id).map((p) => [p.id as string, p.full_name || 'Usuario']));
}

async function fetchSupplierNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const { data } = await supabase.from('suppliers').select('id, name').in('id', unique);
  return new Map((data ?? []).map((s) => [s.id, s.name]));
}

async function fetchMachineNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const { data } = await supabase.from('machines').select('id, name').in('id', unique);
  return new Map((data ?? []).map((m) => [m.id, m.name]));
}

/** Gastos de la empresa, del más reciente al más antiguo. */
export async function fetchExpenses(
  companyId: string,
  filters: ExpenseFilters,
  offset: number,
  limit: number = EXPENSES_PAGE_SIZE
): Promise<{ rows: Expense[]; total: number }> {
  let query = supabase.from('expenses').select(COLUMNS, { count: 'exact' }).eq('company_id', companyId);
  if (!filters.showVoided) query = query.eq('status', 'active');
  if (filters.category !== 'all') query = query.eq('category', filters.category);
  if (filters.machineId !== 'all') query = query.eq('machine_id', filters.machineId);
  const { data, error, count } = await query
    .order('expense_date', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw new Error('No se pudieron cargar los gastos.');

  const rows = data ?? [];
  const [people, suppliers, machines] = await Promise.all([
    fetchPeopleNames(rows.map((r) => r.created_by)),
    fetchSupplierNames(rows.map((r) => r.supplier_id).filter((id): id is string => Boolean(id))),
    fetchMachineNames(rows.map((r) => r.machine_id).filter((id): id is string => Boolean(id))),
  ]);
  return {
    total: count ?? 0,
    rows: rows.map((r) => ({
      id: r.id,
      expenseDate: r.expense_date,
      category: asCategory(r.category),
      description: r.description,
      amount: Number(r.amount),
      paymentMethod: asMethod(r.payment_method),
      supplierId: r.supplier_id,
      supplierName: r.supplier_id ? suppliers.get(r.supplier_id) ?? null : null,
      machineId: r.machine_id,
      machineName: r.machine_id ? machines.get(r.machine_id) ?? null : null,
      paidFromCash: r.cash_movement_id !== null,
      isVoided: r.status === 'voided',
      voidReason: r.void_reason,
      createdByName: people.get(r.created_by) ?? 'Usuario',
      createdAt: r.created_at,
    })),
  };
}

async function runAction(call: () => PromiseLike<{ error: { message: string } | null }>): Promise<ExpenseActionResult> {
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

export const createExpenseRpc = (companyId: string, input: NewExpenseInput) =>
  runAction(() =>
    supabase.rpc('create_expense', {
      p_company_id: companyId,
      p_expense_date: input.expenseDate,
      p_category: input.category,
      p_description: input.description,
      p_amount: input.amount,
      p_payment_method: input.paymentMethod,
      p_supplier_id: input.supplierId as string,
      p_pay_from_cash: input.payFromCash,
      p_machine_id: input.machineId as string,
    })
  );

export const voidExpenseRpc = (companyId: string, expenseId: string, reason: string) =>
  runAction(() => supabase.rpc('void_expense', { p_company_id: companyId, p_expense_id: expenseId, p_reason: reason }));
