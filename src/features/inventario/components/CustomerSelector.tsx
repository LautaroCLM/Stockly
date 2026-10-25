import React, { useState, useMemo } from 'react';
import { Customer } from '@/features/clientes/types';
import { formatCuit } from '@/features/companies/utils/cuitValidator';
import { UserCheck, Search, X, Check, Users } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

interface CustomerSelectorProps {
  customers: Customer[];
  selectedCustomerId: string | null;
  onSelectCustomer: (customer: Customer | null) => void;
  disabled?: boolean;
}

export const CustomerSelector: React.FC<CustomerSelectorProps> = ({
  customers,
  selectedCustomerId,
  onSelectCustomer,
  disabled = false,
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Solo clientes activos están disponibles para nuevas ventas
  const activeCustomers = useMemo(() => {
    return customers.filter((c) => c.isActive);
  }, [customers]);

  const selectedCustomer = useMemo(() => {
    if (!selectedCustomerId) return null;
    return activeCustomers.find((c) => c.id === selectedCustomerId) || null;
  }, [selectedCustomerId, activeCustomers]);

  const filteredCustomers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return activeCustomers;
    return activeCustomers.filter((c) => {
      const matchName = c.name.toLowerCase().includes(q);
      const matchTaxId = c.taxId ? c.taxId.toLowerCase().includes(q) : false;
      const matchPhone = c.phone ? c.phone.toLowerCase().includes(q) : false;
      return matchName || matchTaxId || matchPhone;
    });
  }, [activeCustomers, searchQuery]);

  const formatDoc = (c: Customer) => {
    if (!c.taxId) return 'Consumidor Final';
    if (c.identificationType === 'CUIT' || c.identificationType === 'CUIL') {
      return `${c.identificationType} ${formatCuit(c.taxId)}`;
    }
    return `${c.identificationType} ${c.taxId}`;
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-text-secondary flex items-center gap-1.5">
          <UserCheck size={14} className="text-primary" />
          <span>Cliente de la Venta:</span>
        </label>
        {selectedCustomer && (
          <button
            type="button"
            onClick={() => onSelectCustomer(null)}
            disabled={disabled}
            className="text-[11px] text-text-muted hover:text-primary transition-colors flex items-center gap-1 disabled:opacity-50"
          >
            <X size={12} />
            <span>Restablecer a Consumidor Final</span>
          </button>
        )}
      </div>

      {/* Selector button / Active card */}
      {!selectedCustomer ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsDropdownOpen((prev) => !prev)}
              disabled={disabled}
              className={`flex-1 flex items-center justify-between h-10 px-3 text-xs bg-surface-2 border rounded-lg transition-all text-left ${
                isDropdownOpen
                  ? 'border-primary ring-1 ring-primary'
                  : 'border-border hover:border-border/80'
              } disabled:opacity-50`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-semibold text-text-primary">Consumidor Final</span>
                <span className="text-text-muted text-[11px]">(Sin documento asociado)</span>
              </div>
              <span className="text-[11px] text-primary font-medium shrink-0">
                {activeCustomers.length > 0 ? (isDropdownOpen ? 'Cerrar lista' : 'Buscar cliente') : 'Sin clientes'}
              </span>
            </button>
          </div>

          {activeCustomers.length === 0 && (
            <p className="text-[11px] text-text-muted">
              No hay clientes registrados en esta empresa. La venta se registrará a Consumidor Final.
            </p>
          )}
        </div>
      ) : (
        <div className="p-2.5 px-3 bg-surface-2 border border-primary/40 rounded-lg flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-text-primary truncate">
                {selectedCustomer.name}
              </span>
              <Badge variant="primary" size="sm" className="text-[10px]">
                {formatDoc(selectedCustomer)}
              </Badge>
            </div>
            {selectedCustomer.phone && (
              <span className="text-[11px] text-text-muted block mt-0.5 truncate">
                Tel: {selectedCustomer.phone}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => onSelectCustomer(null)}
            disabled={disabled}
            className="p-1.5 rounded-md hover:bg-surface text-text-muted hover:text-text-primary transition-colors disabled:opacity-50"
            title="Cambiar a Consumidor Final"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Dropdown list */}
      {isDropdownOpen && !selectedCustomer && activeCustomers.length > 0 && (
        <div className="border border-border bg-surface rounded-xl shadow-xl overflow-hidden mt-1.5 animate-in fade-in duration-150">
          <div className="p-2 border-b border-border bg-surface-2/50">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filtrar por nombre, documento o teléfono..."
                autoFocus
                className="w-full h-8 pl-8 pr-3 text-xs bg-surface border border-border focus:border-primary rounded-md text-text-primary focus:outline-none"
              />
            </div>
          </div>

          <div className="max-h-48 overflow-y-auto divide-y divide-border/40">
            {/* Opción explícita de Consumidor Final */}
            <button
              type="button"
              onClick={() => {
                onSelectCustomer(null);
                setIsDropdownOpen(false);
                setSearchQuery('');
              }}
              className="w-full p-2.5 px-3 text-left hover:bg-surface-2 flex items-center justify-between text-xs transition-colors"
            >
              <div>
                <span className="font-semibold text-text-primary block">Consumidor Final</span>
                <span className="text-[11px] text-text-muted">Venta estándar de mostrador sin identificación</span>
              </div>
              <Check size={14} className="text-primary shrink-0" />
            </button>

            {filteredCustomers.length === 0 ? (
              <div className="p-4 text-center text-xs text-text-muted">
                No se encontraron clientes con el criterio &quot;{searchQuery}&quot;
              </div>
            ) : (
              filteredCustomers.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    onSelectCustomer(c);
                    setIsDropdownOpen(false);
                    setSearchQuery('');
                  }}
                  className="w-full p-2.5 px-3 text-left hover:bg-surface-2 flex items-center justify-between text-xs transition-colors"
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <span className="font-semibold text-text-primary block truncate">
                      {c.name}
                    </span>
                    <span className="text-[11px] text-text-muted font-mono">
                      {formatDoc(c)}
                    </span>
                  </div>
                  <Users size={14} className="text-text-muted shrink-0" />
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
