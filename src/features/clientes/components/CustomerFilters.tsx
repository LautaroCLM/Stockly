import React from 'react';
import { Search } from 'lucide-react';
import type { Customer } from '../types';

export type CustomerStatusFilter = 'all' | 'active' | 'inactive';

const LABELS: Record<CustomerStatusFilter, string> = { all: 'Todos', active: 'Activos', inactive: 'Inactivos' };
const ACTIVE_CLASS: Record<CustomerStatusFilter, string> = {
  all: 'bg-card text-foreground shadow-sm',
  active: 'bg-card text-emerald-500 shadow-sm',
  inactive: 'bg-card text-muted-foreground shadow-sm',
};

interface CustomerFiltersProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  status: CustomerStatusFilter;
  onStatusChange: (status: CustomerStatusFilter) => void;
  counts: Record<CustomerStatusFilter, number>;
}

/** Búsqueda y filtro por estado de los clientes. */
export const CustomerFilters: React.FC<CustomerFiltersProps> = ({ searchQuery, onSearchChange, status, onStatusChange, counts }) => (
  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
    <div className="relative flex-1 max-w-md">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
      <input type="text" aria-label="Buscar clientes" placeholder="Buscar por nombre, documento, correo o teléfono..." value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-input bg-card text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
    </div>
    <div className="flex items-center gap-1.5 self-start sm:self-auto bg-muted/30 p-1 rounded-lg border border-border/60">
      {(Object.keys(LABELS) as CustomerStatusFilter[]).map((key) => (
        <button key={key} onClick={() => onStatusChange(key)}
          className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${status === key ? ACTIVE_CLASS[key] : 'text-muted-foreground hover:text-foreground'}`}>
          {LABELS[key]} ({counts[key]})
        </button>
      ))}
    </div>
  </div>
);

/** Clientes que coinciden con el estado y el texto buscado. */
export function filterCustomers(customers: Customer[], status: CustomerStatusFilter, query: string): Customer[] {
  const q = query.toLowerCase().trim();
  return customers.filter((c) => {
    if (status === 'active' && !c.isActive) return false;
    if (status === 'inactive' && c.isActive) return false;
    if (!q) return true;
    return [c.name, c.taxId, c.email, c.phone, c.address].some((value) => Boolean(value?.toLowerCase().includes(q)));
  });
}
