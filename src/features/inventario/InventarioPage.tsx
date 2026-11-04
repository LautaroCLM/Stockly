import React, { useState, useMemo } from 'react';
import {
  Product,
  StockStatus,
  ProductFormData,
  StockAdjustmentData,
  StockAdjustmentResult,
  InitialStockBatchData,
  InitialStockResult,
  Category,
} from './types';
import { Company } from '@/types';
import { ProductFilters } from './components/ProductFilters';
import { ProductTableRow } from './components/ProductTableRow';
import { ProductFormModal } from './components/ProductFormModal';
import { StockAdjustmentModal } from './components/StockAdjustmentModal';
import { InitialStockModal } from './components/InitialStockModal';
import { ConfirmDeactivateModal } from './components/ConfirmDeactivateModal';
import { CategoryManagementModal } from './components/CategoryManagementModal';
import { ProductsEmptyState } from './components/ProductsEmptyState';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/formatters';
import {
  Boxes,
  ShoppingCart,
  Plus,
  PackagePlus,
  ChevronLeft,
  ChevronRight,
  FolderTree,
  Loader2,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';

interface InventarioPageProps {
  company: Company;
  products: Product[];
  categories: Category[];
  isProductsLoading?: boolean;
  productsError?: string | null;
  productsSyncWarning?: string | null;
  onReloadProducts?: () => void;
  isCategoriesLoading?: boolean;
  categoriesError?: string | null;
  isMasterAdmin?: boolean;
  cartItemsCount: number;
  cartTotal: number;
  getItemQuantityInCart: (productId: string) => number;
  onAddToCart: (product: Product) => void;
  onOpenCart: () => void;
  onCreateProduct: (data: ProductFormData) => Promise<{ success: boolean; error?: string }> | { success: boolean; error?: string };
  onUpdateProduct: (id: string, data: ProductFormData) => Promise<{ success: boolean; error?: string }> | { success: boolean; error?: string };
  onDeactivateProduct: (id: string) => Promise<{ success: boolean; error?: string }> | { success: boolean; error?: string };
  onReactivateProduct: (id: string) => Promise<{ success: boolean; error?: string }> | { success: boolean; error?: string };
  onAdjustStock: (data: StockAdjustmentData) => Promise<StockAdjustmentResult> | StockAdjustmentResult;
  onImportInitialStock?: (data: InitialStockBatchData) => Promise<InitialStockResult>;
  onCreateCategory: (name: string, description?: string) => Promise<{ success: boolean; error?: string; category?: Category }>;
  onRenameCategory: (id: string, newName: string) => Promise<{ success: boolean; error?: string; category?: Category }>;
  onDeleteCategory: (id: string, productCount: number) => Promise<{ success: boolean; error?: string }>;
}

const ITEMS_PER_PAGE = 8;

export const InventarioPage: React.FC<InventarioPageProps> = ({
  company,
  products,
  categories,
  isProductsLoading = false,
  productsError = null,
  productsSyncWarning = null,
  onReloadProducts,
  isCategoriesLoading = false,
  categoriesError = null,
  isMasterAdmin = true,
  cartItemsCount,
  cartTotal,
  getItemQuantityInCart,
  onAddToCart,
  onOpenCart,
  onCreateProduct,
  onUpdateProduct,
  onDeactivateProduct,
  onReactivateProduct,
  onAdjustStock,
  onImportInitialStock,
  onCreateCategory,
  onRenameCategory,
  onDeleteCategory,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | StockStatus>('all');
  const [activeFilter, setActiveFilter] = useState<'active' | 'inactive' | 'all'>('active');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);

  // Modal form states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [productToEdit, setProductToEdit] = useState<Product | null>(null);

  // Stock adjustment modal states
  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
  const [productToAdjust, setProductToAdjust] = useState<Product | null>(null);

  // Initial stock modal state
  const [isInitialStockModalOpen, setIsInitialStockModalOpen] = useState(false);

  // Deactivate confirmation modal state
  const [productToDeactivate, setProductToDeactivate] = useState<Product | null>(null);

  // Category management modal state
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

  // Category names list for selectors and filters
  const categoryNames = useMemo(() => {
    return categories.map((c) => c.name);
  }, [categories]);

  // If active filter category is deleted, reset to 'all'
  React.useEffect(() => {
    if (selectedCategory !== 'all' && !categoryNames.includes(selectedCategory)) {
      setSelectedCategory('all');
    }
  }, [selectedCategory, categoryNames]);

  // Filter products by search query, category, status, and active/inactive state
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.barcode.includes(q);

      const matchesCategory =
        selectedCategory === 'all' || p.category === selectedCategory;

      const matchesStatus =
        selectedStatus === 'all' || p.status === selectedStatus;

      const isProductActive = p.isActive !== false;
      const matchesActiveFilter =
        activeFilter === 'all' ||
        (activeFilter === 'active' && isProductActive) ||
        (activeFilter === 'inactive' && !isProductActive);

      return matchesSearch && matchesCategory && matchesStatus && matchesActiveFilter;
    });
  }, [products, searchQuery, selectedCategory, selectedStatus, activeFilter]);

  // Reset pagination when filters change
  React.useEffect(() => {
    setCurrentPage(1);
    setSelectedRowIndex(null);
  }, [searchQuery, selectedCategory, selectedStatus, activeFilter, company.id]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / ITEMS_PER_PAGE));
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredProducts.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredProducts, currentPage]);

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-12">
      {/* Top Banner / Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border/60">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-center text-primary">
            <Boxes size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-text-primary">
                Inventario y Venta en Mostrador
              </h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-surface-2 text-text-muted border border-border">
                {company.name}
              </span>
            </div>
            <p className="text-xs text-text-muted mt-0.5">
              Catálogo activo de productos con búsqueda instantánea, carrito integrado y ajustes de existencias.
            </p>
          </div>
        </div>

        {/* Action Buttons: Gestionar Categorías + Nuevo Producto + Carrito */}
        <div className="flex items-center gap-2.5">
          {isMasterAdmin && (
            <>
              <Button
                variant="secondary"
                size="md"
                onClick={() => setIsCategoryModalOpen(true)}
                className="gap-1.5 font-medium border-border hover:bg-surface-2"
                title="Administrar el catálogo formal de categorías de esta empresa"
              >
                <FolderTree size={16} className="text-primary" />
                <span>Gestionar categorías</span>
              </Button>

              <Button
                variant="secondary"
                size="md"
                onClick={() => {
                  setFormMode('create');
                  setProductToEdit(null);
                  setIsFormOpen(true);
                }}
                className="gap-1.5 font-medium border-border hover:bg-surface-2"
                title="Crear un nuevo producto en esta empresa"
              >
                <Plus size={16} className="text-primary" />
                <span>Nuevo Producto</span>
              </Button>

              {onImportInitialStock && (
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => setIsInitialStockModalOpen(true)}
                  className="gap-1.5 font-medium border-border hover:bg-surface-2"
                  title="Cargar existencias de apertura y costos iniciales para productos sin movimientos"
                >
                  <PackagePlus size={16} className="text-primary" />
                  <span>Cargar stock inicial</span>
                </Button>
              )}
            </>
          )}

          <Button
            variant="primary"
            size="md"
            onClick={onOpenCart}
            className="shadow-lg shadow-primary/20 relative"
          >
            <ShoppingCart size={16} />
            <span>Carrito ({cartItemsCount})</span>
            {cartItemsCount > 0 && (
              <span className="font-bold tabular-nums ml-1 px-1.5 py-0.2 rounded bg-black/30 text-xs">
                {formatCurrency(cartTotal)}
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* Global Products Error Alert */}
      {productsError && (
        <div className="p-3 bg-danger/10 border border-danger/30 rounded-xl text-xs text-danger flex items-center justify-between gap-2 animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="shrink-0" />
            <span>{productsError}</span>
          </div>
          {onReloadProducts && (
            <Button
              variant="outline"
              size="sm"
              onClick={onReloadProducts}
              className="h-7 text-xs border-danger/30 hover:bg-danger/20 text-danger shrink-0 gap-1.5"
            >
              <RotateCcw size={13} />
              Reintentar
            </Button>
          )}
        </div>
      )}

      {/* Global Catalog Sync Warning Alert */}
      {productsSyncWarning && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300 flex items-center justify-between gap-2 animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="shrink-0 text-amber-400" />
            <span>{productsSyncWarning}</span>
          </div>
          {onReloadProducts && (
            <Button
              variant="outline"
              size="sm"
              onClick={onReloadProducts}
              className="h-7 text-xs border-amber-500/30 hover:bg-amber-500/20 text-amber-300 shrink-0 gap-1.5"
            >
              <RotateCcw size={13} />
              Reintentar recarga
            </Button>
          )}
        </div>
      )}

      {/* Filters & Search Toolbar */}
      <ProductFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        categories={categoryNames}
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        activeFilter={activeFilter}
        onActiveFilterChange={setActiveFilter}
        selectedStatus={selectedStatus}
        onStatusChange={setSelectedStatus}
        totalFiltered={filteredProducts.length}
      />

      {/* Products Table Card */}
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
                {isProductsLoading && products.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center">
                      <div className="flex items-center justify-center gap-2 text-xs text-text-muted">
                        <Loader2 size={16} className="animate-spin text-primary" />
                        <span>Cargando catálogo de productos desde PostgreSQL...</span>
                      </div>
                    </td>
                  </tr>
                ) : paginatedProducts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center">
                      <ProductsEmptyState
                        isCatalogEmpty={products.length === 0}
                        onClearFilters={() => {
                          setSearchQuery('');
                          setSelectedCategory('all');
                          setSelectedStatus('all');
                          setActiveFilter('all');
                        }}
                        onCreateProduct={() => {
                          setFormMode('create');
                          setProductToEdit(null);
                          setIsFormOpen(true);
                        }}
                      />
                    </td>
                  </tr>
                ) : (
                  paginatedProducts.map((product, idx) => (
                    <ProductTableRow
                      key={product.id}
                      product={product}
                      quantityInCart={getItemQuantityInCart(product.id)}
                      isSelected={selectedRowIndex === idx}
                      onSelectRow={() => setSelectedRowIndex(idx)}
                      onAddToCart={onAddToCart}
                      onEdit={
                        isMasterAdmin
                          ? (p) => {
                              setFormMode('edit');
                              setProductToEdit(p);
                              setIsFormOpen(true);
                            }
                          : undefined
                      }
                      onAdjustStock={
                        isMasterAdmin
                          ? (p) => {
                              setProductToAdjust(p);
                              setIsAdjustmentModalOpen(true);
                            }
                          : undefined
                      }
                      onDeactivate={isMasterAdmin ? (p) => setProductToDeactivate(p) : undefined}
                      onReactivate={isMasterAdmin ? (p) => onReactivateProduct(p.id) : undefined}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {filteredProducts.length > 0 && (
            <div className="p-3 px-4 border-t border-border bg-surface-2/30 flex items-center justify-between gap-3 text-xs">
              <span className="text-text-muted">
                Página <strong className="text-text-primary">{currentPage}</strong> de{' '}
                <strong className="text-text-primary">{totalPages}</strong> (
                {filteredProducts.length} productos)
              </span>

              <div className="flex items-center gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="h-8 px-2"
                  title="Página anterior"
                >
                  <ChevronLeft size={14} />
                  <span>Anterior</span>
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="h-8 px-2"
                  title="Página siguiente"
                >
                  <span>Siguiente</span>
                  <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Product Form Modal (Create & Edit) */}
      <ProductFormModal
        isOpen={isFormOpen}
        mode={formMode}
        initialProduct={productToEdit}
        existingCategories={categoryNames}
        canManageCosts={isMasterAdmin}
        onClose={() => {
          setIsFormOpen(false);
          setProductToEdit(null);
        }}
        onSubmit={async (formData) => {
          const catId = categories.find(
            (c) => c.name.toLowerCase() === formData.category.trim().toLowerCase()
          )?.id;

          const payloadWithCatId = {
            ...formData,
            categoryId: catId,
          };

          if (formMode === 'create') {
            return await onCreateProduct(payloadWithCatId);
          } else if (productToEdit) {
            return await onUpdateProduct(productToEdit.id, payloadWithCatId);
          }
          return { success: false, error: 'Operación no válida' };
        }}
      />

      {/* Stock Adjustment Modal */}
      <StockAdjustmentModal
        isOpen={isAdjustmentModalOpen}
        product={productToAdjust}
        onClose={() => {
          setIsAdjustmentModalOpen(false);
          setProductToAdjust(null);
        }}
        onSubmit={onAdjustStock}
      />

      {/* Initial Stock Modal */}
      {onImportInitialStock && (
        <InitialStockModal
          isOpen={isInitialStockModalOpen}
          onClose={() => setIsInitialStockModalOpen(false)}
          companyId={company.id}
          companyName={company.name}
          products={products}
          isMasterAdmin={isMasterAdmin}
          onSubmit={onImportInitialStock}
        />
      )}

      {/* Confirm Deactivate Modal */}
      <ConfirmDeactivateModal
        isOpen={!!productToDeactivate}
        product={productToDeactivate}
        onClose={() => setProductToDeactivate(null)}
        onConfirm={async () => {
          if (productToDeactivate) {
            await onDeactivateProduct(productToDeactivate.id);
            setProductToDeactivate(null);
          }
        }}
      />

      {/* Category Management Modal */}
      <CategoryManagementModal
        isOpen={isCategoryModalOpen}
        companyName={company.name}
        categories={categories}
        products={products}
        isLoading={isCategoriesLoading}
        error={categoriesError}
        onClose={() => setIsCategoryModalOpen(false)}
        onCreateCategory={onCreateCategory}
        onRenameCategory={onRenameCategory}
        onDeleteCategory={onDeleteCategory}
      />
    </div>
  );
};
