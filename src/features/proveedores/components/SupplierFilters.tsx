import React from 'react';
import { Search } from 'lucide-react';

export type SupplierStatusFilter = 'all' | 'active' | 'inactive';

interface SupplierFiltersProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  status: SupplierStatusFilter;
  onStatusChange: (status: SupplierStatusFilter) => void;
  counts: Record<SupplierStatusFilter, number>;
}

const LABELS: Record<SupplierStatusFilter, string> = { all: 'Todos', active: 'Activos', inactive: 'Inactivos' };

/** Búsqueda y filtro por estado de los proveedores. */
export const SupplierFilters: React.FC<SupplierFiltersProps> = ({ searchQuery, onSearchChange, status, onStatusChange, counts }) => (
  <div className="bg-surface border border-border rounded-xl p-3 flex flex-col sm:flex-row items-center justify-between gap-3">
    <div className="relative w-full sm:max-w-md">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
      <input type="text" value={searchQuery} onChange={(e) => onSearchChange(e.target.value)} aria-label="Buscar proveedores"
        placeholder="Buscar por nombre, CUIT, contacto o correo..."
        className="w-full h-8 pl-8 pr-3 text-xs bg-surface-2 border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary" />
    </div>
    <div className="flex items-center gap-1 w-full sm:w-auto overflow-x-auto">
      {(Object.keys(LABELS) as SupplierStatusFilter[]).map((key) => (
        <button key={key} onClick={() => onStatusChange(key)}
          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
            status === key ? 'bg-primary/15 text-primary-light border border-primary/30' : 'text-text-muted hover:text-text-primary hover:bg-surface-2'
          }`}>
          {LABELS[key]} ({counts[key]})
        </button>
      ))}
    </div>
  </div>
);

/** Proveedores que coinciden con el estado y el texto buscado. */
export function filterSuppliers<T extends { name: string; contactName?: string | null; taxId?: string | null; email?: string | null; isActive: boolean }>(
  suppliers: T[],
  status: SupplierStatusFilter,
  query: string
): T[] {
  const q = query.toLowerCase().trim();
  return suppliers.filter((s) => {
    if (status === 'active' && !s.isActive) return false;
    if (status === 'inactive' && s.isActive) return false;
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      Boolean(s.contactName?.toLowerCase().includes(q)) ||
      Boolean(s.taxId?.includes(q)) ||
      Boolean(s.email?.toLowerCase().includes(q))
    );
  });
}
