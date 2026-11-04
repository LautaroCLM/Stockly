import React from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import type { Product } from '../types';
import { ProductTableRow } from './ProductTableRow';
import { ProductsEmptyState } from './ProductsEmptyState';

interface RowActions {
  onAddToCart: (product: Product) => void;
  onEdit?: (product: Product) => void;
  onAdjustStock?: (product: Product) => void;
  onDeactivate?: (product: Product) => void;
  onReactivate?: (product: Product) => void;
}

interface ProductsTableProps extends RowActions {
  pageProducts: Product[];
  filteredCount: number;
  isCatalogEmpty: boolean;
  isLoading: boolean;
  loadError: string | null;
  currentPage: number;
  totalPages: number;
  selectedRowIndex: number | null;
  getQuantityInCart: (productId: string) => number;
  onSelectRow: (index: number) => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
  onClearFilters: () => void;
  onCreateProduct: () => void;
}

/** Tabla paginada del catálogo, con sus estados de carga y vacío. */
export const ProductsTable: React.FC<ProductsTableProps> = (props) => {
  const { pageProducts, filteredCount, isCatalogEmpty, isLoading, currentPage, totalPages } = props;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border bg-surface-2/40 text-[11px] font-semibold text-text-muted uppercase tracking-wider">
                <th className="py-2.5 px-4">SKU / Código</th>
                <th className="py-2.5 px-3">Producto / Categoría</th>
                <th className="py-2.5 px-3 text-right">Precio Venta</th>
                <th className="py-2.5 px-3 text-right">Stock</th>
                <th className="py-2.5 px-3 text-center">En Carrito</th>
                <th className="py-2.5 px-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && isCatalogEmpty ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <div className="flex items-center justify-center gap-2 text-xs text-text-muted">
                      <Loader2 size={16} className="animate-spin text-primary" />
                      <span>Cargando catálogo de productos...</span>
                    </div>
                  </td>
                </tr>
              ) : pageProducts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <ProductsEmptyState isCatalogEmpty={isCatalogEmpty} loadError={props.loadError}
                      onClearFilters={props.onClearFilters} onCreateProduct={props.onCreateProduct} />
                  </td>
                </tr>
              ) : (
                pageProducts.map((product, idx) => (
                  <ProductTableRow
                    key={product.id}
                    product={product}
                    quantityInCart={props.getQuantityInCart(product.id)}
                    isSelected={props.selectedRowIndex === idx}
                    onSelectRow={() => props.onSelectRow(idx)}
                    onAddToCart={props.onAddToCart}
                    onEdit={props.onEdit}
                    onAdjustStock={props.onAdjustStock}
                    onDeactivate={props.onDeactivate}
                    onReactivate={props.onReactivate}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {filteredCount > 0 && (
          <div className="p-3 px-4 border-t border-border bg-surface-2/30 flex items-center justify-between gap-3 text-xs">
            <span className="text-text-muted">
              Página <strong className="text-text-primary">{currentPage}</strong> de{' '}
              <strong className="text-text-primary">{totalPages}</strong> ({filteredCount} productos)
            </span>
            <div className="flex items-center gap-1.5">
              <Button variant="secondary" size="sm" disabled={currentPage <= 1} onClick={props.onPreviousPage}
                className="h-8 px-2" title="Página anterior">
                <ChevronLeft size={14} />
                <span>Anterior</span>
              </Button>
              <Button variant="secondary" size="sm" disabled={currentPage >= totalPages} onClick={props.onNextPage}
                className="h-8 px-2" title="Página siguiente">
                <span>Siguiente</span>
                <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
