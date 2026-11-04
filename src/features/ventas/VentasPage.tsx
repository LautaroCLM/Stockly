import React, { useEffect, useMemo, useState } from 'react';
import { Sale } from '../inventario/types';
import { Company } from '@/types';
import type { Customer } from '@/features/clientes/types';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/formatters';
import { fromHundredths, toHundredths } from '@/lib/decimal';
import { useSalesHistory } from './hooks/useSalesHistory';
import { cancelSaleRpc } from './api/saleCancellationApi';
import { CancelDocumentModal } from '@/components/shared/CancelDocumentModal';
import { AlertTriangle, Loader2, Search } from 'lucide-react';
import { VentasHeader } from './components/VentasHeader';
import { SaleRow } from './components/SaleRow';

interface VentasPageProps {
  company: Company;
  /** Catálogo completo de clientes: la búsqueda por nombre o documento se resuelve contra él. */
  customers: Customer[];
  isMasterAdmin: boolean;
  onViewReceipt: (sale: Sale) => void;
  onNavigateToInventario: () => void;
  /** Se invoca tras anular una venta (el stock cambió). */
  onSaleCancelled: () => void;
}

const SEARCH_DEBOUNCE_MS = 300;

export const VentasPage: React.FC<VentasPageProps> = ({
  company,
  customers,
  isMasterAdmin,
  onViewReceipt,
  onNavigateToInventario,
  onSaleCancelled,
}) => {
  const [saleToCancel, setSaleToCancel] = useState<Sale | null>(null);
  // Paginación y búsqueda se resuelven en el servidor (ver useSalesHistory)
  const { sales, total, hasMore, isLoading, isLoadingMore, error, setSearch, loadMore, reload } =
    useSalesHistory(company.id, customers);

  // El texto se envía al servidor recién cuando el usuario deja de escribir
  const [searchQuery, setSearchQuery] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchQuery), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchQuery, setSearch]);

  // Suma exacta en centavos de las ventas completadas cargadas en pantalla (sin anuladas)
  const completedShown = useMemo(() => sales.filter((sale) => sale.status === 'completada'), [sales]);
  const totalShown = useMemo(
    () => fromHundredths(completedShown.reduce((acc, sale) => acc + toHundredths(sale.total), 0)),
    [completedShown]
  );

  const handleConfirmCancel = async (sale: Sale, reason: string) => {
    const result = await cancelSaleRpc(company.id, sale.id, reason);
    if (result.status === 'cancelled') {
      reload();
      onSaleCancelled();
    }
    return result;
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-12">
      <VentasHeader companyName={company.name} completedCount={completedShown.length} completedTotal={totalShown} onNewSale={onNavigateToInventario} />

      {error && (
        <div className="p-3.5 bg-danger/10 border border-danger/30 rounded-xl flex items-center justify-between text-xs text-danger">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
          <Button variant="secondary" size="sm" onClick={reload} className="h-7 px-2.5 text-xs">
            Reintentar
          </Button>
        </div>
      )}

      {/* Search Bar */}
      <div className="bg-surface border border-border rounded-xl p-3 flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por N° de venta (ej: VTA-00000001) o nombre de cliente..."
            className="w-full h-8 pl-8 pr-3 text-xs bg-surface-2 border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary"
          />
        </div>

        <div className="text-xs text-text-muted">
          Mostrando <strong className="text-text-primary tabular-nums">{sales.length}</strong> de{' '}
          <strong className="text-text-primary tabular-nums">{total}</strong> ventas
        </div>
      </div>

      {/* Sales Table */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-surface-2/40 text-[11px] font-semibold text-text-muted uppercase tracking-wider">
                  <th className="py-2.5 px-4">Comprobante</th>
                  <th className="py-2.5 px-3">Fecha y Hora</th>
                  <th className="py-2.5 px-3">Cliente</th>
                  <th className="py-2.5 px-3 text-center">Ítems</th>
                  <th className="py-2.5 px-3">Medios de Pago</th>
                  <th className="py-2.5 px-4 text-right">Total</th>
                  <th className="py-2.5 px-4 text-center">Acciones</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-border/60 text-xs">
                {isLoading && sales.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-text-muted">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 size={16} className="animate-spin text-primary" />
                        <span>Cargando ventas...</span>
                      </div>
                    </td>
                  </tr>
                ) : sales.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-text-muted">
                      {error
                        ? 'No se pudieron cargar las ventas. Usá Reintentar en el aviso de arriba.'
                        : 'No se registraron ventas coincidentes para esta empresa.'}
                    </td>
                  </tr>
                ) : (
                  sales.map((sale) => (
                    <SaleRow key={sale.id} sale={sale} canCancel={isMasterAdmin} onViewReceipt={onViewReceipt} onCancel={setSaleToCancel} />
                  ))
                )}
              </tbody>
            </table>
          </div>

          {hasMore && !isLoading && (
            <div className="p-3 border-t border-border/60 flex items-center justify-center">
              <Button variant="secondary" size="sm" onClick={loadMore} disabled={isLoadingMore}>
                {isLoadingMore ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <span>Cargar más ({total - sales.length} restantes)</span>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <CancelDocumentModal
        isOpen={saleToCancel !== null}
        title="Anular venta"
        documentNumber={saleToCancel?.saleNumber ?? ''}
        details={[
          { label: 'Cliente', value: saleToCancel?.clientName ?? '' },
          { label: 'Total', value: formatCurrency(saleToCancel?.total ?? 0) },
        ]}
        impactText={`Se van a reponer ${saleToCancel?.items.reduce((acc, item) => acc + item.quantity, 0) ?? 0} unidades al stock.`}
        onClose={() => setSaleToCancel(null)}
        onConfirm={(reason) => handleConfirmCancel(saleToCancel as Sale, reason)}
      />
    </div>
  );
};
