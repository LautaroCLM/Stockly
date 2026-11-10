import React from 'react';
import { ArrowDownLeft, ArrowUpRight, History, Search } from 'lucide-react';
import type { StockMovementReason } from '@/features/inventario/types';
import type { MovementFilterInputs } from '../hooks/useMovementsHistory';

const REASON_OPTIONS: [string, string][] = [
  ['all', 'Todos los motivos'],
  ['physical_count', 'Conteos físicos'],
  ['loss_damage', 'Mermas y roturas'],
  ['internal_use', 'Consumo interno'],
  ['initial_load', 'Cargas iniciales'],
  ['import', 'Importaciones de Excel'],
  ['purchase', 'Entradas / Compras'],
  ['sale', 'Ventas mostrador'],
  ['cancellation', 'Anulaciones de venta'],
  ['purchase_cancellation', 'Anulaciones de compra'],
];

interface MovementFiltersProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  filters: MovementFilterInputs;
  onFiltersChange: (update: (prev: MovementFilterInputs) => MovementFilterInputs) => void;
  shown: number;
  total: number;
}

/** Búsqueda, motivo y sentido de los movimientos. */
export const MovementFilters: React.FC<MovementFiltersProps> = ({ searchQuery, onSearchChange, filters, onFiltersChange, shown, total }) => (
  <div className="bg-surface border border-border rounded-xl p-3.5 space-y-3">
    <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
      <div className="relative flex-1">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input type="text" value={searchQuery} onChange={(e) => onSearchChange(e.target.value)} aria-label="Buscar movimientos"
          placeholder="Buscar por producto, SKU, comprobante u observaciones..."
          className="w-full h-8 pl-8 pr-3 text-xs bg-surface-2 border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary" />
      </div>
      <select value={filters.reason} aria-label="Filtrar por motivo"
        onChange={(e) => onFiltersChange((prev) => ({ ...prev, reason: e.target.value as 'all' | StockMovementReason }))}
        className="h-8 px-2.5 text-xs bg-surface-2 border border-border rounded-lg text-text-primary focus:outline-none cursor-pointer">
        {REASON_OPTIONS.map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
    </div>

    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/50 text-xs">
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-text-muted mr-1">Sentido:</span>
        {(['all', 'increase', 'decrease'] as const).map((dir) => (
          <button key={dir} onClick={() => onFiltersChange((prev) => ({ ...prev, direction: dir }))}
            className={`text-[11px] px-2.5 py-0.5 rounded-md transition-colors font-medium ${
              filters.direction === dir
                ? 'bg-primary text-white shadow-sm'
                : 'bg-surface-2 text-text-secondary hover:text-text-primary hover:bg-surface-3 border border-border/50'
            }`}>
            {dir === 'all' ? 'Todos' : dir === 'increase' ? 'Entradas (+)' : 'Salidas (-)'}
          </button>
        ))}
      </div>
      <span className="text-[11px] text-text-muted">
        Mostrando <strong className="text-text-primary tabular-nums">{shown}</strong> de{' '}
        <strong className="text-text-primary tabular-nums">{total}</strong> movimientos
      </span>
    </div>
  </div>
);

const MetricCard: React.FC<{ label: string; value: React.ReactNode; valueClass: string; icon: React.ReactNode }> = ({ label, value, valueClass, icon }) => (
  <div className="bg-surface border border-border rounded-xl p-3.5 flex items-center justify-between">
    <div>
      <span className="text-xs text-text-muted block">{label}</span>
      <span className={`text-xl font-bold tabular-nums ${valueClass}`}>{value}</span>
    </div>
    {icon}
  </div>
);

/** Totales según filtros: movimientos, entradas y salidas. */
export const MovementMetrics: React.FC<{ total: React.ReactNode; entries: React.ReactNode; exits: React.ReactNode }> = ({ total, entries, exits }) => (
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
    <MetricCard label="Movimientos (según filtros)" value={total} valueClass="text-text-primary" icon={<History size={20} className="text-text-muted/60" />} />
    <MetricCard label="Movimientos de entrada" value={entries} valueClass="text-emerald-400" icon={<ArrowUpRight size={20} className="text-emerald-400/70" />} />
    <MetricCard label="Movimientos de salida" value={exits} valueClass="text-rose-400" icon={<ArrowDownLeft size={20} className="text-rose-400/70" />} />
  </div>
);
