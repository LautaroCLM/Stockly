import React, { useEffect, useState } from 'react';
import type { Product } from '../inventario/types';
import { useMovementsHistory } from './hooks/useMovementsHistory';
import type { Company } from '@/types';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { AlertTriangle, History, Loader2, Package, RotateCcw } from 'lucide-react';
import { MovementRow } from './components/MovementRow';
import { MovementFilters, MovementMetrics } from './components/MovementFilters';

interface HistorialStockPageProps {
  company: Company;
  /** Catálogo completo: la búsqueda por nombre o SKU se resuelve contra él. */
  products: Product[];
  onNavigateToInventario: () => void;
}

const SEARCH_DEBOUNCE_MS = 300;

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
              Trazabilidad de entradas, salidas, ventas, compras, ajustes y anulaciones.
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

      <MovementMetrics total={showCount(total)} entries={showCount(counts?.entries)} exits={showCount(counts?.exits)} />

      <MovementFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        filters={filters}
        onFiltersChange={setFilters}
        shown={movements.length}
        total={total}
      />

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
                        <span>Cargando movimientos de stock...</span>
                      </div>
                    </td>
                  </tr>
                ) : movements.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-text-muted">
                      {error
                        ? 'No se pudieron cargar los movimientos. Usá Reintentar en el aviso de arriba.'
                        : 'No se encontraron movimientos registrados con los filtros seleccionados.'}
                    </td>
                  </tr>
                ) : (
                  movements.map((mov) => <MovementRow key={mov.id} movement={mov} />)
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
