import React, { useState, useEffect } from 'react';
import { Loader2, Plus, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { CancelDocumentModal } from '@/components/shared/CancelDocumentModal';
import { formatCurrency } from '@/lib/formatters';
import type { Company } from '@/types';
import type { Supplier } from '@/features/proveedores/types';
import type { Product } from '@/features/inventario/types';
import type { Purchase } from '../types';
import { usePurchases } from '../hooks/usePurchases';
import { cancelPurchaseRpc } from '../api/purchaseCancellationApi';
import { PurchaseDetailModal } from './PurchaseDetailModal';
import { PurchaseFormModal } from './PurchaseFormModal';
import { PurchasesSummaryCards } from './PurchasesSummaryCards';
import { PurchasesTable } from './PurchasesTable';
import { ComprasAccessDenied, ComprasHeader, ComprasSearchBar } from './ComprasHeader';

interface ComprasPageProps {
  company: Company;
  /** Catálogo completo de proveedores: la búsqueda por nombre o CUIT se resuelve contra él. */
  suppliers: Supplier[];
  products: Product[];
  canView: boolean;
  canOperate: boolean;
  /** Se invoca al registrar o anular una compra (el stock cambió). */
  onStockChanged: () => void;
  onNavigateHome: () => void;
}

const SEARCH_DEBOUNCE_MS = 300;

export const ComprasPage: React.FC<ComprasPageProps> = ({
  company,
  suppliers,
  products,
  canView,
  canOperate,
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
  } = usePurchases(company.id, canView, canOperate, suppliers);
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

  if (!canView) {
    return <ComprasAccessDenied companyName={company.name} onNavigateHome={onNavigateHome} />;
  }

  return (
    <div className="space-y-5 max-w-7xl mx-auto pb-12">
      <ComprasHeader companyName={company.name} isLoading={isLoading} onReload={() => void onReload()} onNewPurchase={() => setIsFormOpen(true)} canCreate={canOperate} />

      <PurchasesSummaryCards summary={summary} activeSuppliers={suppliers.filter((s) => s.isActive).length} />

      <ComprasSearchBar value={searchQuery} onChange={setSearchQuery} />

      {/* Content Table / States */}
      {error && purchases.length > 0 && (
        <div className="p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs flex items-center justify-between gap-2">
          <span>{error}</span>
          <Button variant="secondary" size="sm" onClick={() => onReload()}>
            Reintentar
          </Button>
        </div>
      )}

      {isLoading && purchases.length === 0 ? (
        <div className="py-16 text-center text-text-muted flex flex-col items-center justify-center gap-2">
          <Loader2 size={24} className="animate-spin text-primary" />
          <span className="text-xs">Cargando compras a proveedores...</span>
        </div>
      ) : error && purchases.length === 0 ? (
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
          {!searchQuery && canOperate && (
            <Button variant="primary" size="sm" onClick={() => setIsFormOpen(true)}>
              <Plus size={14} className="mr-1.5" /> Registrar Primera Compra
            </Button>
          )}
        </div>
      ) : (
        <PurchasesTable
          purchases={purchases}
          total={total}
          hasMore={hasMore}
          isLoadingMore={isLoadingMore}
          onLoadMore={loadMore}
          onViewDetail={(p) => {
            setSelectedPurchase(p);
            setIsDetailOpen(true);
          }}
          onCancel={setPurchaseToCancel}
          canCancel={canOperate}
        />
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
