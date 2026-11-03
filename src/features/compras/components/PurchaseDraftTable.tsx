import React from 'react';
import { Trash2 } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';
import type { PurchaseDraftItem } from '../types';

interface PurchaseDraftTableProps {
  items: PurchaseDraftItem[];
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onUpdateUnitCost: (productId: string, cost: number) => void;
  onRemoveItem: (productId: string) => void;
  disabled?: boolean;
}

export const PurchaseDraftTable: React.FC<PurchaseDraftTableProps> = ({
  items,
  onUpdateQuantity,
  onUpdateUnitCost,
  onRemoveItem,
  disabled = false,
}) => {
  if (items.length === 0) {
    return (
      <div className="py-6 px-4 text-center border border-dashed border-border rounded-xl text-text-muted text-xs bg-surface-2/20">
        No hay productos agregados a la compra. Seleccione un producto arriba para agregarlo.
      </div>
    );
  }

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-surface-2/70 border-b border-border text-[11px] font-semibold text-text-muted uppercase tracking-wider">
            <tr>
              <th className="py-2.5 px-3">Producto</th>
              <th className="py-2.5 px-3 w-28 text-right">Cantidad</th>
              <th className="py-2.5 px-3 w-32 text-right">Costo Unit.</th>
              <th className="py-2.5 px-3 w-28 text-right">Subtotal</th>
              <th className="py-2.5 px-2 w-10 text-center" aria-label="Acciones" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {items.map((item) => {
              const isIndivisible = ['unidad', 'bulto', 'par'].includes(item.unit.toLowerCase());
              return (
                <tr key={item.productId} className="hover:bg-surface-2/30 transition-colors">
                  <td className="py-2 px-3">
                    <div className="font-medium text-text-primary line-clamp-1">{item.productName}</div>
                    <div className="text-[10px] text-text-muted font-mono flex items-center gap-1.5">
                      <span>SKU: {item.sku}</span>
                      <span>•</span>
                      <span>Unidad: {item.unit}</span>
                    </div>
                  </td>
                  <td className="py-2 px-3 text-right">
                    <input
                      type="number"
                      min={isIndivisible ? 1 : 0.01}
                      step={isIndivisible ? 1 : 0.01}
                      value={item.quantity === 0 ? '' : item.quantity}
                      disabled={disabled}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        onUpdateQuantity(item.productId, isNaN(val) ? 0 : val);
                      }}
                      className="w-20 px-2 py-1 text-right text-xs bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </td>
                  <td className="py-2 px-3 text-right">
                    <div className="relative inline-block w-24">
                      <span className="absolute left-2 top-1 text-[11px] text-text-muted">$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.unitCost === 0 ? '' : item.unitCost}
                        disabled={disabled}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          onUpdateUnitCost(item.productId, isNaN(val) ? 0 : val);
                        }}
                        className="w-full pl-5 pr-2 py-1 text-right text-xs bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </td>
                  <td className="py-2 px-3 text-right font-semibold text-text-primary font-mono whitespace-nowrap">
                    {formatCurrency(item.subtotal)}
                  </td>
                  <td className="py-2 px-2 text-center">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onRemoveItem(item.productId)}
                      className="p-1 rounded text-text-muted hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
                      title="Eliminar línea"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
