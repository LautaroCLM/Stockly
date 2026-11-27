import { supabase } from '@/lib/supabase';
import { toUserMessage } from '@/lib/errorMessages';
import { invokeArca } from './arcaConnectionApi';
import type {
  InvoiceActionResult, InvoiceDetail, InvoiceLetter, InvoiceStatus, InvoiceSummary, InvoiceValueResult, SaleInvoicesState,
} from '../invoiceTypes';

const SUMMARY_COLUMNS = 'id, sale_id, kind, sale_return_id, letter, point_of_sale, number, status, arca_message, created_at' as const;
const DETAIL_COLUMNS =
  'id, sale_id, kind, sale_return_id, associated_invoice_id, letter, point_of_sale, number, status, arca_message, created_at, environment, invoice_type, issue_date, receiver_doc_type, receiver_doc_number, receiver_name, receiver_vat_condition, receiver_address, subtotal, discount, net_amount, vat_amount, total_amount, cae, cae_expires_at' as const;

type SummaryRow = {
  id: string; sale_id: string; kind: string; sale_return_id: string | null; letter: string; point_of_sale: number; number: number | null; status: string;
  arca_message: string | null; created_at: string;
};

const asLetter = (v: string): InvoiceLetter => (v === 'A' || v === 'C' ? v : 'B');
const asStatus = (v: string): InvoiceStatus => (v === 'authorized' || v === 'rejected' ? v : 'pending');
const num = (v: unknown) => Number(v ?? 0);

const toSummary = (r: SummaryRow): InvoiceSummary => ({
  id: r.id, saleId: r.sale_id, kind: r.kind === 'credit_note' ? 'credit_note' : 'invoice', saleReturnId: r.sale_return_id, letter: asLetter(r.letter), pointOfSale: r.point_of_sale, number: r.number,
  status: asStatus(r.status), arcaMessage: r.arca_message, createdAt: r.created_at,
});

/** Por venta: su factura (la viva, o la última rechazada), sus notas de crédito y las que faltan. */
export async function fetchSaleInvoices(companyId: string, saleIds: string[]): Promise<Map<string, SaleInvoicesState>> {
  const result = new Map<string, SaleInvoicesState>();
  if (saleIds.length === 0) return result;
  const [rows, needs] = await Promise.all([
    supabase.from('invoices').select(SUMMARY_COLUMNS).eq('company_id', companyId).in('sale_id', saleIds)
      .order('created_at', { ascending: true }),
    supabase.rpc('pending_credit_notes', { p_company_id: companyId, p_sale_ids: saleIds }),
  ]);
  if (rows.error || needs.error) throw new Error('No se pudieron cargar las facturas.');
  const stateOf = (saleId: string) => {
    const current = result.get(saleId) ?? { invoice: undefined, creditNotes: [], needs: [] };
    result.set(saleId, current);
    return current;
  };
  for (const row of rows.data ?? []) {
    const doc = toSummary(row);
    const state = stateOf(doc.saleId);
    if (doc.kind === 'credit_note') {
      if (doc.status !== 'rejected') state.creditNotes.push(doc);
    } else if (!state.invoice || state.invoice.status === 'rejected' || doc.status !== 'rejected') {
      // Una factura viva (pendiente o autorizada) siempre gana sobre una rechazada
      state.invoice = doc;
    }
  }
  for (const need of needs.data ?? []) {
    stateOf(need.sale_id).needs.push({
      saleId: need.sale_id, saleReturnId: need.sale_return_id, returnNumber: need.return_number, amount: num(need.amount),
    });
  }
  return result;
}

export async function fetchInvoiceDetail(companyId: string, invoiceId: string): Promise<InvoiceDetail> {
  const [header, items, vat] = await Promise.all([
    supabase.from('invoices').select(DETAIL_COLUMNS).eq('company_id', companyId).eq('id', invoiceId).maybeSingle(),
    supabase.from('invoice_items').select('position, description, quantity, unit_price, vat_rate, line_total')
      .eq('company_id', companyId).eq('invoice_id', invoiceId).order('position'),
    supabase.from('invoice_vat_lines').select('vat_rate, base_amount, vat_amount')
      .eq('company_id', companyId).eq('invoice_id', invoiceId).order('vat_rate'),
  ]);
  const h = header.data;
  if (header.error || items.error || vat.error || !h) throw new Error('No se pudo cargar la factura.');
  const assoc = h.associated_invoice_id
    ? (await supabase.from('invoices').select('letter, point_of_sale, number').eq('company_id', companyId)
        .eq('id', h.associated_invoice_id).maybeSingle()).data
    : null;
  return {
    associated: assoc ? { letter: asLetter(assoc.letter), pointOfSale: assoc.point_of_sale, number: assoc.number } : null,
    ...toSummary(h),
    environment: h.environment === 'produccion' ? 'produccion' : 'homologacion',
    invoiceType: h.invoice_type, issueDate: h.issue_date, receiverDocType: h.receiver_doc_type,
    receiverDocNumber: h.receiver_doc_number, receiverName: h.receiver_name, receiverVatCondition: h.receiver_vat_condition,
    receiverAddress: h.receiver_address, subtotal: num(h.subtotal), discount: num(h.discount), netAmount: num(h.net_amount),
    vatAmount: num(h.vat_amount), totalAmount: num(h.total_amount), cae: h.cae, caeExpiresAt: h.cae_expires_at,
    items: (items.data ?? []).map((i) => ({
      position: i.position, description: i.description, quantity: num(i.quantity), unitPrice: num(i.unit_price),
      vatRate: num(i.vat_rate), lineTotal: num(i.line_total),
    })),
    vatLines: (vat.data ?? []).map((v) => ({ vatRate: num(v.vat_rate), baseAmount: num(v.base_amount), vatAmount: num(v.vat_amount) })),
  };
}

/** Arma la factura de la venta (o devuelve la pendiente si ya existía). */
export async function prepareInvoiceRpc(companyId: string, saleId: string): Promise<InvoiceValueResult<string>> {
  const { data, error } = await supabase.rpc('prepare_invoice', { p_company_id: companyId, p_sale_id: saleId });
  if (error || typeof data !== 'string') return { ok: false, message: toUserMessage(error, 'No se pudo preparar la factura.') };
  return { ok: true, value: data };
}

/** Arma la nota de crédito de una devolución, o de la anulación si saleReturnId es null. */
export async function prepareCreditNoteRpc(
  companyId: string, saleId: string, saleReturnId: string | null
): Promise<InvoiceValueResult<string>> {
  const { data, error } = await supabase.rpc('prepare_credit_note', {
    p_company_id: companyId, p_sale_id: saleId, p_sale_return_id: saleReturnId as string,
  });
  if (error || typeof data !== 'string') return { ok: false, message: toUserMessage(error, 'No se pudo preparar la nota de crédito.') };
  return { ok: true, value: data };
}

/** Pide el CAE a ARCA (Edge Function). */
export async function authorizeInvoice(companyId: string, invoiceId: string): Promise<InvoiceActionResult> {
  const result = await invokeArca('authorize_invoice', companyId, { invoiceId });
  return result.ok ? { ok: true } : { ok: false, message: result.message };
}
