import React from 'react';
import { AlertTriangle, Minus, Plus, Trash2 } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';
import type { CartItem } from '../types';

interface CartItemRowProps {
  item: CartItem;
  /** El producto fue desactivado: bloquea el cobro hasta quitarlo. */
  isInactive: boolean;
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
}

const STEP_BUTTON =
  'w-6 h-6 rounded flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors';

/** Un producto del carrito con su cantidad editable y subtotal. */
export const CartItemRow: React.FC<CartItemRowProps> = ({ item, isInactive, onUpdateQuantity, onRemove }) => (
  <div className={`rounded-xl p-3 flex flex-col gap-2 transition-colors ${
    isInactive ? 'bg-danger/10 border border-danger/40' : 'bg-surface-2/70 border border-border/80 hover:border-border-active'
  }`}>
    <div className="flex items-start justify-between gap-2">
      <div className="flex flex-col min-w-0">
        <span className={`text-xs font-medium truncate ${isInactive ? 'text-danger font-semibold' : 'text-text-primary'}`}>{item.name}</span>
        <span className="text-[10px] font-mono text-text-muted">SKU: {item.sku} • Unitario: {formatCurrency(item.unitPrice)}</span>
        {isInactive && (
          <div className="flex items-center gap-1 text-[10px] font-semibold text-danger mt-1">
            <AlertTriangle size={11} className="shrink-0" />
            <span>Producto desactivado — Bloquea el cobro</span>
          </div>
        )}
      </div>
      <button onClick={() => onRemove(item.productId)} title="Eliminar producto del carrito"
        className={`p-1 rounded transition-colors shrink-0 ${isInactive ? 'text-danger hover:bg-danger/20' : 'text-text-muted hover:text-danger'}`}>
        <Trash2 size={14} />
      </button>
    </div>

    <div className="flex items-center justify-between pt-1 border-t border-border/40">
      <div className="flex items-center gap-1 bg-surface-3/80 border border-border/80 rounded-lg p-0.5">
        <button onClick={() => onUpdateQuantity(item.productId, item.quantity - 1)} className={STEP_BUTTON} title="Restar 1 unidad">
          <Minus size={12} />
        </button>
        <input type="number" min="1" value={item.quantity} aria-label={`Cantidad de ${item.name}`}
          onChange={(e) => {
            const val = parseInt(e.target.value, 10);
            if (!isNaN(val) && val >= 1) onUpdateQuantity(item.productId, val);
          }}
          className="w-10 text-center text-xs font-semibold bg-transparent text-text-primary focus:outline-none tabular-nums" />
        <button onClick={() => onUpdateQuantity(item.productId, item.quantity + 1)} className={STEP_BUTTON} title="Sumar 1 unidad">
          <Plus size={12} />
        </button>
      </div>
      <span className="text-xs font-bold text-text-primary tabular-nums">{formatCurrency(item.subtotal)}</span>
    </div>
  </div>
);
