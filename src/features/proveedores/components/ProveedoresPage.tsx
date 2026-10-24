import React, { useState, useMemo } from 'react';
import { Company } from '@/types';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatCuit } from '@/features/companies/utils/cuitValidator';
import {
  Truck,
  Search,
  Plus,
  RefreshCw,
  Mail,
  Phone,
  Edit2,
  ShieldAlert,
  Loader2,
  CheckCircle2,
  Power,
} from 'lucide-react';
import type { Supplier, UpsertSupplierInput, SupplierActionResult } from '../types';
import { SupplierFormModal } from './SupplierFormModal';

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
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [isTogglingId, setIsTogglingId] = useState<string | null>(null);

  const filteredSuppliers = useMemo(() => {
    return suppliers.filter((s) => {
      if (statusFilter === 'active' && !s.isActive) return false;
      if (statusFilter === 'inactive' && s.isActive) return false;

      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;

      const matchName = s.name.toLowerCase().includes(q);
      const matchContact = s.contactName ? s.contactName.toLowerCase().includes(q) : false;
      const matchCuit = s.taxId ? s.taxId.includes(q) : false;
      const matchEmail = s.email ? s.email.toLowerCase().includes(q) : false;

      return matchName || matchContact || matchCuit || matchEmail;
    });
  }, [suppliers, searchQuery, statusFilter]);

  const activeCount = useMemo(() => suppliers.filter((s) => s.isActive).length, [suppliers]);
  const inactiveCount = useMemo(() => suppliers.filter((s) => !s.isActive).length, [suppliers]);

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

    if (result.success) {
      setActionNotice(
        supplier.isActive
          ? `Proveedor "${supplier.name}" deshabilitado.`
          : `Proveedor "${supplier.name}" rehabilitado con éxito.`
      );
      setTimeout(() => setActionNotice(null), 4000);
    }
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
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 size={15} />
          <span>{actionNotice}</span>
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

      {/* Filter and Search Bar */}
      <div className="bg-surface border border-border rounded-xl p-3 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nombre, CUIT, contacto o correo..."
            className="w-full h-8 pl-8 pr-3 text-xs bg-surface-2 border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary"
          />
        </div>

        <div className="flex items-center gap-1 w-full sm:w-auto overflow-x-auto">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === 'all'
                ? 'bg-primary/15 text-primary-light border border-primary/30'
                : 'text-text-muted hover:text-text-primary hover:bg-surface-2'
            }`}
          >
            Todos ({suppliers.length})
          </button>
          <button
            onClick={() => setStatusFilter('active')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === 'active'
                ? 'bg-primary/15 text-primary-light border border-primary/30'
                : 'text-text-muted hover:text-text-primary hover:bg-surface-2'
            }`}
          >
            Activos ({activeCount})
          </button>
          <button
            onClick={() => setStatusFilter('inactive')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === 'inactive'
                ? 'bg-primary/15 text-primary-light border border-primary/30'
                : 'text-text-muted hover:text-text-primary hover:bg-surface-2'
            }`}
          >
            Inactivos ({inactiveCount})
          </button>
        </div>
      </div>

      {/* Content Table */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {isLoading && suppliers.length === 0 ? (
            <div className="py-16 text-center text-text-muted flex flex-col items-center gap-2">
              <Loader2 size={24} className="animate-spin text-primary" />
              <p className="text-xs">Cargando proveedores desde Supabase...</p>
            </div>
          ) : filteredSuppliers.length === 0 ? (
            <div className="py-16 text-center text-text-muted space-y-3">
              <Truck size={36} className="mx-auto text-text-muted/40" />
              <p className="text-sm font-medium text-text-secondary">
                {searchQuery
                  ? 'No se encontraron proveedores que coincidan con la búsqueda.'
                  : 'No hay proveedores registrados en esta empresa.'}
              </p>
              {isMasterAdmin && !searchQuery && (
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
                    <tr key={s.id} className="hover:bg-surface-2/40 transition-colors">
                      <td className="py-3 px-4">
                        <span className="font-semibold text-text-primary block">{s.name}</span>
                        {s.address && (
                          <span className="text-[11px] text-text-muted block truncate max-w-xs">
                            {s.address}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 font-mono text-[11px] text-text-secondary">
                        {s.taxId ? formatCuit(s.taxId) : <span className="text-text-muted">Sin CUIT</span>}
                      </td>

                      <td className="py-3 px-4 text-text-secondary">
                        {s.contactName || <span className="text-text-muted">—</span>}
                      </td>

                      <td className="py-3 px-4 space-y-0.5">
                        {s.email && (
                          <div className="flex items-center gap-1.5 text-text-secondary text-[11px]">
                            <Mail size={12} className="text-text-muted shrink-0" />
                            <a href={`mailto:${s.email}`} className="hover:text-primary transition-colors">
                              {s.email}
                            </a>
                          </div>
                        )}
                        {s.phone && (
                          <div className="flex items-center gap-1.5 text-text-secondary text-[11px]">
                            <Phone size={12} className="text-text-muted shrink-0" />
                            <span>{s.phone}</span>
                          </div>
                        )}
                        {!s.email && !s.phone && <span className="text-text-muted">—</span>}
                      </td>

                      <td className="py-3 px-4">
                        <Badge variant={s.isActive ? 'success' : 'neutral'} size="sm">
                          {s.isActive ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </td>

                      {isMasterAdmin && (
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => handleOpenEdit(s)}
                              title="Editar proveedor"
                            >
                              <Edit2 size={12} className="mr-1" />
                              <span>Editar</span>
                            </Button>

                            <Button
                              variant="outline"
                              size="sm"
                              className={`h-7 px-2 text-xs ${
                                s.isActive ? 'hover:text-danger hover:border-danger/40' : 'hover:text-emerald-400'
                              }`}
                              onClick={() => handleToggle(s)}
                              disabled={isTogglingId === s.id}
                              title={s.isActive ? 'Desactivar proveedor' : 'Reactivar proveedor'}
                            >
                              {isTogglingId === s.id ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <Power size={12} className={s.isActive ? 'text-text-muted' : 'text-emerald-400'} />
                              )}
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
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
