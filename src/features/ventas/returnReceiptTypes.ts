/** Una devolución parcial lista para mostrar o imprimir como comprobante. */
export interface ReturnReceiptData {
  returnNumber: string;
  createdAt: string;
  reason: string;
  refundAmount: number;
  items: { name: string; quantity: number; amount: number }[];
}
