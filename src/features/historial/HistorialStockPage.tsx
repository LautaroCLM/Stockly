import React, { useEffect, useState } from 'react';
import type { Product, StockMovementReason } from '../inventario/types';
import { useMovementsHistory } from './hooks/useMovementsHistory';
import type { Company } from '@/types';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatDateTime } from '@/lib/formatters';
import {
  History,
  Search,
  ArrowUpRight,
  ArrowDownLeft,
  FileText,
  Package,
  Loader2,
  AlertTriangle,
  RotateCcw,
  User,
} from 'lucide-react';

interface HistorialStockPageProps {
  company: Company;
  /** Catálogo completo: la búsqueda por nombre o SKU se resuelve contra él. */
  products: Product[];
  onNavigateToInventario: () => void;
}

const SEARCH_DEBOUNCE_MS = 300;

const REASON_LABELS: Record<string, { label: string; badge: 'success' | 'danger' | 'warning' | 'primary' | 'neutral' }> = {
  initial_load: { label: 'Carga Inicial', badge: 'primary' },
  purchase: { label: 'Entrada / Compra', badge: 'success' },
  physical_count: { label: 'Conteo Físico', badge: 'warning' },
  loss_damage: { label: 'Merma / Rotura', badge: 'danger' },
  internal_use: { label: 'Consumo Interno', badge: 'danger' },
  sale: { label: 'Venta Mostrador', badge: 'neutral' },
  cancellation: { label: 'Anulación Venta', badge: 'warning' },
  purchase_cancellation: { label: 'Anulación Compra', badge: 'warning' },
};

