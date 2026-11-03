import React, { useState, useMemo } from 'react';
import {
  ShoppingCart,
  Search,
  Plus,
  RefreshCw,
  Truck,
  Eye,
  ShieldAlert,
  Loader2,
  DollarSign,
  Package,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, formatDateShort } from '@/lib/formatters';
import type { Company } from '@/types';
import type { Supplier } from '@/features/proveedores/types';
import type { Product } from '@/features/inventario/types';
import type { Purchase, CreatePurchaseInput, PurchaseActionResult } from '../types';
import { PurchaseDetailModal } from './PurchaseDetailModal';
import { PurchaseFormModal } from './PurchaseFormModal';

interface ComprasPageProps {
  company: Company;
  purchases: Purchase[];
  suppliers: Supplier[];
  products: Product[];
  isLoading: boolean;
  error: string | null;
  syncWarning: string | null;
  isMasterAdmin: boolean;
  onReload: () => Promise<void>;
  onSavePurchase: (input: CreatePurchaseInput) => Promise<PurchaseActionResult>;
  onPurchaseSuccess?: () => void;
  onNavigateHome: () => void;
}

export const ComprasPage: React.FC<ComprasPageProps> = ({
  company,
  purchases,
  suppliers,
  products,
  isLoading,
  error,
  syncWarning,
  isMasterAdmin,
  onReload,
  onSavePurchase,
  onPurchaseSuccess,
  onNavigateHome,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const filteredPurchases = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return purchases;
    return purchases.filter((p) => {
      const matchNumber = p.purchaseNumber.toLowerCase().includes(q);
      const matchSupplier = p.supplier?.name.toLowerCase().includes(q);
      const matchInvoice = p.invoiceNumber?.toLowerCase().includes(q);
      return matchNumber || matchSupplier || matchInvoice;
    });
  }, [purchases, searchQuery]);

  const totalSpent = useMemo(
    () => purchases.reduce((acc, p) => acc + (p.status === 'completed' ? p.totalAmount : 0), 0),
    [purchases]
  );

  if (!isMasterAdmin) {
    return (
      <div className="flex-1 p-6 flex items-center justify-center">
        <div className="max-w-md w-full text-center space-y-4 p-8 bg-surface border border-border rounded-2xl shadow-xl">
          <div className="w-12 h-12 rounded-2xl bg-danger/10 border border-danger/20 flex items-center justify-center text-danger mx-auto">
            <ShieldAlert size={24} />
          </div>
          <h2 className="text-lg font-bold text-text-primary">Acceso Restringido</h2>
          <p className="text-xs text-text-muted">
            El módulo de Compras a Proveedores y la consulta de costos de adquisición son exclusivos para administradores de la empresa ({company.name}).
          </p>
          <Button variant="secondary" size="sm" onClick={onNavigateHome}>
            Volver al Inicio
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 sm:p-6 space-y-5 overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <ShoppingCart className="text-primary" size={22} />
            Compras a Proveedores
          </h1>
          <p className="text-xs text-text-muted">
            Registro de compras y abastecimiento de stock en {company.name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => onReload()} disabled={isLoading}>
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </Button>
          <Button variant="primary" size="sm" onClick={() => setIsFormOpen(true)} className="flex items-center gap-1.5">
            <Plus size={15} />
            <span>Nueva Compra</span>
          </Button>
        </div>
      </div>

      {syncWarning && (
        <div className="p-3 bg-warning/10 border border-warning/20 rounded-xl text-warning text-xs">
          {syncWarning}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Card className="border-border bg-surface">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Package size={20} />
            </div>
            <div>
              <p className="text-[11px] text-text-muted">Compras Realizadas</p>
              <p className="text-lg font-bold text-text-primary">{purchases.length}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-surface">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-success/10 border border-success/20 flex items-center justify-center text-success">
              <DollarSign size={20} />
            </div>
            <div>
              <p className="text-[11px] text-text-muted">Total Invertido en Stock</p>
              <p className="text-lg font-bold text-text-primary font-mono">{formatCurrency(totalSpent)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-surface sm:col-span-2 lg:col-span-1">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
              <Truck size={20} />
            </div>
            <div>
              <p className="text-[11px] text-text-muted">Proveedores Activos</p>
              <p className="text-lg font-bold text-text-primary">
                {suppliers.filter((s) => s.isActive).length}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search Bar */}
      <div className="flex items-center gap-2 bg-surface p-2 rounded-xl border border-border">
        <Search size={16} className="text-text-muted ml-2 shrink-0" />
        <input
          type="text"
          placeholder="Buscar por número de compra, proveedor o factura..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 bg-transparent text-xs text-text-primary focus:outline-none placeholder:text-text-muted"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="text-[11px] text-text-muted hover:text-text-primary px-2"
          >
            Limpiar
          </button>
        )}
      </div>

      {/* Content Table / States */}
      {isLoading && purchases.length === 0 ? (
        <div className="py-16 text-center text-text-muted flex flex-col items-center justify-center gap-2">
          <Loader2 size={24} className="animate-spin text-primary" />
          <span className="text-xs">Cargando compras a proveedores...</span>
        </div>
      ) : error ? (
        <div className="p-6 text-center border border-danger/20 rounded-2xl bg-danger/5 space-y-3">
          <p className="text-xs text-danger font-medium">{error}</p>
          <Button variant="secondary" size="sm" onClick={() => onReload()}>
            Reintentar
          </Button>
        </div>
      ) : filteredPurchases.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-border rounded-2xl bg-surface/40 space-y-3">
          <ShoppingCart size={32} className="mx-auto text-text-muted opacity-50" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-text-primary">
              {searchQuery ? 'No se encontraron compras' : 'Sin compras registradas'}
            </p>
            <p className="text-xs text-text-muted">
              {searchQuery
                ? 'Pruebe con otro término de búsqueda.'
                : 'Registre la primera compra para ingresar stock formal a su inventario.'}
            </p>
          </div>
          {!searchQuery && (
            <Button variant="primary" size="sm" onClick={() => setIsFormOpen(true)}>
              <Plus size={14} className="mr-1.5" /> Registrar Primera Compra
            </Button>
          )}
        </div>
      ) : (
        <div className="border border-border rounded-xl bg-surface overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-2/70 border-b border-border text-[11px] font-semibold text-text-muted uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Nro. Compra</th>
                  <th className="py-3 px-4">Fecha</th>
                  <th className="py-3 px-4">Proveedor</th>
                  <th className="py-3 px-4">Factura / Remito</th>
                  <th className="py-3 px-4 text-center">Ítems</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredPurchases.map((p) => (
                  <tr key={p.id} className="hover:bg-surface-2/40 transition-colors">
                    <td className="py-3 px-4 font-mono font-semibold text-text-primary">
                      {p.purchaseNumber}
                    </td>
                    <td className="py-3 px-4 text-text-secondary whitespace-nowrap">
                      {formatDateShort(p.purchaseDate || p.createdAt)}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-text-primary">{p.supplier?.name || '-'}</div>
                      {p.supplier?.taxId && (
                        <div className="text-[10px] text-text-muted font-mono">CUIT: {p.supplier.taxId}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-text-secondary font-mono">
                      {p.invoiceNumber || <span className="text-text-muted">-</span>}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Badge variant="neutral" size="sm">
                        {p.items?.length || 0}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-text-primary font-mono whitespace-nowrap">
                      {formatCurrency(p.totalAmount)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setSelectedPurchase(p);
                          setIsDetailOpen(true);
                        }}
                        className="h-7 px-2.5 text-[11px]"
                      >
                        <Eye size={13} className="mr-1" /> Detalle
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      <PurchaseDetailModal
        isOpen={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
          setSelectedPurchase(null);
        }}
        purchase={selectedPurchase}
      />

      <PurchaseFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        suppliers={suppliers}
        products={products}
        onSavePurchase={onSavePurchase}
        onSuccess={onPurchaseSuccess}
      />
    </div>
  );
};
