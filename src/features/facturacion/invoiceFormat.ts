import type { InvoiceDetail, InvoiceSummary } from './invoiceTypes';

/** Ejemplo: punto de venta 3, número 16 → "00003-00000016". */
export function formatInvoiceNumber(pointOfSale: number, number: number | null): string {
  const pos = String(pointOfSale).padStart(5, '0');
  return number === null ? `${pos}-(sin número)` : `${pos}-${String(number).padStart(8, '0')}`;
}

export function invoiceLabel(inv: Pick<InvoiceSummary, 'letter' | 'pointOfSale' | 'number'> & { kind?: InvoiceSummary['kind'] }): string {
  const name = inv.kind === 'credit_note' ? 'Nota de crédito' : 'Factura';
  return inv.number === null ? `${name} ${inv.letter} (sin número todavía)` : `${name} ${inv.letter} ${formatInvoiceNumber(inv.pointOfSale, inv.number)}`;
}

const DOC_TYPE_LABELS: Record<number, string> = { 80: 'CUIT', 86: 'CUIL', 96: 'DNI' };

/** Documento del receptor para mostrar; '' si es consumidor final sin identificar. */
export function receiverDocLabel(docType: number, docNumber: string): string {
  const label = DOC_TYPE_LABELS[docType];
  return label && docNumber !== '0' ? `${label} ${docNumber}` : '';
}

/**
 * URL del QR obligatorio de ARCA (RG 4892): JSON en base64 con los datos del comprobante.
 * Devuelve null si la factura todavía no está autorizada.
 */
export function arcaQrUrl(inv: InvoiceDetail, issuerCuit: string): string | null {
  if (inv.status !== 'authorized' || inv.number === null || !inv.cae) return null;
  const payload = {
    ver: 1,
    fecha: inv.issueDate,
    cuit: Number(issuerCuit.replace(/\D/g, '')),
    ptoVta: inv.pointOfSale,
    tipoCmp: inv.invoiceType,
    nroCmp: inv.number,
    importe: inv.totalAmount,
    moneda: 'PES',
    ctz: 1,
    tipoDocRec: inv.receiverDocType,
    nroDocRec: Number(inv.receiverDocNumber),
    tipoCodAut: 'E',
    codAut: Number(inv.cae),
  };
  // JSON solo con ASCII: btoa alcanza
  return `https://www.afip.gob.ar/fe/qr/?p=${btoa(JSON.stringify(payload))}`;
}

/** Precio unitario a mostrar: en la Factura A va sin IVA (neto); en B y C, el precio final. */
export function displayUnitPrice(letter: InvoiceDetail['letter'], unitPrice: number, vatRate: number): number {
  return letter === 'A' ? Math.round((unitPrice / (1 + vatRate / 100)) * 100) / 100 : unitPrice;
}
