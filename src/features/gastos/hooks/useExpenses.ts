import { useCallback, useState } from 'react';
import type { DataTable } from '@/features/realtime/changeBus';
import { usePagedQuery } from '@/hooks/usePagedQuery';
import { EXPENSES_PAGE_SIZE, createExpenseRpc, fetchExpenses, voidExpenseRpc } from '../api/expensesApi';
import type { Expense, ExpenseActionResult, ExpenseFilters, NewExpenseInput } from '../types';

const REALTIME_TABLES: readonly DataTable[] = ['expenses'];
const INITIAL_FILTERS: ExpenseFilters = { category: 'all', showVoided: false };

/** Lista de gastos con filtros, en vivo, y las operaciones de registrar y anular. */
export function useExpenses(companyId: string, enabled: boolean) {
  const [filters, setFilters] = useState<ExpenseFilters>(INITIAL_FILTERS);

  const fetchPage = useCallback(
    (offset: number, limit: number) => fetchExpenses(companyId, filters, offset, limit),
    [companyId, filters]
  );

  const query = usePagedQuery<Expense>({
    queryKey: `${companyId}|${filters.category}|${filters.showVoided}`,
    enabled: enabled && Boolean(companyId),
    pageSize: EXPENSES_PAGE_SIZE,
    fetchPage,
    realtimeTables: REALTIME_TABLES,
    errorFallback: 'No se pudieron cargar los gastos.',
  });
  const { refresh } = query;

  const afterAction = useCallback(
    async (result: ExpenseActionResult) => {
      // También tras un resultado incierto: puede haberse guardado igual
      if (result.ok || result.uncertain) await refresh();
      return result;
    },
    [refresh]
  );

  const createExpense = useCallback(
    async (input: NewExpenseInput) => afterAction(await createExpenseRpc(companyId, input)),
    [companyId, afterAction]
  );
  const voidExpense = useCallback(
    async (expenseId: string, reason: string) => afterAction(await voidExpenseRpc(companyId, expenseId, reason)),
    [companyId, afterAction]
  );

  return {
    expenses: query.rows,
    total: query.total,
    hasMore: query.hasMore,
    isLoading: query.isLoading,
    isLoadingMore: query.isLoadingMore,
    error: query.error,
    reload: refresh,
    loadMore: query.loadMore,
    filters,
    setFilters,
    createExpense,
    voidExpense,
  };
}
