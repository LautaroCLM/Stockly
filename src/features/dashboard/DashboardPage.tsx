import React from 'react';
import { DashboardDataset, Company } from '@/types';
import { MetricCardsRow } from './components/MetricCardsRow';
import { RevenueAreaChart } from './components/RevenueAreaChart';
import { CriticalStockTable } from './components/CriticalStockTable';
import { RecentActivityList } from './components/RecentActivityList';
import { Button } from '@/components/ui/Button';
import { ShoppingCart, RefreshCw, BarChart3, Boxes, Info } from 'lucide-react';

interface DashboardPageProps {
  company: Company;
  data: DashboardDataset | null;
  isMock?: boolean;
  onNavigateToInventario: () => void;
  onNavigateToVentas: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  company,
  data,
  isMock = false,
  onNavigateToInventario,
  onNavigateToVentas,
}) => {
  // Cuando no existen métricas (empresa real de Supabase sin datos conectados aún)
  if (!data) {
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
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                  company.role === 'master_admin'
                    ? 'bg-primary/20 text-primary-light border-primary/40'
                    : 'bg-surface-3 text-text-muted border-border/50'
                }`}>
                  {company.role === 'master_admin' ? 'Administrador' : 'Empleado'}
                </span>
              )}
            </div>
            <p className="text-xs text-text-muted mt-0.5">
              Empresa conectada a Supabase local con aislamiento multiempresa.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="primary"
              size="sm"
              onClick={onNavigateToInventario}
              className="shadow-sm"
            >
              <ShoppingCart size={14} />
              <span>Venta en Mostrador</span>
            </Button>
          </div>
        </div>

        {/* Empty State for Real Metrics */}
        <div className="bg-surface border border-border rounded-2xl p-8 sm:p-12 text-center shadow-xl space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-border flex items-center justify-center mx-auto text-primary shadow-inner">
            <BarChart3 className="w-8 h-8" />
          </div>

          <div className="max-w-md mx-auto space-y-2">
            <h2 className="text-lg font-bold text-text-primary">
              Métricas operativas en preparación
            </h2>
            <p className="text-xs text-text-secondary leading-relaxed">
              Las métricas reales estarán disponibles cuando se conecten los datos de esta empresa.
            </p>
          </div>

          <div className="max-w-lg mx-auto p-4 rounded-xl bg-surface-2/60 border border-border/80 text-left space-y-2 text-xs text-text-muted">
            <div className="flex items-center gap-2 text-text-primary font-medium">
              <Info className="w-4 h-4 text-primary shrink-0" />
              <span>Aislamiento de métricas garantizado</span>
            </div>
            <p className="leading-relaxed">
              Stockly no muestra datos ficticios ni estadísticas de otras empresas como respaldo.
              Los indicadores de facturación, caja diaria, gráficos y movimientos se activarán a medida que se registren operaciones reales en esta empresa.
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row justify-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={onNavigateToInventario}
              className="text-xs"
            >
              <Boxes size={14} className="mr-1.5" />
              <span>Ver Catálogo de Productos</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={onNavigateToVentas}
              className="text-xs"
            >
              <ShoppingCart size={14} className="mr-1.5" />
              <span>Historial de Ventas</span>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Cuando se visualiza una empresa mock en modo demostración
  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Welcome / Context Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border/60">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold tracking-tight text-text-primary">
              Resumen Operativo — {data.company.name}
            </h1>
            {isMock && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 font-medium">
                Modo Demostración (Datos simulados)
              </span>
            )}
          </div>
          <p className="text-xs text-text-muted mt-0.5">
            Monitoreo en tiempo real de facturación, caja, inventario y movimientos.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => window.location.reload()}
            title="Actualizar métricas"
          >
            <RefreshCw size={13} />
            <span>Actualizar</span>
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={onNavigateToInventario}
            className="shadow-sm"
          >
            <ShoppingCart size={14} />
            <span>Venta en Mostrador</span>
          </Button>
        </div>
      </div>

      {/* Row 1: KPI Cards */}
      <MetricCardsRow kpis={data.kpis} />

      {/* Row 2: Charts and Main Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RevenueAreaChart data={data.revenueHistory} />
        </div>

        <div className="lg:col-span-1">
          <RecentActivityList
            activities={data.recentActivity}
            onViewAllClick={onNavigateToVentas}
          />
        </div>
      </div>

      {/* Row 3: Critical and Negative Stock Table */}
      <div>
        <CriticalStockTable
          products={data.criticalStock}
          onViewAllClick={onNavigateToInventario}
        />
      </div>
    </div>
  );
};
