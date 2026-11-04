import React from 'react';
import { Product } from '../types';
import { StockBadge } from './StockBadge';
import { formatCurrency } from '@/lib/formatters';
import { CartIndicator, ProductRowActions } from './ProductRowActions';

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
        <CartIndicator quantity={quantityInCart} isInactive={isInactive} />
      </td>

      {/* Action Buttons */}
      <td className="py-2.5 px-4 text-right">
        <ProductRowActions product={product} isInCart={isInCart} onAddToCart={onAddToCart} onEdit={onEdit}
          onAdjustStock={onAdjustStock} onDeactivate={onDeactivate} onReactivate={onReactivate} />
      </td>
    </tr>
  );
};
