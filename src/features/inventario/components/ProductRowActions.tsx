import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { AlertTriangle, Ban, Check, Layers, Pencil, Plus, RotateCcw, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { Product } from '../types';

/** Cuántas unidades del producto hay en el carrito (bloqueado si el producto está inactivo). */
export const CartIndicator: React.FC<{ quantity: number; isInactive: boolean }> = ({ quantity, isInactive }) => {
  if (quantity <= 0) return <span className="text-[11px] text-text-muted">—</span>;
  return isInactive ? (
    <span title="Producto desactivado en carrito"
      className="inline-flex items-center gap-1 text-[10px] font-semibold text-danger px-2 py-0.5 rounded-full bg-danger/10 border border-danger/30">
      <AlertTriangle size={11} />
      {quantity} (bloqueado)
    </span>
  ) : (
    // Cada vez que cambia la cantidad, la etiqueta hace un pequeño resorte
    <m.span key={quantity} initial={{ scale: 0.82, opacity: 0.6 }} animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 520, damping: 20 }}
      className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent px-2 py-0.5 rounded-full bg-accent/10 border border-accent/25">
      <Check size={11} />
      {quantity} en carrito
    </m.span>
  );
};

/** Verdadero unos instantes después de que suben las unidades en el carrito (por clic, Enter o lector). */
function useJustAdded(quantity: number): boolean {
  const [justAdded, setJustAdded] = useState(false);
  const previous = useRef(quantity);
  useEffect(() => {
    if (quantity > previous.current) {
      setJustAdded(true);
      const timer = window.setTimeout(() => setJustAdded(false), 900);
      previous.current = quantity;
      return () => window.clearTimeout(timer);
    }
    previous.current = quantity;
    setJustAdded(false); // si baja o no cambia, no queda el tilde pegado
  }, [quantity]);
  return justAdded;
}

interface ProductRowActionsProps {
  product: Product;
  isInCart: boolean;
  /** Unidades en el carrito: cuando suben, el botón muestra un tilde un instante. */
  quantityInCart?: number;
  onAddToCart: (product: Product) => void;
  onEdit?: (product: Product) => void;
  onAdjustStock?: (product: Product) => void;
  onDeactivate?: (product: Product) => void;
  onReactivate?: (product: Product) => void;
}

const ICON_BUTTON = 'p-1.5 rounded-lg text-text-muted hover:bg-surface-2 transition-colors';

/** Acciones de un producto: ajustar, editar, desactivar o reactivar y agregar al carrito. */
export const ProductRowActions: React.FC<ProductRowActionsProps> = ({ product, isInCart, quantityInCart = 0, onAddToCart, onEdit, onAdjustStock, onDeactivate, onReactivate }) => {
  const justAdded = useJustAdded(quantityInCart);
  // Los clics en los botones no deben seleccionar la fila
  const act = (handler: (p: Product) => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    handler(product);
  };
  const isInactive = product.isActive === false;

  return (
    <div className="flex items-center justify-end gap-1.5">
      {onAdjustStock && (
        <button type="button" onClick={act(onAdjustStock)} className={`${ICON_BUTTON} hover:text-accent`} title={`Ajustar existencias de ${product.name}`}>
          <Layers size={13} />
        </button>
      )}
      {onEdit && (
        <button type="button" onClick={act(onEdit)} className={`${ICON_BUTTON} hover:text-text-primary`} title={`Editar datos de ${product.name}`}>
          <Pencil size={13} />
        </button>
      )}
      {isInactive ? (
        onReactivate && (
          <Button variant="secondary" size="sm" onClick={act(onReactivate)} title={`Reactivar ${product.name}`}
            className="h-7 px-2.5 text-xs font-medium text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/40 border-emerald-800/50">
            <RotateCcw size={12} className="mr-1" />
            <span>Reactivar</span>
          </Button>
        )
      ) : (
        <>
          {onDeactivate && (
            <button type="button" onClick={act(onDeactivate)} title={`Desactivar ${product.name}`}
              className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-colors">
              <Ban size={13} />
            </button>
          )}
          <Button variant={isInCart ? 'secondary' : 'primary'} size="sm" onClick={act(onAddToCart)} className="h-7 px-2.5 text-xs font-medium"
            title={`Agregar ${product.name} al carrito (o presiona Enter)`}>
            <AnimatePresence mode="wait" initial={false}>
              <m.span key={justAdded ? 'added' : isInCart ? 'sum' : 'add'} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.12 }} className="inline-flex items-center gap-1">
                {justAdded ? (<><Check size={13} /><span>Agregado</span></>)
                  : isInCart ? (<><Plus size={13} /><span>Sumar</span></>)
                  : (<><ShoppingCart size={13} /><span>Agregar</span></>)}
              </m.span>
            </AnimatePresence>
          </Button>
        </>
      )}
    </div>
  );
};
