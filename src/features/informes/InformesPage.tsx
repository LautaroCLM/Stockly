import React, { useCallback, useState } from 'react';
import { FileBarChart, RotateCcw, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatDateShort } from '@/lib/formatters';
import { localDateInputValue } from '@/lib/localDate';
import { toHundredths } from '@/lib/decimal';
import { PERIOD_LABELS, periodRange } from '@/features/finanzas/financeMath';
import type { PeriodKey } from '@/features/finanzas/types';
import type { Company } from '@/types';
import {
  fetchExpensesByCategory, fetchInventoryValuation, fetchProductSales, fetchSalesByDay,
} from './api/reportsApi';
import { useReport } from './hooks/useReport';
import { ReportPanel } from './components/ReportPanel';
import {
  INVENTORY_COLUMNS, PRODUCT_COLUMNS, SALES_COLUMNS, expenseColumns, expenseTotals, inventoryTotals, productTotals, salesTotals,
} from './reportColumns';
import { REPORT_LABELS } from './types';
import type { ReportKey } from './types';

interface InformesPageProps {
  company: Company;
  isMasterAdmin: boolean;
}

const REPORT_KEYS = Object.keys(REPORT_LABELS) as ReportKey[];

/** Informes: ventas por día, productos vendidos, inventario valuado y gastos, con exportación a CSV. */
export const InformesPage: React.FC<InformesPageProps> = ({ company, isMasterAdmin }) => {
  const [report, setReport] = useState<ReportKey>('ventas');
  const [period, setPeriod] = useState<PeriodKey>('month');
  const range = periodRange(period, localDateInputValue());
  const { from, to } = range;
  const id = company.id;
  const on = (key: ReportKey) => isMasterAdmin && report === key;

  const sales = useReport(useCallback(() => fetchSalesByDay(id, { from, to }), [id, from, to]), on('ventas'));
  const products = useReport(useCallback(() => fetchProductSales(id, { from, to }), [id, from, to]), on('productos'));
  const inventory = useReport(useCallback(() => fetchInventoryValuation(id), [id]), on('inventario'));
  const expenses = useReport(useCallback(() => fetchExpensesByCategory(id, { from, to }), [id, from, to]), on('gastos'));
  const active = { ventas: sales, productos: products, inventario: inventory, gastos: expenses }[report];
  const usesPeriod = report !== 'inventario';
  const stamp = `${company.name}-${report}-${usesPeriod ? `${from}_${to}` : localDateInputValue()}`.replace(/[^\w.-]+/g, '_');

  if (!isMasterAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center gap-2 text-text-muted">
        <ShieldAlert size={32} className="text-warning" />
        <p className="text-sm font-semibold text-text-primary">Solo los administradores ven los informes</p>
        <p className="text-xs">Incluyen costos y márgenes de {company.name}.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-6xl mx-auto pb-12">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-surface-2 border border-border flex items-center justify-center">
            <FileBarChart size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary">Informes</h1>
            <p className="text-xs text-text-muted">
              {usesPeriod ? `${formatDateShort(from)} al ${formatDateShort(to)} · ` : 'Stock actual · '}{company.name}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {usesPeriod && (
            <select value={period} onChange={(e) => setPeriod(e.target.value as PeriodKey)} aria-label="Período"
              className="h-9 px-3 text-xs bg-surface-2 border border-border rounded-lg text-text-primary focus:outline-none cursor-pointer">
              {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map((key) => <option key={key} value={key}>{PERIOD_LABELS[key]}</option>)}
            </select>
          )}
          <Button variant="secondary" size="sm" onClick={() => void active.reload()} disabled={active.isLoading} className="gap-1.5 h-9">
            <RotateCcw size={14} className={active.isLoading ? 'animate-spin' : ''} />
            <span>Actualizar</span>
          </Button>
        </div>
      </div>

      <div role="tablist" className="flex flex-wrap gap-1.5">
        {REPORT_KEYS.map((key) => (
          <button key={key} role="tab" aria-selected={report === key} onClick={() => setReport(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              report === key ? 'bg-primary/10 border-primary text-text-primary' : 'bg-surface-2 border-border text-text-secondary hover:text-text-primary'
            }`}>
            {REPORT_LABELS[key]}
          </button>
        ))}
      </div>

      {report === 'ventas' && (
        <ReportPanel rows={sales.rows} isLoading={sales.isLoading} error={sales.error} columns={SALES_COLUMNS}
          totals={salesTotals(sales.rows ?? [])} rowKey={(r) => r.date} filename={`${stamp}.csv`} onReload={() => void sales.reload()}
          emptyText="No hubo ventas en este período." />
      )}
      {report === 'productos' && (
        <>
          <p className="text-[11px] text-text-muted">El facturado es el de las líneas de venta, antes de descuentos generales. Solo ventas no anuladas.</p>
          <ReportPanel rows={products.rows} isLoading={products.isLoading} error={products.error} columns={PRODUCT_COLUMNS}
            totals={productTotals(products.rows ?? [])} rowKey={(r) => r.productId} filename={`${stamp}.csv`} onReload={() => void products.reload()}
            emptyText="No se vendieron productos en este período." />
        </>
      )}
      {report === 'inventario' && (
        <ReportPanel rows={inventory.rows} isLoading={inventory.isLoading} error={inventory.error} columns={INVENTORY_COLUMNS}
          totals={inventoryTotals(inventory.rows ?? [])} rowKey={(r) => r.productId} filename={`${stamp}.csv`} onReload={() => void inventory.reload()}
          emptyText="No hay productos activos." />
      )}
      {report === 'gastos' && (
        <ReportPanel rows={expenses.rows} isLoading={expenses.isLoading} error={expenses.error}
          columns={expenseColumns((expenses.rows ?? []).reduce((s, r) => s + toHundredths(r.total), 0))}
          totals={expenseTotals(expenses.rows ?? [])} rowKey={(r) => r.category} filename={`${stamp}.csv`} onReload={() => void expenses.reload()}
          emptyText="No hubo gastos en este período." />
      )}
    </div>
  );
};
