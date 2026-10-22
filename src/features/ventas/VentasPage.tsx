import React, { useState, useMemo } from 'react';
import { Sale } from '../inventario/types';
import { Company } from '@/types';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, formatDateTime } from '@/lib/formatters';
import {
  Receipt,
  Search,
  Eye,
  Info,
} from 'lucide-react';

interface VentasPageProps {
  company: Company;
  sales: Sale[];
  onViewReceipt: (sale: Sale) => void;
  onNavigateToInventario: () => void;
}

export const VentasPage: React.FC<VentasPageProps> = ({
  company,
  sales,
  onViewReceipt,
  onNavigateToInventario,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  // Filter sales for this company
  const companySales = useMemo(() => {
    return sales.filter((s) => s.tenantId === company.id);
  }, [sales, company.id]);

  // Filter by search query
  const filteredSales = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return companySales;
    return companySales.filter(
      (s) =>
        s.saleNumber.toLowerCase().includes(q) ||
        s.clientName.toLowerCase().includes(q)
    );
  }, [companySales, searchQuery]);

  const totalBilled = useMemo(() => {
    return filteredSales.reduce((acc, curr) => acc + curr.total, 0);
  }, [filteredSales]);

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
            <strong>Control Inmutable:</strong> La anulación de comprobantes, notas de crédito y reversión automática en stock_movements se incorporarán en la Fase 5.
          </span>
        </div>
        <span className="text-[11px] text-text-muted font-mono shrink-0">
          Total listado: {formatCurrency(totalBilled)}
        </span>
      </div>

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
          <strong className="text-text-primary tabular-nums">{filteredSales.length}</strong> ventas registradas
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
                {filteredSales.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-text-muted">
                      No se registraron ventas coincidentes para esta empresa.
                    </td>
                  </tr>
                ) : (
                  filteredSales.map((sale) => (
                    <tr
                      key={sale.id}
                      className="hover:bg-surface-2/50 transition-colors group"
                    >
                      <td className="py-3 px-4">
                        <span className="font-mono font-bold text-text-primary text-xs">
                          {sale.saleNumber}
                        </span>
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

                      <td className="py-3 px-4 text-right font-bold text-text-primary tabular-nums">
                        {formatCurrency(sale.total)}
                      </td>

                      <td className="py-3 px-4 text-center">
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
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
