import React from 'react';
import { Company } from '@/types';
import type { Product } from '@/features/inventario/types';
import { MetricCardsRow } from './components/MetricCardsRow';
import { RevenueAreaChart } from './components/RevenueAreaChart';
import { CriticalStockTable } from './components/CriticalStockTable';
import { RecentActivityList } from './components/RecentActivityList';
import { useDashboardData } from './hooks/useDashboardData';
import { Button } from '@/components/ui/Button';
import { ShoppingCart, RefreshCw, AlertTriangle, Loader2 } from 'lucide-react';

interface DashboardPageProps {
  company: Company;
  /** Catálogo completo de la empresa: el stock crítico se calcula a partir de él. */
  products: Product[];
  isMasterAdmin: boolean;
  onNavigateToInventario: () => void;
  onNavigateToHistorial: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  company,
  products,
  isMasterAdmin,
  onNavigateToInventario,
  onNavigateToHistorial,
}) => {
  const { kpis, revenueHistory, criticalStock, activity, isLoading, error, reload } =
    useDashboardData(company.id, products);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Welcome / Context Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border/60">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold tracking-tight text-text-primary">
              Resumen Operativo — {company.name}
            </h1>
            {company.role && (
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                  company.role === 'master_admin'
                    ? 'bg-primary/20 text-primary-light border-primary/40'
                    : 'bg-surface-3 text-text-muted border-border/50'
                }`}
              >
                {company.role === 'master_admin' ? 'Administrador' : 'Empleado'}
              </span>
            )}
          </div>
          <p className="text-xs text-text-muted mt-0.5">
            Ventas completadas (sin anuladas), stock a reponer y últimos movimientos de la empresa.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button variant="secondary" size="sm" onClick={reload} disabled={isLoading} title="Actualizar métricas">
            {isLoading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            <span>Actualizar</span>
          </Button>

          <Button variant="primary" size="sm" onClick={onNavigateToInventario} className="shadow-sm">
            <ShoppingCart size={14} />
            <span>Venta en Mostrador</span>
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 bg-danger/10 border border-danger/30 rounded-xl flex items-center justify-between text-xs text-danger">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="shrink-0" />
            <span>No se pudieron cargar las métricas: {error}</span>
          </div>
          <Button variant="secondary" size="sm" onClick={reload} className="h-7 px-2.5 text-xs">
            Reintentar
          </Button>
        </div>
      )}

      {/* Row 1: KPI Cards */}
      <MetricCardsRow kpis={kpis} />

      {/* Row 2: Charts and Main Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RevenueAreaChart data={revenueHistory} showCost={isMasterAdmin} />
        </div>

        <div className="lg:col-span-1">
          <RecentActivityList activities={activity} onViewAllClick={onNavigateToHistorial} />
        </div>
      </div>

      {/* Row 3: Critical and Negative Stock Table */}
      <div>
        <CriticalStockTable products={criticalStock} onViewAllClick={onNavigateToInventario} />
      </div>
    </div>
  );
};
