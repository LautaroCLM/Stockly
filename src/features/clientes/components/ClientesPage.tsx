import React, { useState, useMemo } from 'react';
import { Company } from '@/types';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  Users,
  Search,
  Plus,
  RefreshCw,
  ShieldAlert,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import type { Customer, UpsertCustomerInput, CustomerActionResult } from '../types';
import { CustomerCard } from './CustomerCard';
import { CustomerFormModal } from './CustomerFormModal';

interface ClientesPageProps {
  company: Company;
  customers: Customer[];
  isLoading: boolean;
  error: string | null;
  isMasterAdmin: boolean;
  onReload: () => Promise<void>;
  onSaveCustomer: (input: Omit<UpsertCustomerInput, 'companyId'>) => Promise<CustomerActionResult>;
  onToggleStatus: (customer: Customer, newStatus: boolean) => Promise<CustomerActionResult>;
}

export const ClientesPage: React.FC<ClientesPageProps> = ({
  company,
  customers,
  isLoading,
  error,
  isMasterAdmin,
  onReload,
  onSaveCustomer,
  onToggleStatus,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [isTogglingId, setIsTogglingId] = useState<string | null>(null);

  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      if (statusFilter === 'active' && !c.isActive) return false;
      if (statusFilter === 'inactive' && c.isActive) return false;

      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;

      const matchName = c.name.toLowerCase().includes(q);
      const matchTaxId = c.taxId ? c.taxId.toLowerCase().includes(q) : false;
      const matchEmail = c.email ? c.email.toLowerCase().includes(q) : false;
      const matchPhone = c.phone ? c.phone.toLowerCase().includes(q) : false;
      const matchAddress = c.address ? c.address.toLowerCase().includes(q) : false;

      return matchName || matchTaxId || matchEmail || matchPhone || matchAddress;
    });
  }, [customers, searchQuery, statusFilter]);

  const activeCount = useMemo(() => customers.filter((c) => c.isActive).length, [customers]);
  const inactiveCount = useMemo(() => customers.filter((c) => !c.isActive).length, [customers]);

  const handleOpenCreate = () => {
    setEditingCustomer(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setIsModalOpen(true);
  };

  const handleToggle = async (customer: Customer) => {
    setIsTogglingId(customer.id);
    const result = await onToggleStatus(customer, !customer.isActive);
    setIsTogglingId(null);

    if (result.success) {
      setActionNotice(
        customer.isActive
          ? `Cliente "${customer.name}" deshabilitado.`
          : `Cliente "${customer.name}" rehabilitado con éxito.`
      );
      setTimeout(() => setActionNotice(null), 4000);
    }
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border/60">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Directorio de Clientes
            </h1>
            <p className="text-xs text-muted-foreground">
              Gestión de clientes comerciales y cuentas para {company.name}.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onReload}
            disabled={isLoading}
            className="h-9 px-3 gap-1.5 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </Button>

          {isMasterAdmin && (
            <Button
              size="sm"
              onClick={handleOpenCreate}
              className="h-9 px-3 gap-1.5 text-xs font-medium shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Nuevo cliente</span>
            </Button>
          )}
        </div>
      </div>

      {/* Info rol empleado */}
      {!isMasterAdmin && (
        <div className="p-3 bg-muted/40 border border-border/80 rounded-lg flex items-center gap-2.5 text-xs text-muted-foreground">
          <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
          <span>
            Acceso de consulta (rol empleado). Para registrar o modificar clientes comuníquese con un Administrador.
          </span>
        </div>
      )}

      {/* Notificación de acción */}
      {actionNotice && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg flex items-center gap-2 text-xs animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-destructive">
              <ShieldAlert className="w-5 h-5 shrink-0" />
              <div className="text-xs">
                <p className="font-semibold">Ocurrió un error al cargar los clientes</p>
                <p className="text-muted-foreground mt-0.5">{error}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={onReload} className="text-xs">
              Reintentar
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por nombre, documento, correo o teléfono..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-input bg-card text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div className="flex items-center gap-1.5 self-start sm:self-auto bg-muted/30 p-1 rounded-lg border border-border/60">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${
              statusFilter === 'all'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Todos ({customers.length})
          </button>
          <button
            onClick={() => setStatusFilter('active')}
            className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${
              statusFilter === 'active'
                ? 'bg-card text-emerald-500 shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Activos ({activeCount})
          </button>
          <button
            onClick={() => setStatusFilter('inactive')}
            className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${
              statusFilter === 'inactive'
                ? 'bg-card text-muted-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Inactivos ({inactiveCount})
          </button>
        </div>
      </div>

      {/* Listado */}
      {isLoading ? (
        <Card className="border-border/60">
          <CardContent className="p-12 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-xs text-muted-foreground font-medium">Cargando directorio de clientes...</p>
          </CardContent>
        </Card>
      ) : filteredCustomers.length === 0 ? (
        <Card className="border-border/60 bg-card/50">
          <CardContent className="p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-muted/60 text-muted-foreground flex items-center justify-center mx-auto mb-3">
              <Users className="w-6 h-6" />
            </div>
            {customers.length === 0 ? (
              <div>
                <h3 className="text-sm font-semibold text-foreground">No hay clientes registrados</h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                  Comience agregando clientes a la empresa para asociarlos a ventas y presupuestos.
                </p>
                {isMasterAdmin && (
                  <Button size="sm" onClick={handleOpenCreate} className="mt-4 text-xs gap-1.5">
                    <Plus className="w-4 h-4" />
                    <span>Registrar primer cliente</span>
                  </Button>
                )}
              </div>
            ) : (
              <div>
                <h3 className="text-sm font-semibold text-foreground">Sin resultados</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Ningún cliente coincide con los filtros aplicados.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('all');
                  }}
                  className="mt-3 text-xs"
                >
                  Restablecer filtros
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredCustomers.map((cust) => (
            <CustomerCard
              key={cust.id}
              customer={cust}
              isMasterAdmin={isMasterAdmin}
              isToggling={isTogglingId === cust.id}
              onEdit={handleOpenEdit}
              onToggleStatus={handleToggle}
            />
          ))}
        </div>
      )}

      {/* Form Modal */}
      <CustomerFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        customer={editingCustomer}
        onSave={onSaveCustomer}
      />
    </div>
  );
};
