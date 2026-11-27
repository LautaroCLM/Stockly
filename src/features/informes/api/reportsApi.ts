import { supabase } from '@/lib/supabase';
import { toUserMessage } from '@/lib/errorMessages';
import type { ExpenseCategoryRow, InventoryRow, ProductSalesRow, SalesDayRow, VatBookRow } from '../types';

const num = (value: unknown): number => Number(value ?? 0);
const FAIL = 'No se pudo generar el informe.';

export interface Period {
  from: string;
  to: string;
}

export async function fetchSalesByDay(companyId: string, period: Period): Promise<SalesDayRow[]> {
  const { data, error } = await supabase.rpc('report_sales_by_day', { p_company_id: companyId, p_from: period.from, p_to: period.to });
  if (error) throw new Error(toUserMessage(error, FAIL));
  return (data ?? []).map((r) => ({
    date: r.sale_date,
    salesCount: num(r.sales_count),
    discountTotal: num(r.discount_total),
    total: num(r.total),
    creditTotal: num(r.credit_total),
  }));
}

export async function fetchProductSales(companyId: string, period: Period): Promise<ProductSalesRow[]> {
  const { data, error } = await supabase.rpc('report_top_products', {
    p_company_id: companyId, p_from: period.from, p_to: period.to, p_limit: 500,
  });
  if (error) throw new Error(toUserMessage(error, FAIL));
  return (data ?? []).map((r) => ({
    productId: r.product_id, sku: r.sku, name: r.product_name,
    quantity: num(r.quantity), revenue: num(r.revenue), cost: num(r.cost),
  }));
}

export async function fetchInventoryValuation(companyId: string): Promise<InventoryRow[]> {
  const { data, error } = await supabase.rpc('report_inventory_valuation', { p_company_id: companyId });
  if (error) throw new Error(toUserMessage(error, FAIL));
  return (data ?? []).map((r) => ({
    productId: r.product_id, sku: r.sku, name: r.product_name, stock: num(r.current_stock),
    costPrice: num(r.cost_price), sellingPrice: num(r.selling_price), stockValue: num(r.stock_value),
  }));
}

export async function fetchExpensesByCategory(companyId: string, period: Period): Promise<ExpenseCategoryRow[]> {
  const { data, error } = await supabase.rpc('report_expenses', { p_company_id: companyId, p_from: period.from, p_to: period.to });
  if (error) throw new Error(toUserMessage(error, FAIL));
  return (data ?? []).map((r) => ({ category: r.category, count: num(r.expenses_count), total: num(r.total) }));
}

export async function fetchVatSalesBook(companyId: string, period: Period): Promise<VatBookRow[]> {
  const { data, error } = await supabase.rpc('vat_sales_book', { p_company_id: companyId, p_from: period.from, p_to: period.to });
  if (error) throw new Error(toUserMessage(error, FAIL));
  return (data ?? []).map((r) => ({
    invoiceId: r.invoice_id,
    issueDate: r.issue_date,
    environment: r.environment === 'produccion' ? 'produccion' : 'homologacion',
    kind: r.kind === 'credit_note' ? 'credit_note' : 'invoice',
    letter: r.letter,
    invoiceType: r.invoice_type,
    pointOfSale: r.point_of_sale,
    number: r.number,
    cae: r.cae,
    receiverDocType: r.receiver_doc_type,
    receiverDocNumber: r.receiver_doc_number,
    receiverName: r.receiver_name,
    receiverVatCondition: r.receiver_vat_condition,
    netAmount: num(r.net_amount),
    vat21: num(r.vat_21),
    vat105: num(r.vat_10_5),
    vat27: num(r.vat_27),
    vatOther: num(r.vat_other),
    total: num(r.total_amount),
  }));
}
