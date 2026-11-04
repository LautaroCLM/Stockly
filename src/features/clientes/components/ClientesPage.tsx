import React, { useState, useMemo } from 'react';
import { Company } from '@/types';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { CheckCircle2, Loader2, Plus, RefreshCw, ShieldAlert, Users } from 'lucide-react';
import type { Customer, UpsertCustomerInput, CustomerActionResult } from '../types';
import { CustomerCard } from './CustomerCard';
import { CustomerFormModal } from './CustomerFormModal';
import { CustomerFilters, filterCustomers, type CustomerStatusFilter } from './CustomerFilters';
import { CustomersEmptyState } from './CustomersEmptyState';

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
  const [statusFilter, setStatusFilter] = useState<CustomerStatusFilter>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isTogglingId, setIsTogglingId] = useState<string | null>(null);

  const filteredCustomers = useMemo(() => filterCustomers(customers, statusFilter, searchQuery), [customers, searchQuery, statusFilter]);
  const counts = useMemo(() => {
    const active = customers.filter((c) => c.isActive).length;
    return { all: customers.length, active, inactive: customers.length - active };
  }, [customers]);

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

    setActionNotice(
      result.success
        ? { type: 'success', message: customer.isActive ? `Cliente "${customer.name}" deshabilitado.` : `Cliente "${customer.name}" rehabilitado con éxito.` }
        : { type: 'error', message: result.error || 'No se pudo cambiar el estado del cliente.' }
    );
    setTimeout(() => setActionNotice(null), result.success ? 4000 : 8000);
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
        <div role={actionNotice.type === 'error' ? 'alert' : 'status'}
          className={`p-3 rounded-lg flex items-center gap-2 text-xs animate-in fade-in border ${
            actionNotice.type === 'error' ? 'bg-danger/10 border-danger/20 text-danger' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
          }`}>
          {actionNotice.type === 'error' ? <ShieldAlert className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
          <span>{actionNotice.message}</span>
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

      <CustomerFilters searchQuery={searchQuery} onSearchChange={setSearchQuery} status={statusFilter}
        onStatusChange={setStatusFilter} counts={counts} />

      {/* Listado */}
      {isLoading && customers.length === 0 ? (
        <Card className="border-border/60">
          <CardContent className="p-12 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-xs text-muted-foreground font-medium">Cargando directorio de clientes...</p>
          </CardContent>
        </Card>
      ) : filteredCustomers.length === 0 ? (
        <CustomersEmptyState hasLoadError={Boolean(error) && customers.length === 0} isDirectoryEmpty={customers.length === 0}
          canCreate={isMasterAdmin} onCreate={handleOpenCreate}
          onResetFilters={() => {
            setSearchQuery('');
            setStatusFilter('all');
          }} />
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
