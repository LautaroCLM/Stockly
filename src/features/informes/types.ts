import type { ReactNode } from 'react';

export type ReportKey = 'ventas' | 'productos' | 'inventario' | 'gastos';

export const REPORT_LABELS: Record<ReportKey, string> = {
  ventas: 'Ventas por día',
  productos: 'Productos vendidos',
  inventario: 'Inventario valuado',
  gastos: 'Gastos por categoría',
};

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
