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
import { downloadSpreadsheet } from './excel/excelIO';
import { buildExportTable, exportFileName } from './excel/exportRows';

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
  const categoryNames = useMemo(() => categories.map((c) => c.name), [categories]);
  const filters = useProductFilters(products, categoryNames, company.id, props.searchRequest ?? null);
  const openCreate = () => setDialog({ kind: 'create' });
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Exporta todos los productos (no solo la página que se ve), con el costo solo si se puede ver
  const exportExcel = async () => {
    setIsExporting(true);
    setExportError(null);
    try {
      await downloadSpreadsheet(buildExportTable(products, { includeCosts: isMasterAdmin }), exportFileName(company.name, new Date()));
    } catch {
      setExportError('No se pudo generar el archivo de Excel. Intentá de nuevo.');
    } finally {
      setIsExporting(false);
    }
  };

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
        onExportExcel={() => void exportExcel()}
        isExporting={isExporting}
      />

      {exportError && <p role="alert" className="p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs">{exportError}</p>}

      <CatalogAlerts error={productsError} syncWarning={props.productsSyncWarning ?? null} onReload={props.onReloadProducts} />

      <ProductFilters
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
      />

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
        onEdit={isMasterAdmin ? (product) => setDialog({ kind: 'edit', product }) : undefined}
        onAdjustStock={isMasterAdmin ? (product) => setDialog({ kind: 'adjust', product }) : undefined}
        onDeactivate={isMasterAdmin ? (product) => setDialog({ kind: 'deactivate', product }) : undefined}
        onReactivate={isMasterAdmin ? (product) => void props.onReactivateProduct(product.id) : undefined}
      />

      <InventoryDialogs
        dialog={dialog}
        onClose={() => setDialog({ kind: 'none' })}
        company={company}
        products={products}
        categories={categories}
        isCategoriesLoading={props.isCategoriesLoading ?? false}
        categoriesError={props.categoriesError ?? null}
        isMasterAdmin={isMasterAdmin}
        onCreateProduct={props.onCreateProduct}
        onUpdateProduct={props.onUpdateProduct}
        onDeactivateProduct={props.onDeactivateProduct}
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
