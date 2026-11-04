import React, { useState, useMemo } from 'react';
import { Company } from '@/types';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { CheckCircle2, Loader2, Plus, RefreshCw, ShieldAlert, Truck } from 'lucide-react';
import type { Supplier, UpsertSupplierInput, SupplierActionResult } from '../types';
import { SupplierFormModal } from './SupplierFormModal';
import { SupplierRow } from './SupplierRow';
import { SupplierFilters, filterSuppliers, type SupplierStatusFilter } from './SupplierFilters';

interface ProveedoresPageProps {
  company: Company;
  suppliers: Supplier[];
  isLoading: boolean;
  error: string | null;
  isMasterAdmin: boolean;
  onReload: () => Promise<void>;
  onSaveSupplier: (input: Omit<UpsertSupplierInput, 'companyId'>) => Promise<SupplierActionResult>;
  onToggleStatus: (supplier: Supplier, newStatus: boolean) => Promise<SupplierActionResult>;
}

export const ProveedoresPage: React.FC<ProveedoresPageProps> = ({
  company,
  suppliers,
  isLoading,
  error,
  isMasterAdmin,
  onReload,
  onSaveSupplier,
  onToggleStatus,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<SupplierStatusFilter>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isTogglingId, setIsTogglingId] = useState<string | null>(null);

  const filteredSuppliers = useMemo(() => filterSuppliers(suppliers, statusFilter, searchQuery), [suppliers, searchQuery, statusFilter]);
  const counts = useMemo(() => {
    const active = suppliers.filter((s) => s.isActive).length;
    return { all: suppliers.length, active, inactive: suppliers.length - active };
  }, [suppliers]);

  const handleOpenCreate = () => {
    setEditingSupplier(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setIsModalOpen(true);
  };

  const handleToggle = async (supplier: Supplier) => {
    setIsTogglingId(supplier.id);
    const result = await onToggleStatus(supplier, !supplier.isActive);
    setIsTogglingId(null);

    setActionNotice(
      result.success
        ? { type: 'success', message: supplier.isActive ? `Proveedor "${supplier.name}" deshabilitado.` : `Proveedor "${supplier.name}" rehabilitado con éxito.` }
        : { type: 'error', message: result.error || 'No se pudo cambiar el estado del proveedor.' }
    );
    setTimeout(() => setActionNotice(null), result.success ? 4000 : 8000);
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border/60">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-center text-primary">
            <Truck size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-text-primary">
                Gestión de Proveedores
              </h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-surface-2 text-text-muted border border-border">
                {company.name}
              </span>
            </div>
            <p className="text-xs text-text-muted mt-0.5">
              Fichas comerciales, datos fiscales y condiciones de compra por empresa.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onReload}
            disabled={isLoading}
            title="Recargar proveedores"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
          </Button>

          {isMasterAdmin ? (
            <Button
              variant="primary"
              size="sm"
              onClick={handleOpenCreate}
              className="shadow-sm"
            >
              <Plus size={14} className="mr-1" />
              <span>Nuevo Proveedor</span>
            </Button>
          ) : (
            <span className="text-[11px] text-text-muted bg-surface-2 px-2.5 py-1.5 rounded-lg border border-border">
              Solo lectura (Rol Empleado)
            </span>
          )}
        </div>
      </div>

      {/* Action Notification */}
      {actionNotice && (
        <div role={actionNotice.type === 'error' ? 'alert' : 'status'}
          className={`p-3 rounded-xl text-xs flex items-center gap-2 animate-in fade-in border ${
            actionNotice.type === 'error' ? 'bg-danger/10 border-danger/20 text-danger' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
          }`}>
          {actionNotice.type === 'error' ? <ShieldAlert size={15} /> : <CheckCircle2 size={15} />}
          <span>{actionNotice.message}</span>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-xl bg-danger/10 border border-danger/20 text-danger text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldAlert size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
          <Button variant="outline" size="sm" onClick={onReload} className="text-xs shrink-0">
            Reintentar
          </Button>
        </div>
      )}

      <SupplierFilters searchQuery={searchQuery} onSearchChange={setSearchQuery} status={statusFilter}
        onStatusChange={setStatusFilter} counts={counts} />

      {/* Content Table */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {isLoading && suppliers.length === 0 ? (
            <div className="py-16 text-center text-text-muted flex flex-col items-center gap-2">
              <Loader2 size={24} className="animate-spin text-primary" />
              <p className="text-xs">Cargando proveedores...</p>
            </div>
          ) : filteredSuppliers.length === 0 ? (
            <div className="py-16 text-center text-text-muted space-y-3">
              <Truck size={36} className="mx-auto text-text-muted/40" />
              <p className="text-sm font-medium text-text-secondary">
                {error && suppliers.length === 0
                  ? 'No se pudieron cargar los proveedores.'
                  : searchQuery
                    ? 'No se encontraron proveedores que coincidan con la búsqueda.'
                    : 'No hay proveedores registrados en esta empresa.'}
              </p>
              {isMasterAdmin && !searchQuery && !error && (
                <Button variant="primary" size="sm" onClick={handleOpenCreate}>
                  <Plus size={14} className="mr-1" />
                  <span>Crear Primer Proveedor</span>
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-2/60 text-text-muted uppercase tracking-wider font-semibold border-b border-border text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Razón Social / Nombre</th>
                    <th className="py-3 px-4">CUIT</th>
                    <th className="py-3 px-4">Contacto</th>
                    <th className="py-3 px-4">Canales de Contacto</th>
                    <th className="py-3 px-4">Estado</th>
                    {isMasterAdmin && <th className="py-3 px-4 text-right">Acciones</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredSuppliers.map((s) => (
                    <SupplierRow key={s.id} supplier={s} canManage={isMasterAdmin} isToggling={isTogglingId === s.id}
                      onEdit={handleOpenEdit} onToggle={(sup) => void handleToggle(sup)} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit / Create Modal */}
      <SupplierFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        supplier={editingSupplier}
        onSave={onSaveSupplier}
      />
    </div>
  );
};
