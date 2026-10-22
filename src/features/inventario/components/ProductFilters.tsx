import React, { useEffect, useRef } from 'react';
import { StockStatus } from '../types';
import { Search, X, Filter } from 'lucide-react';

interface ProductFiltersProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  categories: string[];
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  activeFilter: 'active' | 'inactive' | 'all';
  onActiveFilterChange: (filter: 'active' | 'inactive' | 'all') => void;
  selectedStatus: 'all' | StockStatus;
  onStatusChange: (status: 'all' | StockStatus) => void;
  totalFiltered: number;
}

export const ProductFilters: React.FC<ProductFiltersProps> = ({
  searchQuery,
  onSearchChange,
  categories,
  selectedCategory,
  onCategoryChange,
  activeFilter,
  onActiveFilterChange,
  selectedStatus,
  onStatusChange,
  totalFiltered,
}) => {
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut: '/' or 'Ctrl+K' focuses the search input if not inside another input
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const activeEl = document.activeElement;
      const isInput =
        activeEl?.tagName === 'INPUT' ||
        activeEl?.tagName === 'TEXTAREA' ||
        (activeEl as HTMLElement)?.isContentEditable;

      if ((e.key === '/' && !isInput) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="bg-surface border border-border rounded-xl p-3.5 space-y-3">
      {/* Top row: Omnibar search & Category select */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
        {/* Instant Search Bar */}
        <div className="relative flex-1">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
          />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar por Nombre, SKU o Código de Barras... (Presiona '/' o Ctrl+K)"
            className="w-full h-9 pl-9 pr-16 text-xs bg-surface-2 border border-border/80 focus:border-primary focus:bg-surface-2 rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none transition-colors"
          />
          {searchQuery ? (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary p-0.5"
              title="Borrar búsqueda"
            >
              <X size={14} />
            </button>
          ) : (
            <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-3 text-text-muted border border-border select-none pointer-events-none">
              /
            </kbd>
          )}
        </div>

        {/* Category Filter */}
        <div className="flex items-center gap-2">
          <div className="relative min-w-[180px]">
            <select
              value={selectedCategory}
              onChange={(e) => onCategoryChange(e.target.value)}
              className="w-full h-9 px-3 text-xs bg-surface-2 border border-border/80 focus:border-primary rounded-lg text-text-primary focus:outline-none cursor-pointer appearance-none pr-8"
            >
              <option value="all">Todas las categorías</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            <Filter
              size={13}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
            />
          </div>
        </div>
      </div>

      {/* Bottom row: Active status toggle, Stock status pills & result count */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-border/50">
        <div className="flex flex-wrap items-center gap-3">
          {/* Active status segmented pills */}
          <div className="flex items-center gap-1 bg-surface-3/80 p-0.5 rounded-lg border border-border/70">
            {[
              { id: 'active', label: 'Activos' },
              { id: 'inactive', label: 'Inactivos' },
              { id: 'all', label: 'Todos' },
            ].map((item) => {
              const isSelected = activeFilter === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onActiveFilterChange(item.id as 'active' | 'inactive' | 'all')}
                  className={`text-[11px] px-2.5 py-1 rounded-md transition-all font-medium ${
                    isSelected
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="h-4 w-px bg-border/60 hidden sm:block" />

          {/* Stock status pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium text-text-muted mr-1">
              Stock:
            </span>

            {[
              { id: 'all', label: 'Todos' },
              { id: 'normal', label: 'Normal' },
              { id: 'low', label: 'Bajo Stock' },
              { id: 'out_of_stock', label: 'Sin Stock' },
              { id: 'negative', label: 'Quiebre / Negativo' },
            ].map((item) => {
              const isSelected = selectedStatus === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onStatusChange(item.id as 'all' | StockStatus)}
                  className={`text-[11px] px-2.5 py-1 rounded-md transition-colors font-medium ${
                    isSelected
                      ? 'bg-primary/20 text-primary-light border border-primary/50'
                      : 'bg-surface-2 text-text-secondary hover:text-text-primary hover:bg-surface-3 border border-border/50'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="text-[11px] text-text-muted">
          Mostrando <strong className="text-text-primary tabular-nums">{totalFiltered}</strong> productos
        </div>
      </div>
    </div>
  );
};
