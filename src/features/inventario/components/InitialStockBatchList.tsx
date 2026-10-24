import React from 'react';
import type { Product } from '../types';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency } from '@/lib/formatters';
import { Trash2, AlertCircle } from 'lucide-react';

export interface BatchDraftItem {
  productId: string;
  quantity: string;
  unitCost: string;
}

interface InitialStockBatchListProps {
  items: BatchDraftItem[];
  productMap: Map<string, Product>;
  onUpdateItem: (index: number, field: 'quantity' | 'unitCost', value: string) => void;
  onRemoveItem: (index: number) => void;
}

export const InitialStockBatchList: React.FC<InitialStockBatchListProps> = ({
  items,
  productMap,
  onUpdateItem,
  onRemoveItem,
}) => {
  if (items.length === 0) {
    return (
      <div className="p-6 text-center rounded-xl border border-dashed border-border bg-surface-2/20 text-text-muted text-xs">
        No hay productos seleccionados para la carga inicial.
        <br />
        Seleccione productos aptos de la lista superior para incorporarlos al lote.
      </div>
    );
  }

  let totalBatchValuation = 0;

  return (
    <div className="space-y-3">
      <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
        {items.map((item, idx) => {
          const prod = productMap.get(item.productId);
          const isIndivisible = prod && ['unidad', 'bulto', 'par'].includes(prod.unit);
          const qtyNum = parseFloat(item.quantity) || 0;
          const costNum = parseFloat(item.unitCost) || 0;
          const lineTotal = qtyNum * costNum;
          totalBatchValuation += lineTotal;

          const isIntegerInvalid = isIndivisible && qtyNum > 0 && !Number.isInteger(qtyNum);
          const isQtyInvalid = qtyNum <= 0;
          const isCostInvalid = costNum < 0 || item.unitCost.trim() === '';

          return (
            <div
              key={item.productId}
              className="p-3 bg-surface-2/50 border border-border rounded-xl space-y-2 text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold text-text-primary truncate">{prod?.name || 'Producto'}</span>
                  <span className="font-mono text-[10px] text-text-muted">({prod?.sku || '---'})</span>
                  <Badge variant="neutral" className="text-[10px] px-1 py-0 border-border">
                    {prod?.unit || 'unidad'}
                  </Badge>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => onRemoveItem(idx)}
                  className="h-6 w-6 p-0 text-text-muted hover:text-danger hover:bg-danger/10"
                  title="Quitar producto del lote"
                >
                  <Trash2 size={13} />
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                <div>
                  <label className="block text-[11px] font-medium text-text-muted mb-1">
                    Cantidad inicial {isIndivisible && <span className="text-amber-400">(entero)</span>}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step={isIndivisible ? '1' : '0.01'}
                    value={item.quantity}
                    onChange={(e) => onUpdateItem(idx, 'quantity', e.target.value)}
                    placeholder={isIndivisible ? 'Ej: 10' : 'Ej: 10.50'}
                    className={`w-full px-2.5 py-1.5 text-xs rounded-lg bg-surface border text-text-primary focus:outline-none focus:ring-1 ${
                      isQtyInvalid || isIntegerInvalid
                        ? 'border-danger focus:ring-danger'
                        : 'border-border focus:ring-primary/50'
                    }`}
                  />
                  {isIntegerInvalid && (
                    <span className="text-[10px] text-danger flex items-center gap-1 mt-0.5">
                      <AlertCircle size={10} /> Requiere número entero
                    </span>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-text-muted mb-1">
                    Costo unitario inicial
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.unitCost}
                    onChange={(e) => onUpdateItem(idx, 'unitCost', e.target.value)}
                    placeholder="0.00"
                    className={`w-full px-2.5 py-1.5 text-xs rounded-lg bg-surface border text-text-primary focus:outline-none focus:ring-1 ${
                      isCostInvalid ? 'border-danger focus:ring-danger' : 'border-border focus:ring-primary/50'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-text-muted mb-1">
                    Subtotal valuación
                  </label>
                  <div className="px-2.5 py-1.5 text-xs rounded-lg bg-surface/50 border border-border text-text-secondary font-mono flex items-center justify-between">
                    <span>AR$</span>
                    <span className="font-semibold text-text-primary">{formatCurrency(lineTotal)}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-3 bg-surface-2/80 border border-border rounded-xl flex items-center justify-between text-xs">
        <div className="text-text-muted">
          Productos en lote: <span className="font-bold text-text-primary">{items.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-text-muted">Valuación total:</span>
          <span className="font-bold font-mono text-emerald-400 text-sm">
            {formatCurrency(totalBatchValuation)}
          </span>
        </div>
      </div>
    </div>
  );
};
