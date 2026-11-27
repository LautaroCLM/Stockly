/** Persona del equipo que puede figurar como vendedor (public.sale_sellers). */
export interface Seller {
  id: string;
  name: string;
  percent: number | null;
  /** Activo y con porcentaje: se puede elegir al cobrar. */
  canSell: boolean;
}

/** Vendedor elegido en el cobro (viaja con la venta y sale en el ticket). */
export interface SaleSellerArgs {
  employeeId: string;
  name: string;
}

export type CommissionKind = 'sale' | 'cancellation' | 'return';

/** Un movimiento de comisión del período (public.commission_report). */
export interface CommissionEntry {
  employeeId: string;
  employeeName: string;
  date: string;
  kind: CommissionKind;
  saleId: string;
  saleNumber: string;
  documentNumber: string;
  base: number;
  percent: number;
  commission: number;
  isPaid: boolean;
}

/** Resumen por vendedor del período. */
export interface SellerSummary {
  employeeId: string;
  employeeName: string;
  salesCount: number;
  salesTotal: number;
  deductions: number;
  commission: number;
  paid: number;
  pending: number;
  entries: CommissionEntry[];
}

export type CommissionActionResult = { ok: true } | { ok: false; message: string };
