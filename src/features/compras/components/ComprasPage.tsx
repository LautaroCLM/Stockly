import React, { useState, useEffect } from 'react';
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
  Ban,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { CancelDocumentModal } from '@/components/shared/CancelDocumentModal';
import { formatCurrency, formatDateShort } from '@/lib/formatters';
import type { Company } from '@/types';
import type { Supplier } from '@/features/proveedores/types';
import type { Product } from '@/features/inventario/types';
import type { Purchase } from '../types';
import { usePurchases } from '../hooks/usePurchases';
import { cancelPurchaseRpc } from '../api/purchaseCancellationApi';
import { PurchaseDetailModal } from './PurchaseDetailModal';
import { PurchaseFormModal } from './PurchaseFormModal';

interface ComprasPageProps {
  company: Company;
  /** Catálogo completo de proveedores: la búsqueda por nombre o CUIT se resuelve contra él. */
  suppliers: Supplier[];
  products: Product[];
  isMasterAdmin: boolean;
  /** Se invoca al registrar o anular una compra (el stock cambió). */
  onStockChanged: () => void;
  onNavigateHome: () => void;
}

const SEARCH_DEBOUNCE_MS = 300;

export const ComprasPage: React.FC<ComprasPageProps> = ({
  company,
  suppliers,
  products,
  isMasterAdmin,
  onStockChanged,
  onNavigateHome,
}) => {
  // Paginación, búsqueda y resumen se resuelven en el servidor (ver usePurchases)
  const {
    purchases,
    total,
    summary,
    hasMore,
    isLoading,
    isLoadingMore,
    error,
    setSearch,
    loadMore,
    reloadPurchases,
    createPurchase,
  } = usePurchases(company.id, isMasterAdmin, suppliers);
  const onReload = reloadPurchases;

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [purchaseToCancel, setPurchaseToCancel] = useState<Purchase | null>(null);

  // El texto se envía al servidor recién cuando el usuario deja de escribir
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchQuery), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchQuery, setSearch]);

  const handleConfirmCancel = async (purchase: Purchase, reason: string) => {
    const result = await cancelPurchaseRpc(company.id, purchase.id, reason);
    if (result.status === 'cancelled') {
      reloadPurchases();
      onStockChanged();
    }
    return result;
  };

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
    <div className="space-y-5 max-w-7xl mx-auto pb-12">
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

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Card className="border-border bg-surface">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Package size={20} />
            </div>
            <div>
              <p className="text-[11px] text-text-muted">Compras Realizadas</p>
              <p className="text-lg font-bold text-text-primary">{summary ? summary.count : '...'}</p>
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
              <p className="text-lg font-bold text-text-primary font-mono">
                {summary ? formatCurrency(summary.total) : '...'}
              </p>
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
      ) : purchases.length === 0 ? (
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
                {purchases.map((p) => (
                  <tr key={p.id} className="hover:bg-surface-2/40 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-semibold text-text-primary">{p.purchaseNumber}</span>
                        {p.status === 'cancelled' && (
                          <Badge variant="danger" size="sm" title={p.cancelReason ?? undefined}>
                            Anulada
                          </Badge>
                        )}
                      </div>
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
                    <td
                      className={`py-3 px-4 text-right font-bold font-mono whitespace-nowrap ${
                        p.status === 'cancelled' ? 'text-text-muted line-through' : 'text-text-primary'
                      }`}
                    >
                      {formatCurrency(p.totalAmount)}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center gap-1.5">
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
                        {p.status === 'completed' && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setPurchaseToCancel(p)}
                            className="h-7 px-2.5 text-[11px] hover:text-danger"
                            title="Anular compra"
                          >
                            <Ban size={13} className="mr-1" /> Anular
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-3 border-t border-border/60 flex items-center justify-between gap-3 text-[11px] text-text-muted">
            <span>
              Mostrando <strong className="text-text-primary tabular-nums">{purchases.length}</strong> de{' '}
              <strong className="text-text-primary tabular-nums">{total}</strong> compras
            </span>
            {hasMore && (
              <Button variant="secondary" size="sm" onClick={loadMore} disabled={isLoadingMore}>
                {isLoadingMore ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <span>Cargar más ({total - purchases.length} restantes)</span>
                )}
              </Button>
            )}
          </div>
        </div>
      )}

      <CancelDocumentModal
        isOpen={purchaseToCancel !== null}
        title="Anular compra"
        documentNumber={purchaseToCancel?.purchaseNumber ?? ''}
        details={[
          { label: 'Proveedor', value: purchaseToCancel?.supplier?.name ?? '-' },
          { label: 'Total', value: formatCurrency(purchaseToCancel?.totalAmount ?? 0) },
        ]}
        impactText={`Se van a descontar del stock ${
          purchaseToCancel?.items?.reduce((acc, item) => acc + item.quantity, 0) ?? 0
        } unidades ingresadas por esta compra. Si ya se vendieron y la empresa no admite stock negativo, la anulación se rechaza.`}
        onClose={() => setPurchaseToCancel(null)}
        onConfirm={(reason) => handleConfirmCancel(purchaseToCancel as Purchase, reason)}
      />

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
        onSavePurchase={createPurchase}
        onSuccess={onStockChanged}
      />
    </div>
  );
};
