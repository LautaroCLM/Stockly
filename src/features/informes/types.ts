import type { ReactNode } from 'react';

export type ReportKey = 'ventas' | 'productos' | 'inventario' | 'gastos' | 'iva_ventas';

export const REPORT_LABELS: Record<ReportKey, string> = {
  ventas: 'Ventas por día',
  productos: 'Productos vendidos',
  inventario: 'Inventario valuado',
  gastos: 'Gastos por categoría',
  iva_ventas: 'Libro IVA Ventas',
};

/** Un comprobante autorizado por ARCA en el Libro IVA Ventas (notas de crédito en negativo). */
export interface VatBookRow {
  invoiceId: string;
  issueDate: string;
  environment: 'homologacion' | 'produccion';
  kind: 'invoice' | 'credit_note';
  letter: string;
  invoiceType: number;
  pointOfSale: number;
  number: number;
  cae: string;
  receiverDocType: number;
  receiverDocNumber: string;
  receiverName: string;
  receiverVatCondition: string;
  netAmount: number;
  vat21: number;
  vat105: number;
  vat27: number;
  vatOther: number;
  total: number;
}

export interface SalesDayRow {
  date: string;
  salesCount: number;
  discountTotal: number;
  total: number;
  creditTotal: number;
}

export interface ProductSalesRow {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  revenue: number;
  cost: number;
}

export interface InventoryRow {
  productId: string;
  sku: string;
  name: string;
  stock: number;
  costPrice: number;
  sellingPrice: number;
  stockValue: number;
}

export interface ExpenseCategoryRow {
  category: string;
  count: number;
  total: number;
}

/** Columna de un informe: cómo se muestra en pantalla y cómo se exporta a CSV. */
export interface ReportColumn<T> {
  key: string;
  header: string;
  align?: 'left' | 'right';
  render: (row: T) => ReactNode;
  csv: (row: T) => string;
}
