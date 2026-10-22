import React from 'react';
import { CriticalProduct } from '@/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency } from '@/lib/formatters';
import { AlertCircle, ArrowRight } from 'lucide-react';

interface CriticalStockTableProps {
  products: CriticalProduct[];
  onViewAllClick: () => void;
}

export const CriticalStockTable: React.FC<CriticalStockTableProps> = ({
  products,
  onViewAllClick,
}) => {
  return (
    <Card className="flex flex-col">
      <CardHeader className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertCircle size={16} className="text-amber-400" />
          <CardTitle>Productos en Stock Crítico o Negativo</CardTitle>
        </div>
        <button
          onClick={onViewAllClick}
          className="text-xs font-medium text-primary hover:text-primary-light flex items-center gap-1 transition-colors"
        >
          <span>Ir a Inventario</span>
          <ArrowRight size={13} />
        </button>
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border bg-surface-2/40 text-[11px] font-semibold text-text-muted uppercase tracking-wider">
                <th className="py-2.5 px-4">Producto</th>
                <th className="py-2.5 px-3">Categoría</th>
                <th className="py-2.5 px-3 text-right">Stock Actual</th>
                <th className="py-2.5 px-3 text-right">Mínimo</th>
                <th className="py-2.5 px-3 text-right">Precio Unit.</th>
                <th className="py-2.5 px-4 text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 text-xs">
              {products.map((item) => {
                const isNegative = item.currentStock < 0;
                const isZero = item.currentStock === 0;

                return (
                  <tr
                    key={item.id}
                    className="hover:bg-surface-2/60 transition-colors group"
                  >
                    <td className="py-3 px-4">
                      <div className="flex flex-col">
                        <span className="font-medium text-text-primary group-hover:text-primary-light transition-colors">
                          {item.name}
                        </span>
                        <span className="text-[11px] font-mono text-text-muted">
                          SKU: {item.sku}
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-3 text-text-secondary">
                      {item.category}
                    </td>

                    <td className="py-3 px-3 text-right tabular-nums">
                      <span
                        className={`font-semibold ${
                          isNegative
                            ? 'text-danger font-bold'
                            : isZero
                            ? 'text-amber-400'
                            : 'text-text-primary'
                        }`}
                      >
                        {item.currentStock} u.
                      </span>
                    </td>

                    <td className="py-3 px-3 text-right tabular-nums text-text-muted">
                      {item.minStock} u.
                    </td>

                    <td className="py-3 px-3 text-right tabular-nums text-text-secondary font-medium">
                      {formatCurrency(item.unitPrice)}
                    </td>

                    <td className="py-3 px-4 text-center">
                      {isNegative ? (
                        <Badge variant="danger" size="sm">
                          Negativo ({item.currentStock})
                        </Badge>
                      ) : isZero ? (
                        <Badge variant="danger" size="sm">
                          Agotado (0)
                        </Badge>
                      ) : (
                        <Badge variant="warning" size="sm">
                          Bajo Mínimo
                        </Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
};
