import { supabase } from '@/lib/supabase';
import { isNetworkOrUncertainError, toUserMessage } from '@/lib/errorMessages';
import { DEFAULT_SETTINGS, DOC_TYPES, TAX_CONDITIONS } from '../types';
import type {
  CreatedDocument, DocType, DocumentActionResult, DocumentFilters, DocumentItem, DocumentPayload, DocumentRecord,
  DocumentSettings, TaxCondition,
} from '../types';

const MAX_LIST = 200;
const UNCERTAIN_MESSAGE =
  'No pudimos confirmar si se emitió por un problema de conexión. Revisá la lista antes de reintentar para no duplicarlo.';

const cleanMessage = (message: string) => message.replace(/^(P0001|error):\s*/i, '').trim();
const num = (value: unknown): number => Number(value ?? 0);
const asType = (v: string): DocType => ((DOC_TYPES as readonly string[]).includes(v) ? (v as DocType) : 'ticket');
const asCondition = (v: string): TaxCondition =>
  (TAX_CONDITIONS as readonly string[]).includes(v) ? (v as TaxCondition) : 'responsable_inscripto';
/** Escapa los comodines de LIKE para que lo escrito se busque tal cual. */
const likeEscape = (text: string) => text.replace(/[\\%_,()]/g, (c) => `\\${c}`);

// Una sola cadena literal: así TypeScript deduce las columnas
const DOCUMENT_COLUMNS = 'id, doc_type, point_of_sale, doc_number, issue_date, valid_until, customer_id, customer_name, customer_tax_id, customer_address, customer_phone, show_prices, warranty_months, notes, subtotal, discount, total, status, void_reason, created_at' as const;

type DocumentRow = {
  id: string; doc_type: string; point_of_sale: number; doc_number: number; issue_date: string; valid_until: string | null;
  customer_id: string | null; customer_name: string; customer_tax_id: string | null; customer_address: string | null;
  customer_phone: string | null; show_prices: boolean; warranty_months: number | null; notes: string | null;
  subtotal: unknown; discount: unknown; total: unknown; status: string; void_reason: string | null; created_at: string;
};

const mapDocument = (d: DocumentRow): DocumentRecord => ({
  id: d.id, type: asType(d.doc_type), pointOfSale: d.point_of_sale, number: d.doc_number, issueDate: d.issue_date,
  validUntil: d.valid_until, customerId: d.customer_id, customerName: d.customer_name, customerTaxId: d.customer_tax_id,
  customerAddress: d.customer_address, customerPhone: d.customer_phone, showPrices: d.show_prices,
  warrantyMonths: d.warranty_months, notes: d.notes, subtotal: num(d.subtotal), discount: num(d.discount),
  total: num(d.total), status: d.status === 'voided' ? 'voided' : 'active', voidReason: d.void_reason, createdAt: d.created_at,
});

export async function fetchDocuments(companyId: string, filters: DocumentFilters): Promise<DocumentRecord[]> {
  let query = supabase.from('documents').select(DOCUMENT_COLUMNS).eq('company_id', companyId);
  if (filters.type !== 'all') query = query.eq('doc_type', filters.type);
  if (!filters.includeVoided) query = query.eq('status', 'active');
  const text = filters.query.trim();
  if (text !== '') query = query.ilike('customer_name', `%${likeEscape(text)}%`);
  const { data, error } = await query
    .order('issue_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(MAX_LIST);
  if (error) throw new Error('No se pudieron cargar los documentos.');
  return (data ?? []).map(mapDocument);
}

export async function fetchDocumentById(companyId: string, documentId: string): Promise<DocumentRecord> {
  const { data, error } = await supabase
    .from('documents').select(DOCUMENT_COLUMNS).eq('company_id', companyId).eq('id', documentId).maybeSingle();
  if (error || !data) throw new Error('No se pudo cargar el documento.');
  return mapDocument(data);
}

export async function fetchDocumentItems(companyId: string, documentId: string): Promise<DocumentItem[]> {
  const { data, error } = await supabase
    .from('document_items')
    .select('id, position, product_id, description, serial_number, quantity, unit_price, line_total')
    .eq('company_id', companyId)
    .eq('document_id', documentId)
    .order('position');
  if (error) throw new Error('No se pudieron cargar los ítems del documento.');
  return (data ?? []).map((i) => ({
    id: i.id, position: i.position, productId: i.product_id, description: i.description, serialNumber: i.serial_number,
    quantity: num(i.quantity), unitPrice: num(i.unit_price), lineTotal: num(i.line_total),
  }));
}

export async function fetchDocumentSettings(companyId: string): Promise<DocumentSettings> {
  const { data, error } = await supabase
    .from('document_settings')
    .select('address, phone, email, tax_condition, point_of_sale, footer_note')
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) throw new Error('No se pudieron cargar los datos del emisor.');
  if (!data) return DEFAULT_SETTINGS;
  return {
    address: data.address ?? '', phone: data.phone ?? '', email: data.email ?? '', taxCondition: asCondition(data.tax_condition),
    pointOfSale: data.point_of_sale, footerNote: data.footer_note ?? '',
  };
}

export async function createDocumentRpc(
  companyId: string, payload: DocumentPayload, idempotencyKey: string
): Promise<DocumentActionResult<CreatedDocument>> {
  try {
    const { data, error } = await supabase.rpc('create_document', {
      p_company_id: companyId, p_idempotency_key: idempotencyKey, p_data: payload,
    });
    if (error) {
      if (isNetworkOrUncertainError(error.message)) return { ok: false, message: UNCERTAIN_MESSAGE, uncertain: true };
      return { ok: false, message: cleanMessage(error.message) };
    }
    const r = (data ?? {}) as Record<string, unknown>;
    return {
      ok: true,
      value: {
        documentId: String(r.document_id), type: asType(String(r.doc_type)), pointOfSale: num(r.point_of_sale),
        number: num(r.doc_number), total: num(r.total),
      },
    };
  } catch (err) {
    if (isNetworkOrUncertainError(err instanceof Error ? err.message : '')) return { ok: false, message: UNCERTAIN_MESSAGE, uncertain: true };
    return { ok: false, message: 'No se pudo emitir el documento. Intentá de nuevo.' };
  }
}

export async function voidDocumentRpc(companyId: string, documentId: string, reason: string): Promise<DocumentActionResult> {
  const { error } = await supabase.rpc('void_document', { p_company_id: companyId, p_document_id: documentId, p_reason: reason.trim() });
  if (error) return { ok: false, message: toUserMessage(error, 'No se pudo anular el documento.') };
  return { ok: true } as DocumentActionResult;
}

export async function saveDocumentSettingsRpc(companyId: string, s: DocumentSettings): Promise<DocumentActionResult> {
  const { error } = await supabase.rpc('save_document_settings', {
    p_company_id: companyId, p_address: s.address.trim(), p_phone: s.phone.trim(), p_email: s.email.trim(),
    p_tax_condition: s.taxCondition, p_point_of_sale: s.pointOfSale, p_footer_note: s.footerNote.trim(),
  });
  if (error) return { ok: false, message: toUserMessage(error, 'No se pudieron guardar los datos del emisor.') };
  return { ok: true } as DocumentActionResult;
}
