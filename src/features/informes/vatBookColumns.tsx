import { formatCurrency, formatDateShort } from '@/lib/formatters';
import { fromHundredths, toHundredths } from '@/lib/decimal';
import { formatInvoiceNumber, receiverDocLabel } from '@/features/facturacion/invoiceFormat';
import { CUSTOMER_VAT_CONDITION_LABELS, toCustomerVatCondition } from '@/features/facturacion/vat';
import type { ExportTable } from '@/features/inventario/excel/exportRows';
import { csvNumber } from './csv';
import type { ReportColumn, VatBookRow } from './types';

/** Ejemplo: "FC B" (factura) o "NC B" (nota de crédito). */
export const voucherLabel = (r: VatBookRow) => `${r.kind === 'credit_note' ? 'NC' : 'FC'} ${r.letter}`;
const condition = (r: VatBookRow) => CUSTOMER_VAT_CONDITION_LABELS[toCustomerVatCondition(r.receiverVatCondition)];
const doc = (r: VatBookRow) => receiverDocLabel(r.receiverDocType, r.receiverDocNumber) || 'Sin identificar';
const money = (n: number) => formatCurrency(n);

const AMOUNTS: { key: string; header: string; pick: (r: VatBookRow) => number }[] = [
  { key: 'net', header: 'Neto gravado', pick: (r) => r.netAmount },
  { key: 'vat21', header: 'IVA 21 %', pick: (r) => r.vat21 },
  { key: 'vat105', header: 'IVA 10,5 %', pick: (r) => r.vat105 },
  { key: 'vat27', header: 'IVA 27 %', pick: (r) => r.vat27 },
  { key: 'vatOther', header: 'IVA otras', pick: (r) => r.vatOther },
  { key: 'total', header: 'Total', pick: (r) => r.total },
];

export const VAT_BOOK_COLUMNS: ReportColumn<VatBookRow>[] = [
  { key: 'date', header: 'Fecha', render: (r) => formatDateShort(r.issueDate), csv: (r) => r.issueDate },
  { key: 'voucher', header: 'Comprobante', render: voucherLabel, csv: voucherLabel },
  { key: 'number', header: 'Número', render: (r) => formatInvoiceNumber(r.pointOfSale, r.number), csv: (r) => formatInvoiceNumber(r.pointOfSale, r.number) },
  { key: 'receiver', header: 'Cliente', render: (r) => r.receiverName, csv: (r) => r.receiverName },
  { key: 'doc', header: 'Documento', render: doc, csv: doc },
  { key: 'condition', header: 'Condición IVA', render: condition, csv: condition },
  ...AMOUNTS.map(({ key, header, pick }) => ({
    key, header, align: 'right' as const, render: (r: VatBookRow) => money(pick(r)), csv: (r: VatBookRow) => csvNumber(pick(r)),
  })),
];

/** Totales del período (exactos en centavos). */
export const vatBookTotals = (rows: VatBookRow[]): Record<string, string> =>
  Object.fromEntries(AMOUNTS.map(({ key, pick }) => [key, money(fromHundredths(rows.reduce((s, r) => s + toHundredths(pick(r)), 0)))]));

/** Tabla para Excel: los importes van como números (el contador los puede sumar) y con el CAE. */
export function vatBookTable(rows: VatBookRow[]): ExportTable {
  return {
    headers: ['Fecha', 'Comprobante', 'Código ARCA', 'Punto de venta', 'Número', 'CAE', 'Cliente', 'Documento', 'Condición IVA',
      ...AMOUNTS.map((a) => a.header)],
    rows: rows.map((r) => [
      formatDateShort(r.issueDate), voucherLabel(r), r.invoiceType, r.pointOfSale, r.number, r.cae, r.receiverName, doc(r), condition(r),
      ...AMOUNTS.map((a) => a.pick(r)),
    ]),
  };
}
