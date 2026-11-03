import { supabase } from '@/lib/supabase';
import type { DailySales } from '../dashboardMetrics';

/** Días que se piden: cubren 30 días del gráfico más los 30 previos para comparar. */
export const DASHBOARD_DAYS = 62;

/**
 * Totales diarios de ventas completadas en la zona horaria de la empresa
 * (public.dashboard_daily_sales). El costo llega en 0 para quien no es master_admin.
 */
export async function fetchDailySales(companyId: string, days: number = DASHBOARD_DAYS): Promise<DailySales[]> {
  const { data, error } = await supabase.rpc('dashboard_daily_sales', {
    p_company_id: companyId,
    p_days: days,
  });

  if (error) {
    throw new Error(error.message || 'Error al consultar las métricas de ventas.');
  }

  return (data ?? []).map((row) => ({
    day: row.day,
    salesTotal: Number(row.sales_total),
    salesCount: Number(row.sales_count),
    costTotal: Number(row.cost_total),
  }));
}
