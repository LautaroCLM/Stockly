import { useCallback } from 'react';
import { useToast } from '@/components/feedback/ToastProvider';
import { formatCurrency } from '@/lib/formatters';
import type { ExpenseActionResult, NewExpenseInput } from '../types';

const UNDO_REASON = 'Deshecho desde el aviso, justo después de registrarlo.';

/**
 * Envuelve el registro de un gasto: si sale bien, avisa y ofrece deshacerlo (el gasto queda anulado,
 * con su motivo, y si se pagó con la caja el dinero vuelve a entrar).
 */
export function useExpenseNotice(
  createExpense: (input: NewExpenseInput) => Promise<ExpenseActionResult>,
  voidExpense: (expenseId: string, reason: string) => Promise<ExpenseActionResult>
) {
  const { notify } = useToast();

  return useCallback(async (input: NewExpenseInput) => {
    const result = await createExpense(input);
    if (!result.ok) return result;
    const expenseId = result.expenseId;
    notify({
      message: 'Gasto registrado',
      detail: `${formatCurrency(input.amount)} · ${input.description}`,
      undo: expenseId
        ? {
            run: async () => {
              const undone = await voidExpense(expenseId, UNDO_REASON);
              return undone.ok ? { ok: true } : { ok: false, message: undone.message };
            },
          }
        : undefined,
    });
    return result;
  }, [createExpense, voidExpense, notify]);
}
