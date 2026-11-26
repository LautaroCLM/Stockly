import React, { useMemo, useState } from 'react';
import type {
  Product,
  ProductFormData,
  StockAdjustmentData,
  StockAdjustmentResult,
  InitialStockBatchData,
  InitialStockResult,
  Category,
} from './types';
import type { Company } from '@/types';
import { ProductFilters } from './components/ProductFilters';
import { InventoryHeader } from './components/InventoryHeader';
import { CatalogAlerts } from './components/CatalogAlerts';
import { ProductsTable } from './components/ProductsTable';
import { InventoryDialogs, type InventoryDialog } from './components/InventoryDialogs';
import { useProductFilters } from './hooks/useProductFilters';
import { useExcelExport } from './hooks/useExcelExport';
import { LabelsModal } from '@/features/etiquetas/components/LabelsModal';
import { labelFromProduct } from '@/features/etiquetas/types';
import { pickProductForQuery } from './saleShortcuts';
import { SaleShortcutHints } from './components/SaleShortcutHints';
import { useProductNotices } from './hooks/useProductNotices';

type SimpleResult = { success: boolean; error?: string };
type CategoryResult = { success: boolean; error?: string; category?: Category };

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
  /** Quita una unidad del producto del carrito. */
  onRemoveOneFromCart?: (product: Product) => void;
  onOpenCart: () => void;
  onCreateProduct: (data: ProductFormData) => Promise<SimpleResult> | SimpleResult;
  onUpdateProduct: (id: string, data: ProductFormData) => Promise<SimpleResult> | SimpleResult;
  onDeactivateProduct: (id: string) => Promise<SimpleResult> | SimpleResult;
  onReactivateProduct: (id: string) => Promise<SimpleResult> | SimpleResult;
  onAdjustStock: (data: StockAdjustmentData) => Promise<StockAdjustmentResult> | StockAdjustmentResult;
  onImportInitialStock?: (data: InitialStockBatchData) => Promise<InitialStockResult>;
  onCreateCategory: (name: string, description?: string) => Promise<CategoryResult>;
  onRenameCategory: (id: string, newName: string) => Promise<CategoryResult>;
  onDeleteCategory: (id: string, productCount: number) => Promise<SimpleResult>;
  /** Búsqueda pedida desde el encabezado; `id` cambia en cada búsqueda nueva. */
  searchRequest?: { query: string; id: number } | null;
}

