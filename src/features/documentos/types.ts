export const DOC_TYPES = ['ticket', 'presupuesto', 'remito', 'garantia'] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  ticket: 'Ticket',
  presupuesto: 'Presupuesto',
  remito: 'Remito X',
  garantia: 'Garantía',
};

export const DOC_TYPE_NEW_TITLES: Record<DocType, string> = {
  ticket: 'Nuevo ticket',
  presupuesto: 'Nuevo presupuesto',
  remito: 'Nuevo remito X',
  garantia: 'Nueva garantía',
};

export const DOC_TYPE_HINTS: Record<DocType, string> = {
  ticket: 'Comprobante de 80 mm con ítems y total. No es una venta.',
  presupuesto: 'Propuesta de precios con validez, en hoja A4.',
  remito: 'Detalle de lo entregado, con firma, en hoja A4.',
  garantia: 'Certificado de garantía de un producto, en hoja A4.',
};

/** Ticket: rollo de 80 mm. El resto, hoja A4. */
export const isThermal = (type: DocType): boolean => type === 'ticket';

export type DocStatus = 'active' | 'voided';

export const TAX_CONDITIONS = ['responsable_inscripto', 'monotributo', 'exento', 'no_responsable'] as const;
export type TaxCondition = (typeof TAX_CONDITIONS)[number];

export const TAX_CONDITION_LABELS: Record<TaxCondition, string> = {
  responsable_inscripto: 'IVA Responsable Inscripto',
  monotributo: 'Responsable Monotributo',
  exento: 'IVA Exento',
  no_responsable: 'IVA No Responsable',
};

export interface DocumentItem {
  id: string;
  position: number;
  productId: string | null;
  description: string;
  serialNumber: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface DocumentRecord {
  id: string;
  type: DocType;
  pointOfSale: number;
  number: number;
  issueDate: string;
  validUntil: string | null;
  customerId: string | null;
  customerName: string;
  customerTaxId: string | null;
  customerAddress: string | null;
  customerPhone: string | null;
  showPrices: boolean;
  warrantyMonths: number | null;
  notes: string | null;
  subtotal: number;
  discount: number;
  total: number;
  status: DocStatus;
  voidReason: string | null;
  createdAt: string;
}

export interface DocumentSettings {
  address: string;
  phone: string;
  email: string;
  taxCondition: TaxCondition;
  pointOfSale: number;
  footerNote: string;
}

export const DEFAULT_SETTINGS: DocumentSettings = {
  address: '', phone: '', email: '', taxCondition: 'responsable_inscripto', pointOfSale: 1, footerNote: '',
};

/** Una línea del formulario: todo como texto, tal cual lo escribe el usuario. */
export interface ItemFormValues {
  key: string;
  productId: string;
  description: string;
  serialNumber: string;
  quantity: string;
  unitPrice: string;
}

export interface DocumentFormValues {
  type: DocType;
  customerId: string;
  customerName: string;
  customerTaxId: string;
  customerAddress: string;
  customerPhone: string;
  issueDate: string;
  validUntil: string;
  showPrices: boolean;
  warrantyMonths: string;
  notes: string;
  discount: string;
  items: ItemFormValues[];
}

export type DocumentPayload = {
  doc_type: DocType;
  customer_id: string;
  customer_name: string;
  customer_tax_id: string;
  customer_address: string;
  customer_phone: string;
  issue_date: string;
  valid_until: string;
  show_prices: boolean;
  warranty_months: string;
  notes: string;
  discount: string;
  items: Array<{ product_id: string; description: string; serial_number: string; quantity: string; unit_price: string }>;
};

export interface CreatedDocument {
  documentId: string;
  type: DocType;
  pointOfSale: number;
  number: number;
  total: number;
}

export type DocumentActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? Record<string, never> : { value: T }))
  | { ok: false; message: string; uncertain?: boolean };

export interface DocumentFilters {
  type: DocType | 'all';
  query: string;
  includeVoided: boolean;
}
