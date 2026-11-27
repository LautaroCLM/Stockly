export type InvoiceLetter = 'A' | 'B' | 'C';
export type InvoiceStatus = 'pending' | 'authorized' | 'rejected';

/** Lo que se muestra en el historial de ventas. */
export interface InvoiceSummary {
  id: string;
  saleId: string;
  letter: InvoiceLetter;
  pointOfSale: number;
  number: number | null;
  status: InvoiceStatus;
  arcaMessage: string | null;
  createdAt: string;
}

export interface InvoiceItem {
  position: number;
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  lineTotal: number;
}

export interface InvoiceVatLine {
  vatRate: number;
  baseAmount: number;
  vatAmount: number;
}

/** Factura completa, para confirmar e imprimir. */
export interface InvoiceDetail extends InvoiceSummary {
  environment: 'homologacion' | 'produccion';
  invoiceType: number;
  issueDate: string;
  receiverDocType: number;
  receiverDocNumber: string;
  receiverName: string;
  receiverVatCondition: string;
  receiverAddress: string | null;
  subtotal: number;
  discount: number;
  netAmount: number;
  vatAmount: number;
  totalAmount: number;
  cae: string | null;
  caeExpiresAt: string | null;
  items: InvoiceItem[];
  vatLines: InvoiceVatLine[];
}

export type InvoiceActionResult = { ok: true } | { ok: false; message: string };
export type InvoiceValueResult<T> = { ok: true; value: T } | { ok: false; message: string };
