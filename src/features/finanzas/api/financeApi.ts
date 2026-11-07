import { supabase } from '@/lib/supabase';
import { toUserMessage } from '@/lib/errorMessages';
import type { DateRange, FinancialSummary } from '../types';

const num = (value: unknown): number => Number(value ?? 0);

/** Resumen del período desde public.financial_summary (solo administradores). */
export async function fetchFinancialSummary(companyId: string, range: DateRange): Promise<FinancialSummary> {
  const { data, error } = await supabase.rpc('financial_summary', {
    p_company_id: companyId,
    p_from: range.from,
    p_to: range.to,
  });
  if (error) throw new Error(toUserMessage(error, 'No se pudo calcular el resumen financiero.'));

  const s = (data ?? {}) as Record<string, unknown>;
  const payments = (s.payments_by_method ?? {}) as Record<string, unknown>;
  return {
    salesTotal: num(s.sales_total),
    salesCount: num(s.sales_count),
    cancelledTotal: num(s.cancelled_total),
    cancelledCount: num(s.cancelled_count),
    cogsTotal: num(s.cogs_total),
    purchasesTotal: num(s.purchases_total),
    purchasesCount: num(s.purchases_count),
    paymentsByMethod: Object.fromEntries(Object.entries(payments).map(([method, total]) => [method, num(total)])),
    inventoryValue: num(s.inventory_value),
  };
}
