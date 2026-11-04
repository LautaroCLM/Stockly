import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, Percent, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/formatters';
import type { CartItem } from '../types';

interface CartFooterProps {
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  total: number;
  inactiveItems: CartItem[];
  onSetDiscount: (percent: number) => void;
  onClearCart: () => void;
  onRemoveItem: (productId: string) => void;
  onProceedToCheckout: () => void;
}

/** Descuento, totales, vaciado del carrito y paso al cobro. */
export const CartFooter: React.FC<CartFooterProps> = ({
  subtotal,
  discountPercent,
  discountAmount,
  total,
  inactiveItems,
  onSetDiscount,
  onClearCart,
  onRemoveItem,
  onProceedToCheckout,
}) => {
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [discountInput, setDiscountInput] = useState(discountPercent.toString());
  const hasInactiveItems = inactiveItems.length > 0;

  useEffect(() => {
    setDiscountInput(discountPercent.toString());
  }, [discountPercent]);

  return (
    <div className="p-4 border-t border-border bg-surface-2/40 space-y-3 shrink-0">
      <div className="flex items-center justify-between text-xs gap-3">
        <label htmlFor="cart-discount" className="text-text-secondary flex items-center gap-1">
          <Percent size={13} className="text-accent" />
          Descuento (%):
        </label>
        <div className="flex items-center gap-2">
          <input id="cart-discount" type="number" min="0" max="100" value={discountInput}
            onChange={(e) => {
              setDiscountInput(e.target.value);
              const parsed = parseFloat(e.target.value);
              onSetDiscount(isNaN(parsed) ? 0 : parsed);
            }}
            className="w-14 h-7 text-center text-xs bg-surface-3 border border-border rounded-md text-text-primary focus:outline-none focus:border-primary tabular-nums" />
          {discountAmount > 0 && <span className="text-[11px] font-semibold text-accent tabular-nums">-{formatCurrency(discountAmount)}</span>}
        </div>
      </div>

      <div className="space-y-1.5 pt-2 border-t border-border/60 text-xs">
        <div className="flex items-center justify-between text-text-secondary">
          <span>Subtotal:</span>
          <span className="font-medium tabular-nums">{formatCurrency(subtotal)}</span>
        </div>
        {discountAmount > 0 && (
          <div className="flex items-center justify-between text-accent">
            <span>Descuento aplicado:</span>
            <span className="font-medium tabular-nums">-{formatCurrency(discountAmount)}</span>
          </div>
        )}
        <div className="flex items-center justify-between text-sm font-bold text-text-primary pt-1">
          <span>Total a Cobrar:</span>
          <span className="text-base text-primary font-bold tabular-nums">{formatCurrency(total)}</span>
        </div>
      </div>

      {showClearConfirm ? (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11px] text-danger font-medium">
            <AlertTriangle size={13} />
            <span>¿Vaciar todos los artículos?</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => { onClearCart(); setShowClearConfirm(false); }}
              className="px-2 py-1 text-[11px] font-semibold rounded bg-danger text-white hover:bg-danger/90">Sí, vaciar</button>
            <button onClick={() => setShowClearConfirm(false)}
              className="px-2 py-1 text-[11px] rounded bg-surface-3 text-text-secondary hover:text-text-primary">Cancelar</button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between pt-1">
          <button onClick={() => setShowClearConfirm(true)} className="text-[11px] text-text-muted hover:text-danger transition-colors flex items-center gap-1">
            <Trash2 size={12} />
            <span>Vaciar carrito</span>
          </button>
        </div>
      )}

      {hasInactiveItems && (
        <div className="bg-danger/15 border border-danger/40 rounded-xl p-3 space-y-2 animate-in fade-in duration-150">
          <div className="flex items-start gap-2">
            <AlertTriangle size={15} className="text-danger shrink-0 mt-0.5" />
            <div className="text-xs">
              <strong className="text-danger font-semibold block">Cobro bloqueado por artículos desactivados</strong>
              <p className="text-[11px] text-text-secondary mt-0.5">Para continuar al cobro, quitá los siguientes artículos inactivos del carrito:</p>
              <ul className="list-disc list-inside mt-1 space-y-0.5 text-[11px] text-danger font-mono font-medium">
                {inactiveItems.map((i) => (
                  <li key={i.productId}>{i.name} ({i.sku})</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="flex justify-end pt-1 border-t border-danger/20">
            <button type="button" onClick={() => inactiveItems.forEach((i) => onRemoveItem(i.productId))}
              className="text-[11px] font-semibold text-danger hover:underline flex items-center gap-1">
              <Trash2 size={12} />
              <span>Quitar {inactiveItems.length === 1 ? 'este producto' : 'todos los inactivos'}</span>
            </button>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Button variant="primary" size="lg" onClick={onProceedToCheckout} disabled={hasInactiveItems}
          className="w-full shadow-lg shadow-primary/25 justify-center disabled:opacity-50 disabled:cursor-not-allowed"
          title={hasInactiveItems ? 'Quitá los artículos desactivados para continuar al cobro' : undefined}>
          <span>Continuar al Cobro</span>
          <ArrowRight size={16} />
        </Button>
        {hasInactiveItems && (
          <p className="text-[10px] text-center text-danger font-medium">Quitá los productos desactivados para habilitar el botón de cobro.</p>
        )}
      </div>
    </div>
  );
};
