export type PeriodKey = 'today' | '7d' | '30d' | 'month' | 'prev-month';

/** Fechas AAAA-MM-DD, ambas incluidas. */
export interface DateRange {
  from: string;
  to: string;
}

/** Números del período (respuesta de public.financial_summary). */
export interface FinancialSummary {
  salesTotal: number;
  salesCount: number;
  cancelledTotal: number;
  cancelledCount: number;
  /** Costo de la mercadería vendida. */
  cogsTotal: number;
  purchasesTotal: number;
  purchasesCount: number;
  /** Cobrado por medio de pago (efectivo, transferencia, debito, credito, cheque). */
  paymentsByMethod: Record<string, number>;
  /** Valor actual del inventario al costo (no depende del período). */
  inventoryValue: number;
  expensesTotal: number;
  expensesCount: number;
  expensesByCategory: Record<string, number>;
  creditSalesTotal: number;
  collectionsTotal: number;
  receivableTotal: number;
  /** Compras del período que quedaron a pagar. */
  creditPurchasesTotal: number;
  /** Pagos a proveedores del período. */
  supplierPaymentsTotal: number;
  /** Deuda actual con todos los proveedores (no depende del período). */
  payablesTotal: number;
}