export const HistorialStockPage: React.FC<HistorialStockPageProps> = ({
  company,
  products,
  onNavigateToInventario,
}) => {
  // Paginación y filtros se resuelven en el servidor (ver useMovementsHistory)
  const {
    movements,
    total,
    counts,
    hasMore,
    isLoading,
    isLoadingMore,
    error,
    filters,
    setFilters,
    loadMore,
    reload,
  } = useMovementsHistory(company.id, products);
  const onReload = reload;

  // El texto se envía al servidor recién cuando el usuario deja de escribir
  const [searchQuery, setSearchQuery] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters((prev) => (prev.search === searchQuery ? prev : { ...prev, search: searchQuery }));
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchQuery, setFilters]);

  const selectedDirection = filters.direction;
  const selectedReason = filters.reason;
  const showCount = (value: number | undefined) => (isLoading || value === undefined ? '...' : value);

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border/60">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-center text-primary">
            <History size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-text-primary">
                Historial de Movimientos de Stock
              </h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-surface-2 text-text-muted border border-border">
                {company.name}
              </span>
            </div>
            <p className="text-xs text-text-muted mt-0.5">
              Trazabilidad inmutable de entradas, salidas, ventas y ajustes físicos en PostgreSQL.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onReload && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onReload}
              disabled={isLoading}
              title="Refrescar movimientos desde la base de datos"
            >
              <RotateCcw size={14} className={isLoading ? 'animate-spin' : ''} />
              <span className="ml-1.5">Actualizar</span>
            </Button>
          )}

          <Button
            variant="secondary"
            size="sm"
            onClick={onNavigateToInventario}
            className="shadow-sm"
          >
            <Package size={14} className="mr-1.5 text-primary" />
            <span>Ir a Inventario</span>
          </Button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-3.5 bg-danger/10 border border-danger/30 rounded-xl flex items-center justify-between text-xs text-danger">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
          {onReload && (
            <Button variant="secondary" size="sm" onClick={onReload} className="h-7 px-2.5 text-xs">
              Reintentar
            </Button>
          )}
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-surface border border-border rounded-xl p-3.5 flex items-center justify-between">
          <div>
            <span className="text-xs text-text-muted block">Movimientos (según filtros)</span>
            <span className="text-xl font-bold text-text-primary tabular-nums">
              {showCount(total)}
            </span>
          </div>
          <History size={20} className="text-text-muted/60" />
        </div>

        <div className="bg-surface border border-border rounded-xl p-3.5 flex items-center justify-between">
          <div>
            <span className="text-xs text-text-muted block">Movimientos de entrada</span>
            <span className="text-xl font-bold text-emerald-400 tabular-nums">
              {showCount(counts?.entries)}
            </span>
          </div>
          <ArrowUpRight size={20} className="text-emerald-400/70" />
        </div>

        <div className="bg-surface border border-border rounded-xl p-3.5 flex items-center justify-between">
          <div>
            <span className="text-xs text-text-muted block">Movimientos de salida</span>
            <span className="text-xl font-bold text-rose-400 tabular-nums">
              {showCount(counts?.exits)}
            </span>
          </div>
          <ArrowDownLeft size={20} className="text-rose-400/70" />
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-surface border border-border rounded-xl p-3.5 space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          {/* Search bar */}
          <div className="relative flex-1">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por producto, SKU, comprobante u observaciones..."
              className="w-full h-8 pl-8 pr-3 text-xs bg-surface-2 border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary"
            />
          </div>

          {/* Reason filter */}
          <div className="flex items-center gap-2">
            <select
              value={selectedReason}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, reason: e.target.value as 'all' | StockMovementReason }))
              }
              className="h-8 px-2.5 text-xs bg-surface-2 border border-border rounded-lg text-text-primary focus:outline-none cursor-pointer"
            >
              <option value="all">Todos los motivos</option>
              <option value="physical_count">Conteos físicos</option>
              <option value="loss_damage">Mermas y roturas</option>
              <option value="internal_use">Consumo interno</option>
              <option value="initial_load">Cargas iniciales</option>
              <option value="purchase">Entradas / Compras</option>
              <option value="sale">Ventas mostrador</option>
            </select>
          </div>
        </div>

        {/* Direction pills */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/50 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-text-muted mr-1">Sentido:</span>
            {(['all', 'increase', 'decrease'] as const).map((dir) => (
              <button
                key={dir}
                onClick={() => setFilters((prev) => ({ ...prev, direction: dir }))}
                className={`text-[11px] px-2.5 py-0.5 rounded-md transition-colors font-medium ${
                  selectedDirection === dir
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-surface-2 text-text-secondary hover:text-text-primary hover:bg-surface-3 border border-border/50'
                }`}
              >
                {dir === 'all' ? 'Todos' : dir === 'increase' ? 'Entradas (+)' : 'Salidas (-)'}
              </button>
            ))}
          </div>

          <span className="text-[11px] text-text-muted">
            Mostrando <strong className="text-text-primary tabular-nums">{movements.length}</strong> de{' '}
            <strong className="text-text-primary tabular-nums">{total}</strong> movimientos
          </span>
        </div>
      </div>

      {/* Movements Table */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-surface-2/40 text-[11px] font-semibold text-text-muted uppercase tracking-wider">
                  <th className="py-2.5 px-4">Fecha y Hora</th>
                  <th className="py-2.5 px-3">Producto / SKU</th>
                  <th className="py-2.5 px-3">Motivo</th>
                  <th className="py-2.5 px-3 text-right">Variación</th>
                  <th className="py-2.5 px-3 text-center">Stock Antes &rarr; Después</th>
                  <th className="py-2.5 px-3">Comprobante / Ref.</th>
                  <th className="py-2.5 px-3">Registrado por</th>
                  <th className="py-2.5 px-4">Observaciones</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-border/60 text-xs">
                {isLoading && movements.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-text-muted">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 size={16} className="animate-spin text-primary" />
                        <span>Cargando movimientos de stock desde PostgreSQL...</span>
                      </div>
                    </td>
                  </tr>
                ) : movements.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-text-muted">
                      No se encontraron movimientos registrados con los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  movements.map((mov) => {
                    const reasonConfig = REASON_LABELS[mov.reason] || {
                      label: mov.reason,
                      badge: 'neutral',
                    };
                    const isIncrease = mov.direction === 'increase';

                    return (
                      <tr key={mov.id} className="hover:bg-surface-2/50 transition-colors">
                        <td className="py-3 px-4 text-text-secondary whitespace-nowrap">
                          {formatDateTime(mov.createdAt)}
                        </td>

                        <td className="py-3 px-3">
                          <div className="flex flex-col min-w-0 max-w-xs">
                            <span className="font-medium text-text-primary truncate">
                              {mov.productName}
                            </span>
                            <span className="font-mono text-[11px] text-text-muted">
                              {mov.productSku}
                            </span>
                          </div>
                        </td>

                        <td className="py-3 px-3">
                          <Badge variant={reasonConfig.badge} size="sm">
                            {reasonConfig.label}
                          </Badge>
                        </td>

                        <td className="py-3 px-3 text-right font-mono font-bold tabular-nums">
                          <span className={isIncrease ? 'text-emerald-400' : 'text-danger'}>
                            {isIncrease ? '+' : '-'}{mov.quantity}
                          </span>
                        </td>

                        <td className="py-3 px-3 text-center font-mono text-[11px] tabular-nums text-text-muted">
                          <span>{mov.previousStock}</span>
                          <span className="mx-1 text-text-muted/60">&rarr;</span>
                          <span className={`font-bold ${mov.newStock < 0 ? 'text-danger font-extrabold' : 'text-text-primary'}`}>
                            {mov.newStock}
                          </span>
                        </td>

                        <td className="py-3 px-3">
                          {mov.referenceDoc || mov.referenceSaleId ? (
                            <span className="inline-flex items-center gap-1 font-mono text-[11px] px-2 py-0.5 rounded bg-surface-2 text-text-secondary border border-border">
                              <FileText size={11} className="text-text-muted" />
                              {mov.referenceDoc || mov.referenceSaleId}
                            </span>
                          ) : (
                            <span className="text-text-muted">—</span>
                          )}
                        </td>

                        <td className="py-3 px-3 text-[11px] text-text-secondary whitespace-nowrap">
                          <span className="inline-flex items-center gap-1">
                            <User size={11} className="text-text-muted" />
                            <span>{mov.createdBy || 'Usuario'}</span>
                          </span>
                        </td>

                        <td className="py-3 px-4 text-[11px] text-text-muted max-w-xs truncate">
                          {mov.notes || '—'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {hasMore && !isLoading && (
            <div className="p-3 border-t border-border/60 flex items-center justify-center">
              <Button variant="secondary" size="sm" onClick={loadMore} disabled={isLoadingMore}>
                {isLoadingMore ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <span>Cargar más ({total - movements.length} restantes)</span>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
