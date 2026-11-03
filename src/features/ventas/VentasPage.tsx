import React, { useEffect, useMemo, useState } from 'react';
import { Sale } from '../inventario/types';
import { Company } from '@/types';
import type { Customer } from '@/features/clientes/types';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, formatDateTime } from '@/lib/formatters';
import { fromHundredths, toHundredths } from '@/lib/decimal';
import { useSalesHistory } from './hooks/useSalesHistory';
import { cancelSaleRpc } from './api/saleCancellationApi';
import { CancelSaleModal } from './components/CancelSaleModal';
import {
  Receipt,
  Search,
  Eye,
  Info,
  Loader2,
  AlertTriangle,
  Ban,
} from 'lucide-react';

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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border/60">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/25 flex items-center justify-center text-accent">
            <Receipt size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-text-primary">
                Historial de Ventas y Comprobantes
              </h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-surface-2 text-text-muted border border-border">
                {company.name}
              </span>
            </div>
            <p className="text-xs text-text-muted mt-0.5">
              Registro inmutable de transacciones completadas y reimpresión de comprobantes.
            </p>
          </div>
        </div>

        <Button
          variant="primary"
          size="sm"
          onClick={onNavigateToInventario}
          className="shadow-sm"
        >
          <span>Nueva Venta</span>
        </Button>
      </div>

      {/* Info notice about Phase 5 */}
      <div className="bg-surface-2/60 border border-border rounded-xl p-3 px-4 flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-text-secondary">
          <Info size={15} className="text-primary shrink-0" />
          <span>
            <strong>Control Inmutable:</strong> Las ventas no se editan. Un administrador puede anularlas indicando el motivo: el stock se repone y la venta queda en el historial como anulada.
          </span>
        </div>
        <span className="text-[11px] text-text-muted font-mono shrink-0">
          Total de las {completedShown.length} ventas completadas mostradas: {formatCurrency(totalShown)}
        </span>
      </div>

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
            placeholder="Buscar por N° de venta (ej: V-0842) o nombre de cliente..."
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
                      No se registraron ventas coincidentes para esta empresa.
                    </td>
                  </tr>
                ) : (
                  sales.map((sale) => (
                    <tr
                      key={sale.id}
                      className="hover:bg-surface-2/50 transition-colors group"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-text-primary text-xs">
                            {sale.saleNumber}
                          </span>
                          {sale.status === 'anulada' && (
                            <Badge variant="danger" size="sm" title={sale.cancelReason ?? undefined}>
                              Anulada
                            </Badge>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-3 text-text-secondary">
                        {formatDateTime(sale.createdAt)}
                      </td>

                      <td className="py-3 px-3">
                        <span className="font-medium text-text-primary">
                          {sale.clientName}
                        </span>
                      </td>

                      <td className="py-3 px-3 text-center">
                        <Badge variant="neutral" size="sm">
                          {sale.items.reduce((acc, i) => acc + i.quantity, 0)} u.
                        </Badge>
                      </td>

                      <td className="py-3 px-3">
                        <div className="flex flex-wrap gap-1">
                          {sale.payments.map((p, pIdx) => (
                            <Badge
                              key={pIdx}
                              variant={p.method === 'efectivo' ? 'success' : 'accent'}
                              size="sm"
                              className="capitalize text-[10px]"
                            >
                              {p.method}
                            </Badge>
                          ))}
                        </div>
                      </td>

                      <td
                        className={`py-3 px-4 text-right font-bold tabular-nums ${
                          sale.status === 'anulada' ? 'text-text-muted line-through' : 'text-text-primary'
                        }`}
                      >
                        {formatCurrency(sale.total)}
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-1.5">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => onViewReceipt(sale)}
                            className="h-7 px-2.5 text-xs gap-1"
                            title="Ver ticket de venta"
                          >
                            <Eye size={13} />
                            <span>Ticket</span>
                          </Button>
                          {isMasterAdmin && sale.status === 'completada' && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setSaleToCancel(sale)}
                              className="h-7 px-2.5 text-xs gap-1 hover:text-danger"
                              title="Anular venta"
                            >
                              <Ban size={13} />
                              <span>Anular</span>
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
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

      <CancelSaleModal
        sale={saleToCancel}
        onClose={() => setSaleToCancel(null)}
        onConfirm={handleConfirmCancel}
      />
    </div>
  );
};
