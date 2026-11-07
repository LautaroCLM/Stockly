import { formatCurrency, formatDateShort, formatNumber } from '@/lib/formatters';
import { fromHundredths, toHundredths } from '@/lib/decimal';
import { EXPENSE_CATEGORY_LABELS } from '@/features/gastos/types';
import type { ExpenseCategory } from '@/features/gastos/types';
import { csvNumber } from './csv';
import type { ExpenseCategoryRow, InventoryRow, ProductSalesRow, ReportColumn, SalesDayRow } from './types';

const sumCents = <T,>(rows: T[], pick: (row: T) => number): number => rows.reduce((s, r) => s + toHundredths(pick(r)), 0);
const money = (n: number) => formatCurrency(n);

export const categoryLabel = (category: string): string => EXPENSE_CATEGORY_LABELS[category as ExpenseCategory] ?? category;

/** Ganancia de una línea: facturado menos costo, en centavos exactos. */
export const lineProfit = (row: ProductSalesRow): number => fromHundredths(toHundredths(row.revenue) - toHundredths(row.cost));

/** Margen sobre lo facturado, en %; null si no se facturó nada. */
export const lineMargin = (row: ProductSalesRow): number | null =>
  toHundredths(row.revenue) === 0 ? null : (toHundredths(lineProfit(row)) / toHundredths(row.revenue)) * 100;

const marginText = (m: number | null) => (m === null ? '-' : `${m.toFixed(1)}%`);

export const SALES_COLUMNS: ReportColumn<SalesDayRow>[] = [
  { key: 'date', header: 'Fecha', render: (r) => formatDateShort(r.date), csv: (r) => r.date },
  { key: 'count', header: 'Ventas', align: 'right', render: (r) => r.salesCount, csv: (r) => String(r.salesCount) },
  { key: 'discount', header: 'Descuentos', align: 'right', render: (r) => money(r.discountTotal), csv: (r) => csvNumber(r.discountTotal) },
  { key: 'credit', header: 'A cuenta corriente', align: 'right', render: (r) => money(r.creditTotal), csv: (r) => csvNumber(r.creditTotal) },
  { key: 'total', header: 'Total vendido', align: 'right', render: (r) => money(r.total), csv: (r) => csvNumber(r.total) },
];

export const salesTotals = (rows: SalesDayRow[]): Record<string, string> => ({
  count: String(rows.reduce((s, r) => s + r.salesCount, 0)),
  discount: money(fromHundredths(sumCents(rows, (r) => r.discountTotal))),
  credit: money(fromHundredths(sumCents(rows, (r) => r.creditTotal))),
  total: money(fromHundredths(sumCents(rows, (r) => r.total))),
});

export const PRODUCT_COLUMNS: ReportColumn<ProductSalesRow>[] = [
  { key: 'sku', header: 'Código', render: (r) => r.sku, csv: (r) => r.sku },
  { key: 'name', header: 'Producto', render: (r) => r.name, csv: (r) => r.name },
  { key: 'qty', header: 'Cantidad', align: 'right', render: (r) => formatNumber(r.quantity), csv: (r) => csvNumber(r.quantity) },
  { key: 'revenue', header: 'Facturado', align: 'right', render: (r) => money(r.revenue), csv: (r) => csvNumber(r.revenue) },
  { key: 'cost', header: 'Costo', align: 'right', render: (r) => money(r.cost), csv: (r) => csvNumber(r.cost) },
  { key: 'profit', header: 'Ganancia', align: 'right', render: (r) => money(lineProfit(r)), csv: (r) => csvNumber(lineProfit(r)) },
  { key: 'margin', header: 'Margen', align: 'right', render: (r) => marginText(lineMargin(r)), csv: (r) => marginText(lineMargin(r)) },
];

export const productTotals = (rows: ProductSalesRow[]): Record<string, string> => {
  const revenue = sumCents(rows, (r) => r.revenue);
  const profit = revenue - sumCents(rows, (r) => r.cost);
  return {
    revenue: money(fromHundredths(revenue)),
    cost: money(fromHundredths(sumCents(rows, (r) => r.cost))),
    profit: money(fromHundredths(profit)),
    margin: marginText(revenue === 0 ? null : (profit / revenue) * 100),
  };
};

export const INVENTORY_COLUMNS: ReportColumn<InventoryRow>[] = [
  { key: 'sku', header: 'Código', render: (r) => r.sku, csv: (r) => r.sku },
  { key: 'name', header: 'Producto', render: (r) => r.name, csv: (r) => r.name },
  { key: 'stock', header: 'Stock', align: 'right', render: (r) => formatNumber(r.stock), csv: (r) => csvNumber(r.stock) },
  { key: 'cost', header: 'Costo unitario', align: 'right', render: (r) => money(r.costPrice), csv: (r) => csvNumber(r.costPrice) },
  { key: 'price', header: 'Precio de venta', align: 'right', render: (r) => money(r.sellingPrice), csv: (r) => csvNumber(r.sellingPrice) },
  { key: 'value', header: 'Valor en stock', align: 'right', render: (r) => money(r.stockValue), csv: (r) => csvNumber(r.stockValue) },
];

export const inventoryTotals = (rows: InventoryRow[]): Record<string, string> => ({
  value: money(fromHundredths(sumCents(rows, (r) => r.stockValue))),
});

export const expenseColumns = (totalCents: number): ReportColumn<ExpenseCategoryRow>[] => {
  const share = (r: ExpenseCategoryRow) => (totalCents === 0 ? '0%' : `${((toHundredths(r.total) / totalCents) * 100).toFixed(1)}%`);
  return [
    { key: 'category', header: 'Categoría', render: (r) => categoryLabel(r.category), csv: (r) => categoryLabel(r.category) },
    { key: 'count', header: 'Gastos', align: 'right', render: (r) => r.count, csv: (r) => String(r.count) },
    { key: 'total', header: 'Total', align: 'right', render: (r) => money(r.total), csv: (r) => csvNumber(r.total) },
    { key: 'share', header: '% del total', align: 'right', render: share, csv: share },
  ];
};

export const expenseTotals = (rows: ExpenseCategoryRow[]): Record<string, string> => ({
  count: String(rows.reduce((s, r) => s + r.count, 0)),
  total: money(fromHundredths(sumCents(rows, (r) => r.total))),
  share: '100%',
});