/** Inventario y venta en mostrador: catálogo, filtros, carrito y diálogos de gestión. */
export const InventarioPage: React.FC<InventarioPageProps> = (props) => {
  const { company, products, categories, isMasterAdmin = true, productsError = null } = props;
  const [dialog, setDialog] = useState<InventoryDialog>({ kind: 'none' });
  const productActions = useProductNotices(props);
  const categoryNames = useMemo(() => categories.map((c) => c.name), [categories]);
  const filters = useProductFilters(products, categoryNames, company.id, props.searchRequest ?? null);
  // Las sugerencias respetan el filtro Activos / Inactivos / Todos
  const suggestionProducts = useMemo(
    () => products.filter((p) => filters.activeFilter === 'all' || (p.isActive !== false) === (filters.activeFilter === 'active')),
    [products, filters.activeFilter]
  );
  const openCreate = () => setDialog({ kind: 'create' });
  const focusFirstRow = () => document.querySelector<HTMLElement>('[data-products-table] [data-product-row]')?.focus();

  // Enter en el buscador: agrega lo escaneado (o el único resultado) y deja el buscador listo para el siguiente
  const submitSearch = () => {
    const product = pickProductForQuery(filters.searchQuery, filters.filteredProducts, products);
    if (product) {
      props.onAddToCart(product);
      filters.setSearchQuery('');
    } else if (filters.filteredProducts.length > 0) {
      focusFirstRow();
    }
  };
  const excel = useExcelExport(company, products, isMasterAdmin);
  const { exportInfo, exportError } = excel;
  // Etiquetas de precio: con pocos productos filtrados arrancan todos marcados
  const [isLabelsOpen, setIsLabelsOpen] = useState(false);
  const labelCandidates = filters.filteredProducts.filter((p) => p.isActive !== false);

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-12">
      <InventoryHeader
        companyName={company.name}
        isMasterAdmin={isMasterAdmin}
        canImportInitialStock={Boolean(props.onImportInitialStock)}
        cartItemsCount={props.cartItemsCount}
        cartTotal={props.cartTotal}
        onManageCategories={() => setDialog({ kind: 'categories' })}
        onNewProduct={openCreate}
        onInitialStock={() => setDialog({ kind: 'initialStock' })}
        onOpenCart={props.onOpenCart}
        onImportExcel={() => setDialog({ kind: 'importExcel' })}
        onExportExcel={() => void excel.exportExcel()}
        isExporting={excel.isExporting}
        onPrintLabels={() => setIsLabelsOpen(true)}
      />

      {exportInfo && (
        <p role="status" className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between gap-2">
          <span>{exportInfo}</span>
          <button type="button" onClick={excel.clearInfo} className="underline shrink-0">Cerrar</button>
        </p>
      )}

      {exportError && <p role="alert" className="p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs">{exportError}</p>}

      <CatalogAlerts error={productsError} syncWarning={props.productsSyncWarning ?? null} onReload={props.onReloadProducts} />

      <ProductFilters
        suggestionProducts={suggestionProducts}
        searchQuery={filters.searchQuery}
        onSearchChange={filters.setSearchQuery}
        categories={categoryNames}
        selectedCategory={filters.selectedCategory}
        onCategoryChange={filters.setSelectedCategory}
        activeFilter={filters.activeFilter}
        onActiveFilterChange={filters.setActiveFilter}
        selectedStatus={filters.selectedStatus}
        onStatusChange={filters.setSelectedStatus}
        totalFiltered={filters.filteredProducts.length}
        onSearchSubmit={submitSearch}
        onFocusTable={focusFirstRow}
      />

      <SaleShortcutHints />

      <ProductsTable
        pageProducts={filters.pageProducts}
        filteredCount={filters.filteredProducts.length}
        isCatalogEmpty={products.length === 0}
        isLoading={props.isProductsLoading ?? false}
        loadError={productsError}
        currentPage={filters.currentPage}
        totalPages={filters.totalPages}
        selectedRowIndex={filters.selectedRowIndex}
        getQuantityInCart={props.getItemQuantityInCart}
        onSelectRow={filters.setSelectedRowIndex}
        onPreviousPage={filters.goToPreviousPage}
        onNextPage={filters.goToNextPage}
        onClearFilters={filters.clearFilters}
        onCreateProduct={openCreate}
        onAddToCart={props.onAddToCart}
        onRemoveOne={props.onRemoveOneFromCart}
        onEdit={isMasterAdmin ? (product) => setDialog({ kind: 'edit', product }) : undefined}
        onAdjustStock={isMasterAdmin ? (product) => setDialog({ kind: 'adjust', product }) : undefined}
        onDeactivate={isMasterAdmin ? (product) => setDialog({ kind: 'deactivate', product }) : undefined}
        onReactivate={isMasterAdmin ? (product) => void productActions.reactivate(product.id) : undefined}
      />

      <LabelsModal isOpen={isLabelsOpen} onClose={() => setIsLabelsOpen(false)} labels={labelCandidates.map(labelFromProduct)}
        initialSelected={labelCandidates.length <= 30 ? labelCandidates.map((p) => p.id) : []}
        subtitle="Se listan los productos activos según los filtros de Inventario. Se imprimen 21 por hoja A4." />

      <InventoryDialogs
        dialog={dialog}
        onClose={() => setDialog({ kind: 'none' })}
        company={company}
        products={products}
        categories={categories}
        isCategoriesLoading={props.isCategoriesLoading ?? false}
        categoriesError={props.categoriesError ?? null}
        isMasterAdmin={isMasterAdmin}
        onCreateProduct={productActions.create}
        onUpdateProduct={productActions.update}
        onDeactivateProduct={productActions.deactivate}
        onAdjustStock={props.onAdjustStock}
        onImportInitialStock={props.onImportInitialStock}
        onProductsImported={props.onReloadProducts}
        onCreateCategory={props.onCreateCategory}
        onRenameCategory={props.onRenameCategory}
        onDeleteCategory={props.onDeleteCategory}
      />
    </div>
  );
};
