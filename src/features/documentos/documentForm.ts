import { parseHundredths } from '@/lib/decimal';
import { computeTotals, lineCents, priceMode } from './documentMath';
import type { DocType, DocumentFormValues, DocumentPayload, ItemFormValues } from './types';

const MAX_ITEMS = 200;

export function newItem(): ItemFormValues {
  return { key: crypto.randomUUID(), productId: '', description: '', serialNumber: '', quantity: '1', unitPrice: '' };
}

export function emptyForm(type: DocType, today: string): DocumentFormValues {
  return {
    type, customerId: '', customerName: '', customerTaxId: '', customerAddress: '', customerPhone: '',
    issueDate: today, validUntil: '', showPrices: priceMode(type) !== 'never', warrantyMonths: type === 'garantia' ? '12' : '',
    notes: '', discount: '', items: [newItem()],
  };
}

/** Primer problema del formulario, en lenguaje claro, o null si se puede emitir. */
export function validateDocument(values: DocumentFormValues): string | null {
  const { type } = values;
  if (type !== 'ticket' && values.customerName.trim() === '' && values.customerId === '') {
    return 'Indicá el cliente: elegilo de la lista o escribí su nombre.';
  }
  if (values.issueDate === '') return 'Indicá la fecha del documento.';
  if (type === 'presupuesto' && values.validUntil !== '' && values.validUntil < values.issueDate) {
    return 'La validez no puede ser anterior a la fecha del presupuesto.';
  }
  if (type === 'garantia') {
    const months = Number(values.warrantyMonths);
    if (!Number.isInteger(months) || months < 1 || months > 120) return 'El plazo de la garantía debe ser de 1 a 120 meses.';
  }
  if (values.items.length === 0) return 'Agregá al menos un ítem.';
  if (values.items.length > MAX_ITEMS) return `Un documento admite hasta ${MAX_ITEMS} ítems.`;

  for (const [index, item] of values.items.entries()) {
    const label = `Ítem ${index + 1}`;
    if (item.description.trim() === '' && item.productId === '') return `${label}: escribí qué es o elegí un producto.`;
    if (lineCents(item) === null) return `${label}: revisá la cantidad y el precio (hasta 2 decimales).`;
    if (values.showPrices && priceMode(type) === 'always' && (item.unitPrice.trim() === '' || parseHundredths(item.unitPrice) === 0)) {
      return `${label}: indicá el precio.`;
    }
  }

  const totals = computeTotals(values.items, values.discount, values.showPrices);
  if (values.discount.trim() !== '' && parseHundredths(values.discount) === null) return 'El descuento no es un importe válido.';
  if (totals.discountCents > totals.subtotalCents) return 'El descuento no puede superar el subtotal.';
  return null;
}

/** Datos tal como los espera la base. Los importes viajan con punto decimal. */
export function buildPayload(values: DocumentFormValues): DocumentPayload {
  const dot = (text: string) => text.trim().replace(',', '.');
  return {
    doc_type: values.type,
    customer_id: values.customerId,
    customer_name: values.customerName.trim(),
    customer_tax_id: values.customerTaxId.trim(),
    customer_address: values.customerAddress.trim(),
    customer_phone: values.customerPhone.trim(),
    issue_date: values.issueDate,
    valid_until: values.type === 'presupuesto' ? values.validUntil : '',
    show_prices: values.showPrices,
    warranty_months: values.type === 'garantia' ? values.warrantyMonths.trim() : '',
    notes: values.notes.trim(),
    discount: values.showPrices ? dot(values.discount) : '',
    items: values.items.map((item) => ({
      product_id: item.productId,
      description: item.description.trim(),
      serial_number: item.serialNumber.trim(),
      quantity: dot(item.quantity),
      unit_price: values.showPrices ? dot(item.unitPrice) : '',
    })),
  };
}
