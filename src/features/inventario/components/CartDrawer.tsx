import React, { useEffect, useMemo, useRef } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { ShoppingCart, X } from 'lucide-react';
import { drawerRightVariants, overlayVariants } from '@/lib/motion';
import type { CartItem, Product } from '../types';
import { CartItemRow } from './CartItemRow';
import { CartFooter } from './CartFooter';
import { MiscItemForm } from './MiscItemForm';
import { SALE_HINTS, SaleShortcutHints } from './SaleShortcutHints';
import { useCartKeyboard } from '../hooks/useCartKeyboard';

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
  onAddMiscItem: (item: CartItem) => void;
  onSetDiscount: (percent: number) => void;
  onClearCart: () => void;
  onProceedToCheckout: () => void;
}

const EASE = [0.22, 1, 0.36, 1] as const;
const FADE = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.18, ease: EASE } };
/** Entrada y salida de una línea: altura y opacidad. */
const COLLAPSE = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: 'auto' },
  exit: { opacity: 0, height: 0 },
  transition: { duration: 0.2, ease: EASE },
  style: { overflow: 'hidden' },
} as const;
/** El pie sube desde abajo; el recorte se quita al terminar para no cortar el foco de los campos. */
const FOOTER_SLIDE = {
  initial: { opacity: 0, height: 0, y: 12 },
  animate: { opacity: 1, height: 'auto', y: 0, transitionEnd: { overflow: 'visible' } },
  exit: { opacity: 0, height: 0, y: 12, overflow: 'hidden' },
  transition: { duration: 0.24, ease: EASE },
  style: { overflow: 'hidden' },
} as const;

/** Panel lateral del carrito: productos, descuento y paso al cobro. */
const CartDrawerBody: React.FC<CartDrawerProps> = (props) => {
  const { isOpen, onClose, items, products } = props;

  // Productos del carrito que fueron desactivados: bloquean el cobro
  const inactiveIds = useMemo(
    () => new Set(products.filter((p) => p.isActive === false).map((p) => p.id)),
    [products]
  );
  const inactiveItems = useMemo(() => items.filter((item) => inactiveIds.has(item.productId)), [items, inactiveIds]);
  // Al abrir, el foco entra al carrito para que las flechas no muevan la tabla de atrás
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (isOpen) panelRef.current?.focus();
  }, [isOpen]);

  const selectedIndex = useCartKeyboard({
    isOpen,
    items,
    canCheckout: items.length > 0 && inactiveItems.length === 0,
    onUpdateQuantity: props.onUpdateQuantity,
    onRemoveItem: props.onRemoveItem,
    onCheckout: props.onProceedToCheckout,
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <m.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <m.aside ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Carrito de venta"
          variants={drawerRightVariants} className="focus:outline-none w-screen max-w-md bg-surface border-l border-border flex flex-col shadow-2xl shadow-black/80">
          <div className="p-4 px-5 border-b border-border flex items-center justify-between bg-surface-2/40">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/25 flex items-center justify-center text-primary">
                <ShoppingCart size={18} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-text-primary">Carrito de Venta</h2>
                <span className="text-[11px] text-text-muted">
                  {items.length} {items.length === 1 ? 'producto' : 'productos'} seleccionados
                </span>
              </div>
            </div>
            <button onClick={onClose} title="Cerrar carrito (Escape)" className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors">
              <X size={18} />
            </button>
          </div>

          <div className="relative flex-1 overflow-y-auto p-3">
            <AnimatePresence initial={false}>
              {items.length === 0 && (
                <m.div key="empty" {...FADE} className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 text-text-muted pointer-events-none">
                  <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-border flex items-center justify-center mb-3">
                    <ShoppingCart size={28} className="text-text-muted/60" />
                  </div>
                  <p className="text-xs font-semibold text-text-primary mb-1">El carrito está vacío</p>
                  <p className="text-[11px] text-text-muted max-w-[220px]">
                    Buscá productos con F2 y agregalos con Enter, o escaneá el código de barras.
                  </p>
                </m.div>
              )}
            </AnimatePresence>
            {/* Cada línea se despliega al entrar y se pliega al salir: las demás suben o bajan sin saltos */}
            <AnimatePresence initial={false}>
              {items.map((item, index) => (
                <m.div key={item.productId} {...COLLAPSE} className="px-1">
                  <div className="py-1.5">
                    <CartItemRow item={item} isInactive={inactiveIds.has(item.productId)} isSelected={index === selectedIndex}
                      onUpdateQuantity={props.onUpdateQuantity} onRemove={props.onRemoveItem} />
                  </div>
                </m.div>
              ))}
            </AnimatePresence>
          </div>

          <div className="px-4 pb-3"><MiscItemForm onAdd={props.onAddMiscItem} /></div>

          {/* El pie con totales y cobro se desliza al aparecer: el panel ya no salta de alto */}
          <AnimatePresence initial={false}>
            {items.length > 0 && (
              <m.div key="footer" {...FOOTER_SLIDE}>
                <SaleShortcutHints hints={SALE_HINTS.cart} className="px-4 py-2 border-t border-border/60" />
                <CartFooter
                  subtotal={props.subtotal}
                  discountPercent={props.discountPercent}
                  discountAmount={props.discountAmount}
                  total={props.total}
                  inactiveItems={inactiveItems}
                  onSetDiscount={props.onSetDiscount}
                  onClearCart={props.onClearCart}
                  onRemoveItem={props.onRemoveItem}
                  onProceedToCheckout={props.onProceedToCheckout}
                />
              </m.div>
            )}
          </AnimatePresence>
        </m.aside>
      </div>
    </m.div>
  );
};

/** Mientras isOpen es true se monta el panel; al cerrarse, AnimatePresence deja terminar la salida. */
export const CartDrawer: React.FC<CartDrawerProps> = (props) => (
  <AnimatePresence>{props.isOpen && <CartDrawerBody {...props} />}</AnimatePresence>
);
