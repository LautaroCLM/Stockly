import { supabase } from '@/lib/supabase';
import { toUserMessage } from '@/lib/errorMessages';
import type { CommissionActionResult, CommissionEntry, CommissionKind, Seller } from '../types';

export async function fetchSellers(companyId: string): Promise<Seller[]> {
  const { data, error } = await supabase.rpc('sale_sellers', { p_company_id: companyId });
  if (error) throw new Error(toUserMessage(error, 'No se pudieron cargar los vendedores.'));
  return (data ?? []).map((r) => ({
    id: r.employee_id,
    name: r.full_name,
    percent: r.commission_percent === null ? null : Number(r.commission_percent),
    canSell: r.can_sell,
  }));
}

const KINDS: readonly CommissionKind[] = ['sale', 'cancellation', 'return'];
const toKind = (k: string): CommissionKind => (KINDS.includes(k as CommissionKind) ? (k as CommissionKind) : 'sale');

export async function fetchCommissionReport(companyId: string, from: string, to: string): Promise<CommissionEntry[]> {
  const { data, error } = await supabase.rpc('commission_report', { p_company_id: companyId, p_from: from, p_to: to });
  if (error) throw new Error(toUserMessage(error, 'No se pudo cargar el informe de comisiones.'));
  return (data ?? []).map((r) => ({
    employeeId: r.employee_id,
    employeeName: r.employee_name,
    date: r.entry_date,
    kind: toKind(r.kind),
    saleId: r.sale_id,
    saleNumber: r.sale_number,
    documentNumber: r.document_number,
    base: Number(r.base_amount),
    percent: Number(r.commission_percent),
    commission: Number(r.commission),
    isPaid: r.is_paid,
  }));
}

async function run(call: PromiseLike<{ error: unknown }>, fallback: string): Promise<CommissionActionResult> {
  const { error } = await call;
  return error ? { ok: false, message: toUserMessage(error, fallback) } : { ok: true };
}

export function payCommissionRpc(
  companyId: string, employeeId: string, from: string, to: string, paymentMethod: string, payFromCash: boolean
) {
  return run(
    supabase.rpc('pay_commission', {
      p_company_id: companyId, p_employee_id: employeeId, p_from: from, p_to: to,
      p_payment_method: paymentMethod, p_pay_from_cash: payFromCash,
    }),
    'No se pudo registrar el pago de la comisión.'
  );
}

export function setEmployeeCommissionRpc(companyId: string, employeeId: string, percent: number | null) {
  return run(
    supabase.rpc('set_employee_commission', { p_company_id: companyId, p_employee_id: employeeId, p_percent: percent as number }),
    'No se pudo guardar la comisión.'
  );
}

export function setSaleSellerRpc(companyId: string, saleId: string, employeeId: string | null) {
  return run(
    supabase.rpc('set_sale_seller', { p_company_id: companyId, p_sale_id: saleId, p_employee_id: employeeId as string }),
    'No se pudo cambiar el vendedor.'
  );
}
