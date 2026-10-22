import React, { useEffect, useState, useMemo } from 'react';
import { CartItem, Product } from '../types';
import { formatCurrency } from '@/lib/formatters';
import { Button } from '@/components/ui/Button';
import {
  X,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  ArrowRight,
  Percent,
  AlertTriangle,
} from 'lucide-react';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  products: Product[];
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  total: number;
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemoveItem: (productId: string) => void;
  onSetDiscount: (percent: number) => void;
  onClearCart: () => void;
  onProceedToCheckout: () => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  items,
  products,
  subtotal,
  discountPercent,
  discountAmount,
  total,
  onUpdateQuantity,
  onRemoveItem,
  onSetDiscount,
  onClearCart,
  onProceedToCheckout,
}) => {
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [discountInput, setDiscountInput] = useState(discountPercent.toString());

  // Detect items in cart that correspond to inactive products
  const inactiveItems = useMemo(() => {
    return items.filter((item) => {
      const prod = products.find((p) => p.id === item.productId);
      return prod ? prod.isActive === false : false;
    });
  }, [items, products]);

  const hasInactiveItems = inactiveItems.length > 0;

  // Sync discount input with prop
  useEffect(() => {
    setDiscountInput(discountPercent.toString());
  }, [discountPercent]);

  // Handle Escape key to close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <aside className="w-screen max-w-md bg-surface border-l border-border flex flex-col shadow-2xl shadow-black/80 animate-in slide-in-from-right duration-200">
          {/* Header */}
          <div className="p-4 px-5 border-b border-border flex items-center justify-between bg-surface-2/40">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/25 flex items-center justify-center text-primary">
                <ShoppingCart size={18} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-text-primary">
                  Carrito de Venta
                </h2>
                <span className="text-[11px] text-text-muted">
                  {items.length} {items.length === 1 ? 'producto' : 'productos'} seleccionados
                </span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors"
              title="Cerrar carrito (Escape)"
            >
              <X size={18} />
            </button>
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-6 text-text-muted">
                <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-border flex items-center justify-center mb-3">
                  <ShoppingCart size={28} className="text-text-muted/60" />
                </div>
                <p className="text-xs font-semibold text-text-primary mb-1">
                  El carrito está vacío
                </p>
                <p className="text-[11px] text-text-muted max-w-[220px]">
                  Buscá productos en el catálogo y agregalos con un clic o presiona Enter en la fila.
                </p>
              </div>
            ) : (
              items.map((item) => {
                const productRef = products.find((p) => p.id === item.productId);
                const isInactive = productRef ? productRef.isActive === false : false;

                return (
                  <div
                    key={item.productId}
                    className={`rounded-xl p-3 flex flex-col gap-2 transition-colors ${
                      isInactive
                        ? 'bg-danger/10 border border-danger/40'
                        : 'bg-surface-2/70 border border-border/80 hover:border-border-active'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col min-w-0">
                        <span className={`text-xs font-medium truncate ${isInactive ? 'text-danger font-semibold' : 'text-text-primary'}`}>
                          {item.name}
                        </span>
                        <span className="text-[10px] font-mono text-text-muted">
                          SKU: {item.sku} • Unitario: {formatCurrency(item.unitPrice)}
                        </span>
                        {isInactive && (
                          <div className="flex items-center gap-1 text-[10px] font-semibold text-danger mt-1">
                            <AlertTriangle size={11} className="shrink-0" />
                            <span>Producto desactivado — Bloquea el cobro</span>
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => onRemoveItem(item.productId)}
                        className={`p-1 rounded transition-colors shrink-0 ${
                          isInactive
                            ? 'text-danger hover:bg-danger/20'
                            : 'text-text-muted hover:text-danger'
                        }`}
                        title="Eliminar producto del carrito"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                  <div className="flex items-center justify-between pt-1 border-t border-border/40">
                    {/* Stepper + direct number edit */}
                    <div className="flex items-center gap-1 bg-surface-3/80 border border-border/80 rounded-lg p-0.5">
                      <button
                        onClick={() => onUpdateQuantity(item.productId, item.quantity - 1)}
                        className="w-6 h-6 rounded flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors"
                        title="Restar 1 unidad"
                      >
                        <Minus size={12} />
                      </button>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          if (!isNaN(val) && val >= 1) {
                            onUpdateQuantity(item.productId, val);
                          }
                        }}
                        className="w-10 text-center text-xs font-semibold bg-transparent text-text-primary focus:outline-none tabular-nums"
                      />
                      <button
                        onClick={() => onUpdateQuantity(item.productId, item.quantity + 1)}
                        className="w-6 h-6 rounded flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors"
                        title="Sumar 1 unidad"
                      >
                        <Plus size={12} />
                      </button>
                    </div>

                    {/* Subtotal */}
                    <div className="text-right">
                      <span className="text-xs font-bold text-text-primary tabular-nums">
                        {formatCurrency(item.subtotal)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          </div>

          {/* Footer Totals & Checkout */}
          {items.length > 0 && (
            <div className="p-4 border-t border-border bg-surface-2/40 space-y-3 shrink-0">
              {/* Discount Row */}
              <div className="flex items-center justify-between text-xs gap-3">
                <span className="text-text-secondary flex items-center gap-1">
                  <Percent size={13} className="text-accent" />
                  Descuento (%):
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={discountInput}
                    onChange={(e) => {
                      setDiscountInput(e.target.value);
                      const parsed = parseFloat(e.target.value);
                      if (!isNaN(parsed)) {
                        onSetDiscount(parsed);
                      } else {
                        onSetDiscount(0);
                      }
                    }}
                    className="w-14 h-7 text-center text-xs bg-surface-3 border border-border rounded-md text-text-primary focus:outline-none focus:border-primary tabular-nums"
                  />
                  {discountAmount > 0 && (
                    <span className="text-[11px] font-semibold text-accent tabular-nums">
                      -{formatCurrency(discountAmount)}
                    </span>
                  )}
                </div>
              </div>

              {/* Subtotal and Total */}
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
                  <span className="text-base text-primary font-bold tabular-nums">
                    {formatCurrency(total)}
                  </span>
                </div>
              </div>

              {/* Clear Cart Confirmation Area */}
              {showClearConfirm ? (
                <div className="bg-danger/10 border border-danger/30 rounded-lg p-2.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-[11px] text-danger font-medium">
                    <AlertTriangle size={13} />
                    <span>¿Vaciar todos los artículos?</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        onClearCart();
                        setShowClearConfirm(false);
                      }}
                      className="px-2 py-1 text-[11px] font-semibold rounded bg-danger text-white hover:bg-danger/90"
                    >
                      Sí, vaciar
                    </button>
                    <button
                      onClick={() => setShowClearConfirm(false)}
                      className="px-2 py-1 text-[11px] rounded bg-surface-3 text-text-secondary hover:text-text-primary"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between pt-1">
                  <button
                    onClick={() => setShowClearConfirm(true)}
                    className="text-[11px] text-text-muted hover:text-danger transition-colors flex items-center gap-1"
                  >
                    <Trash2 size={12} />
                    <span>Vaciar carrito</span>
                  </button>
                </div>
              )}

              {/* Inactive items block banner */}
              {hasInactiveItems && (
                <div className="bg-danger/15 border border-danger/40 rounded-xl p-3 space-y-2 animate-in fade-in duration-150">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={15} className="text-danger shrink-0 mt-0.5" />
                    <div className="text-xs">
                      <strong className="text-danger font-semibold block">
                        Cobro bloqueado por artículos desactivados
                      </strong>
                      <p className="text-[11px] text-text-secondary mt-0.5">
                        Para continuar al cobro, quitá los siguientes artículos inactivos del carrito:
                      </p>
                      <ul className="list-disc list-inside mt-1 space-y-0.5 text-[11px] text-danger font-mono font-medium">
                        {inactiveItems.map((i) => (
                          <li key={i.productId}>
                            {i.name} ({i.sku})
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="flex justify-end pt-1 border-t border-danger/20">
                    <button
                      type="button"
                      onClick={() => {
                        inactiveItems.forEach((i) => onRemoveItem(i.productId));
                      }}
                      className="text-[11px] font-semibold text-danger hover:underline flex items-center gap-1"
                    >
                      <Trash2 size={12} />
                      <span>
                        Quitar {inactiveItems.length === 1 ? 'este producto' : 'todos los inactivos'}
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {/* Proceed to checkout CTA */}
              <div className="space-y-1.5">
                <Button
                  variant="primary"
                  size="lg"
                  onClick={onProceedToCheckout}
                  disabled={items.length === 0 || hasInactiveItems}
                  className="w-full shadow-lg shadow-primary/25 justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                  title={hasInactiveItems ? 'Quitá los artículos desactivados para continuar al cobro' : undefined}
                >
                  <span>Continuar al Cobro</span>
                  <ArrowRight size={16} />
                </Button>
                {hasInactiveItems && (
                  <p className="text-[10px] text-center text-danger font-medium">
                    Quitá los productos desactivados para habilitar el botón de cobro.
                  </p>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
