/** Nombres para mostrar de los medios de pago que guarda process_sale. */
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  debito: 'Tarjeta de débito',
  credito: 'Tarjeta de crédito',
  cheque: 'Cheque',
  cuenta_corriente: 'Cuenta corriente',
};

export function paymentMethodLabel(method: string): string {
  return PAYMENT_METHOD_LABELS[method] ?? method;
}
