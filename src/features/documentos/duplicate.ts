import { formatCurrencyInput } from './formatInput';
import { emptyForm } from './documentForm';
import type { DocumentFormValues, DocumentItem, DocumentRecord } from './types';

/** Valores de formulario para emitir un documento nuevo a partir de uno existente (con fecha de hoy). */
export function documentToForm(doc: DocumentRecord, items: DocumentItem[], today: string): DocumentFormValues {
  const base = emptyForm(doc.type, today);
  return {
    ...base,
    customerId: doc.customerId ?? '',
    customerName: doc.customerName === 'Consumidor final' && doc.type === 'ticket' ? '' : doc.customerName,
    customerTaxId: doc.customerTaxId ?? '',
    customerAddress: doc.customerAddress ?? '',
    customerPhone: doc.customerPhone ?? '',
    showPrices: doc.showPrices,
    warrantyMonths: doc.warrantyMonths ? String(doc.warrantyMonths) : base.warrantyMonths,
    notes: doc.notes ?? '',
    discount: doc.discount > 0 ? formatCurrencyInput(doc.discount) : '',
    items: items.map((item) => ({
      key: crypto.randomUUID(),
      productId: item.productId ?? '',
      description: item.description,
      serialNumber: item.serialNumber ?? '',
      quantity: String(item.quantity).replace('.', ','),
      unitPrice: doc.showPrices ? formatCurrencyInput(item.unitPrice) : '',
    })),
  };
}
