import React from 'react';
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
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent px-2 py-0.5 rounded-full bg-accent/10 border border-accent/25">
      <Check size={11} />
      {quantity} en carrito
    </span>
  );
};

interface ProductRowActionsProps {
  product: Product;
  isInCart: boolean;
  onAddToCart: (product: Product) => void;
  onEdit?: (product: Product) => void;
  onAdjustStock?: (product: Product) => void;
  onDeactivate?: (product: Product) => void;
  onReactivate?: (product: Product) => void;
}

const ICON_BUTTON = 'p-1.5 rounded-lg text-text-muted hover:bg-surface-2 transition-colors';

/** Acciones de un producto: ajustar, editar, desactivar o reactivar y agregar al carrito. */
export const ProductRowActions: React.FC<ProductRowActionsProps> = ({ product, isInCart, onAddToCart, onEdit, onAdjustStock, onDeactivate, onReactivate }) => {
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
            {isInCart ? (<><Plus size={13} /><span>Sumar</span></>) : (<><ShoppingCart size={13} /><span>Agregar</span></>)}
          </Button>
        </>
      )}
    </div>
  );
};
