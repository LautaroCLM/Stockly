import React from 'react';
import { Product } from '../types';
import { StockBadge } from './StockBadge';
import { formatCurrency } from '@/lib/formatters';
import { Button } from '@/components/ui/Button';
import { Plus, ShoppingCart, Check, Pencil, Layers, RotateCcw, Ban, AlertTriangle } from 'lucide-react';

interface ProductTableRowProps {
  product: Product;
  quantityInCart: number;
  isSelected?: boolean;
  onAddToCart: (product: Product) => void;
  onSelectRow?: () => void;
  onEdit?: (product: Product) => void;
  onAdjustStock?: (product: Product) => void;
  onDeactivate?: (product: Product) => void;
  onReactivate?: (product: Product) => void;
}

export const ProductTableRow: React.FC<ProductTableRowProps> = ({
  product,
  quantityInCart,
  isSelected,
  onAddToCart,
  onSelectRow,
  onEdit,
  onAdjustStock,
  onDeactivate,
  onReactivate,
}) => {
  const isInCart = quantityInCart > 0;
  const isInactive = product.isActive === false;

  function handleKeyDown(e: React.KeyboardEvent<HTMLTableRowElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!isInactive) {
        onAddToCart(product);
      }
    }
  }

  return (
    <tr
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onClick={onSelectRow}
      className={`border-b border-border/60 transition-colors group cursor-pointer focus:outline-none focus:bg-primary/5 ${
        isInactive
          ? 'bg-surface-2/20 text-text-secondary opacity-75 hover:opacity-95'
          : isSelected
          ? 'bg-primary/10'
          : 'hover:bg-surface-2/60'
      }`}
    >
      {/* Product SKU and Barcode */}
      <td className="py-2.5 px-4">
        <div className="flex flex-col">
          <span className="font-mono text-xs font-semibold text-text-primary tracking-tight">
            {product.sku}
          </span>
          <span className="font-mono text-[10px] text-text-muted">
            {product.barcode}
          </span>
        </div>
      </td>

      {/* Product Name & Category */}
      <td className="py-2.5 px-3">
        <div className="flex flex-col min-w-0 max-w-sm">
          <div className="flex items-center gap-1.5">
            <span
              className={`text-xs font-medium line-clamp-1 ${
                isInactive
                  ? 'text-text-muted line-through'
                  : 'text-text-primary group-hover:text-primary-light transition-colors'
              }`}
            >
              {product.name}
            </span>
            {isInactive && (
              <span className="inline-flex items-center text-[10px] font-semibold text-amber-400/90 bg-amber-500/10 border border-amber-500/25 px-1.5 py-0.2 rounded shrink-0">
                Inactivo
              </span>
            )}
          </div>
          <span className="text-[11px] text-text-muted">
            {product.category}
          </span>
        </div>
      </td>

      {/* Unit Sale Price */}
      <td className="py-2.5 px-3 text-right tabular-nums">
        <span className="text-xs font-bold text-text-primary">
          {formatCurrency(product.salePrice)}
        </span>
      </td>

      {/* Stock Level */}
      <td className="py-2.5 px-3 text-right">
        <StockBadge product={product} />
      </td>

      {/* Cart Indicator */}
      <td className="py-2.5 px-3 text-center">
        {isInCart ? (
          isInactive ? (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-semibold text-danger px-2 py-0.5 rounded-full bg-danger/10 border border-danger/30"
              title="Producto desactivado en carrito"
            >
              <AlertTriangle size={11} />
              {quantityInCart} (bloqueado)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent px-2 py-0.5 rounded-full bg-accent/10 border border-accent/25">
              <Check size={11} />
              {quantityInCart} en carrito
            </span>
          )
        ) : (
          <span className="text-[11px] text-text-muted">—</span>
        )}
      </td>

      {/* Action Buttons */}
      <td className="py-2.5 px-4 text-right">
        <div className="flex items-center justify-end gap-1.5">
          {onAdjustStock && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAdjustStock(product);
              }}
              className="p-1.5 rounded-lg text-text-muted hover:text-accent hover:bg-surface-2 transition-colors"
              title={`Ajustar existencias de ${product.name}`}
            >
              <Layers size={13} />
            </button>
          )}

          {onEdit && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(product);
              }}
              className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors"
              title={`Editar datos de ${product.name}`}
            >
              <Pencil size={13} />
            </button>
          )}

          {isInactive ? (
            onReactivate && (
              <Button
                variant="secondary"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onReactivate(product);
                }}
                className="h-7 px-2.5 text-xs font-medium text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/40 border-emerald-800/50"
                title={`Reactivar ${product.name}`}
              >
                <RotateCcw size={12} className="mr-1" />
                <span>Reactivar</span>
              </Button>
            )
          ) : (
            <>
              {onDeactivate && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeactivate(product);
                  }}
                  className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                  title={`Desactivar ${product.name}`}
                >
                  <Ban size={13} />
                </button>
              )}

              <Button
                variant={isInCart ? 'secondary' : 'primary'}
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddToCart(product);
                }}
                className="h-7 px-2.5 text-xs font-medium"
                title={`Agregar ${product.name} al carrito (o presiona Enter)`}
              >
                {isInCart ? (
                  <>
                    <Plus size={13} />
                    <span>Sumar</span>
                  </>
                ) : (
                  <>
                    <ShoppingCart size={13} />
                    <span>Agregar</span>
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
};
