import React, { useState, useCallback, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import { RouteId, Company } from '@/types';
import type { CompanyRole } from '@/features/companies/types';
import { Sale, PaymentEntry, StockAdjustmentData, InitialStockBatchData } from '@/features/inventario/types';
import { MOCK_DATASETS, NAV_SECTIONS } from '@/data/mockData';
import { useCart } from '@/features/inventario/hooks/useCart';
import { useProducts } from '@/features/inventario/hooks/useProducts';
import { useCategories } from '@/features/inventario/hooks/useCategories';
import { useStockMovements } from '@/features/inventario/hooks/useStockMovements';
import { useSales } from '@/features/inventario/hooks/useSales';
import { useSuppliers } from '@/features/proveedores/hooks/useSuppliers';
import { executeSaleTransaction } from '@/features/inventario/api/checkoutTransaction';
import { AppShell } from '@/components/layout/AppShell';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { InventarioPage } from '@/features/inventario/InventarioPage';
import { VentasPage } from '@/features/ventas/VentasPage';
import { HistorialStockPage } from '@/features/historial/HistorialStockPage';
import { ProveedoresPage } from '@/features/proveedores/components/ProveedoresPage';
import { CartDrawer } from '@/features/inventario/components/CartDrawer';
import { CheckoutModal } from '@/features/inventario/components/CheckoutModal';
import { ReceiptModal } from '@/features/inventario/components/ReceiptModal';
import { EmptyState } from '@/components/shared/EmptyState';
import { AuthProvider, useAuth } from '@/features/auth/hooks/useAuth';
import { LoginPage } from '@/features/auth/components/LoginPage';
import { CompanyProvider, useCompany } from '@/features/companies/hooks/useCompany';
import { NoCompanyPage } from '@/features/companies/components/NoCompanyPage';
import { Button } from '@/components/ui/Button';
import { Loader2, Building2 } from 'lucide-react';
import type { ProfileRow } from '@/features/auth/types';

interface AppWorkspaceProps {
  user: User;
  profile: ProfileRow | null;
  companies: Company[];
  activeCompany: Company;
  userRole: CompanyRole | null;
  onSelectCompany: (company: Company) => void;
  onSignOut: () => void;
}

const AppWorkspace: React.FC<AppWorkspaceProps> = ({
  user,
  profile,
  companies,
  activeCompany,
  userRole,
  onSelectCompany,
  onSignOut,
}) => {
  const [activeRoute, setActiveRoute] = useState<RouteId>('dashboard');
  const isMasterAdmin = userRole === 'master_admin';

  // Centralized products state per tenant with stock adjustment capabilities
  const {
    products,
    isLoading: isProductsLoading,
    error: productsError,
    syncWarning: productsSyncWarning,
    createProduct,
    updateProduct,
    renameCategoryInProducts,
    deactivateProduct,
    reactivateProduct,
    adjustStock,
    importInitialStock,
    syncProductsFromTransaction,
    reloadProducts,
  } = useProducts(activeCompany.id, isMasterAdmin);

  // Formal categories catalog per tenant with cascade renaming to products
  const {
    categories,
    isLoading: isCategoriesLoading,
    error: categoriesError,
    createCategory,
    renameCategory,
    deleteCategory,
  } = useCategories(activeCompany.id, renameCategoryInProducts);

  // Stock movements ledger per tenant
  const {
    movements,
    isLoading: isMovementsLoading,
    error: movementsError,
    reloadMovements,
    syncMovementsFromTransaction,
  } = useStockMovements(activeCompany.id);

  // Manejador coordinado de ajuste manual de existencias
  const handleAdjustStock = useCallback(
    async (data: StockAdjustmentData) => {
      const res = await adjustStock(data);
      if (res.success) {
        reloadMovements().catch((err) =>
          console.warn('Error al recargar movimientos tras ajuste:', err)
        );
      }
      return res;
    },
    [adjustStock, reloadMovements]
  );

  // Manejador coordinado de carga inicial masiva de existencias
  const handleImportInitialStock = useCallback(
    async (data: InitialStockBatchData) => {
      const res = await importInitialStock(data);
      if (res.success) {
        reloadMovements().catch((err) =>
          console.warn('Error al recargar movimientos tras carga inicial:', err)
        );
      }
      return res;
    },
    [importInitialStock, reloadMovements]
  );

  // Persistent cart isolated per company
  const {
    items: cartItems,
    subtotal: cartSubtotal,
    discountPercent,
    discountAmount,
    total: cartTotal,
    totalItemsCount,
    addItem,
    updateQuantity,
    removeItem,
    setDiscount,
    clearCart,
  } = useCart(activeCompany.id);

  // Persistent sales state per tenant
  const {
    sales,
    syncSaleFromTransaction,
  } = useSales(activeCompany.id);

  // Persistent suppliers state per tenant
  const {
    suppliers,
    isLoading: isSuppliersLoading,
    error: suppliersError,
    reloadSuppliers,
    saveSupplier,
    toggleStatus: toggleSupplierStatus,
  } = useSuppliers(activeCompany.id);

  // Lock contra envíos concurrentes
  const isProcessingSaleRef = useRef(false);

  // Modal states
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [selectedReceiptSale, setSelectedReceiptSale] = useState<Sale | null>(null);

  // Item quantity helper
  const getItemQuantityInCart = useCallback(
    (productId: string): number => {
      const item = cartItems.find((i) => i.productId === productId);
      return item ? item.quantity : 0;
    },
    [cartItems]
  );

  // Confirm sale handler (atomic coordination of stock discount and sale recording)
  const handleConfirmSale = useCallback(
    async (clientName: string, payments: PaymentEntry[]) => {
      if (cartItems.length === 0) {
        return { success: false, error: 'El carrito está vacío.' };
      }

      if (isProcessingSaleRef.current) {
        return { success: false, error: 'Ya se está procesando una operación de venta.' };
      }

      // Defense in depth: Verify no inactive products are being sold
      const inactiveItems = cartItems.filter((item) => {
        const prod = products.find((p) => p.id === item.productId);
        return prod && prod.isActive === false;
      });

      if (inactiveItems.length > 0) {
        const names = inactiveItems.map((i) => `"${i.name}" (${i.sku})`).join(', ');
        return {
          success: false,
          error: `No se puede confirmar la venta porque el carrito contiene productos desactivados:\n${names}\n\nPor favor, quítalos del carrito o reactívalos en el catálogo antes de continuar.`,
        };
      }

      isProcessingSaleRef.current = true;

      try {
        const result = await executeSaleTransaction({
          tenantId: activeCompany.id,
          clientName,
          payments,
          cartItems,
          cartSubtotal,
          discountPercent,
          discountAmount,
          cartTotal,
        });

        if (!result.success) {
          return { success: false, error: result.error || 'No se pudo completar la venta.' };
        }

        // Éxito atómico comprobado en PostgreSQL
        if (result.sale) {
          syncSaleFromTransaction(result.sale);
        }

        // Recargar inventario y movimientos desde Supabase de forma coordinada
        Promise.all([
          reloadProducts().catch((err) => console.warn('Error al recargar productos:', err)),
          reloadMovements().catch((err) => console.warn('Error al recargar movimientos:', err)),
        ]);

        clearCart();
        setIsCheckoutOpen(false);
        setIsCartOpen(false);
        setSelectedReceiptSale(result.sale || null);
        setIsReceiptOpen(true);
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Error inesperado al procesar la venta.',
        };
      } finally {
        isProcessingSaleRef.current = false;
      }
    },
    [
      activeCompany.id,
      cartItems,
      products,
      cartSubtotal,
      discountPercent,
      discountAmount,
      cartTotal,
      clearCart,
      syncProductsFromTransaction,
      syncSaleFromTransaction,
      syncMovementsFromTransaction,
    ]
  );

  const isMockCompany = Boolean(MOCK_DATASETS[activeCompany.id]);
  const currentDataset = isMockCompany ? MOCK_DATASETS[activeCompany.id] : null;

  return (
    <>
      <AppShell
        sections={NAV_SECTIONS}
        activeRoute={activeRoute}
        onNavigate={setActiveRoute}
        companies={companies}
        activeCompany={activeCompany}
        onSelectCompany={(comp) => {
          onSelectCompany(comp);
          setIsCartOpen(false);
        }}
        cartItemsCount={totalItemsCount}
        cartTotal={cartTotal}
        onOpenCart={() => setIsCartOpen(true)}
        userName={profile?.full_name || undefined}
        userEmail={user.email || undefined}
        onSignOut={onSignOut}
      >
        {activeRoute === 'dashboard' && (
          <DashboardPage
            company={activeCompany}
            data={currentDataset}
            isMock={isMockCompany}
            onNavigateToInventario={() => setActiveRoute('inventario')}
            onNavigateToVentas={() => setActiveRoute('ventas')}
          />
        )}

        {activeRoute === 'inventario' && (
          <InventarioPage
            company={activeCompany}
            products={products}
            categories={categories}
            isProductsLoading={isProductsLoading}
            productsError={productsError}
            productsSyncWarning={productsSyncWarning}
            onReloadProducts={reloadProducts}
            isCategoriesLoading={isCategoriesLoading}
            categoriesError={categoriesError}
            isMasterAdmin={isMasterAdmin}
            cartItemsCount={totalItemsCount}
            cartTotal={cartTotal}
            getItemQuantityInCart={getItemQuantityInCart}
            onAddToCart={(product) => addItem(product, 1)}
            onOpenCart={() => setIsCartOpen(true)}
            onCreateProduct={createProduct}
            onUpdateProduct={updateProduct}
            onDeactivateProduct={deactivateProduct}
            onReactivateProduct={reactivateProduct}
            onAdjustStock={handleAdjustStock}
            onImportInitialStock={handleImportInitialStock}
            onCreateCategory={createCategory}
            onRenameCategory={renameCategory}
            onDeleteCategory={deleteCategory}
          />
        )}

        {activeRoute === 'ventas' && (
          <VentasPage
            company={activeCompany}
            sales={sales}
            onViewReceipt={(sale) => {
              setSelectedReceiptSale(sale);
              setIsReceiptOpen(true);
            }}
            onNavigateToInventario={() => setActiveRoute('inventario')}
          />
        )}

        {activeRoute === 'historial' && (
          <HistorialStockPage
            company={activeCompany}
            movements={movements}
            isLoading={isMovementsLoading}
            error={movementsError}
            onReload={reloadMovements}
            onNavigateToInventario={() => setActiveRoute('inventario')}
          />
        )}

        {activeRoute === 'proveedores' && (
          <ProveedoresPage
            company={activeCompany}
            suppliers={suppliers}
            isLoading={isSuppliersLoading}
            error={suppliersError}
            isMasterAdmin={isMasterAdmin}
            onReload={reloadSuppliers}
            onSaveSupplier={saveSupplier}
            onToggleStatus={toggleSupplierStatus}
          />
        )}

        {activeRoute !== 'dashboard' &&
          activeRoute !== 'inventario' &&
          activeRoute !== 'ventas' &&
          activeRoute !== 'historial' &&
          activeRoute !== 'proveedores' && (
            <EmptyState
              routeId={activeRoute}
              onNavigateHome={() => setActiveRoute('dashboard')}
            />
          )}
      </AppShell>

      {/* Cart Drawer */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={cartItems}
        products={products}
        subtotal={cartSubtotal}
        discountPercent={discountPercent}
        discountAmount={discountAmount}
        total={cartTotal}
        onUpdateQuantity={updateQuantity}
        onRemoveItem={removeItem}
        onSetDiscount={setDiscount}
        onClearCart={clearCart}
        onProceedToCheckout={() => {
          setIsCartOpen(false);
          setIsCheckoutOpen(true);
        }}
      />

      {/* Checkout Modal */}
      <CheckoutModal
        isOpen={isCheckoutOpen}
        total={cartTotal}
        onClose={() => setIsCheckoutOpen(false)}
        onConfirmSale={handleConfirmSale}
      />

      {/* Receipt Modal */}
      <ReceiptModal
        isOpen={isReceiptOpen}
        sale={selectedReceiptSale}
        company={activeCompany}
        onClose={() => {
          setIsReceiptOpen(false);
          setSelectedReceiptSale(null);
        }}
      />
    </>
  );
};

const AppAuthShell: React.FC = () => {
  const { user, profile, isLoading: isAuthLoading, signOut } = useAuth();
  const {
    companies,
    activeCompany,
    userRole,
    isLoading: isCompanyLoading,
    error: companyError,
    selectCompany,
    refreshCompanies,
  } = useCompany();

  if (isAuthLoading || (user && isCompanyLoading)) {
    return (
      <div className="min-h-screen w-full bg-bg flex flex-col justify-center items-center p-4">
        <div className="w-12 h-12 rounded-xl bg-surface-2 border border-border flex items-center justify-center p-2 mb-4 shadow-lg shadow-black/30">
          <img src="/stockly.png" alt="Logo de Stockly" className="w-full h-full object-contain" />
        </div>
        <div className="flex items-center gap-2 text-text-muted text-xs">
          <Loader2 size={16} className="animate-spin text-primary" />
          <span>Verificando membresías corporativas...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  if (companyError) {
    return (
      <div className="min-h-screen bg-bg flex flex-col justify-center items-center p-4">
        <div className="w-full max-w-md bg-surface border border-danger/40 rounded-2xl p-6 shadow-xl space-y-4 text-center">
          <div className="w-12 h-12 rounded-full bg-danger/10 text-danger flex items-center justify-center mx-auto">
            <Building2 className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-text-primary">Error al cargar empresas</h2>
          <p className="text-xs text-text-secondary leading-relaxed">{companyError}</p>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1 text-xs" onClick={refreshCompanies}>
              Reintentar
            </Button>
            <Button variant="danger" className="flex-1 text-xs" onClick={signOut}>
              Cerrar sesión
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!activeCompany || companies.length === 0) {
    return (
      <NoCompanyPage
        userEmail={user.email}
        userName={profile?.full_name}
        onSignOut={signOut}
        onRefresh={refreshCompanies}
      />
    );
  }

  return (
    <AppWorkspace
      user={user}
      profile={profile}
      companies={companies}
      activeCompany={activeCompany}
      userRole={userRole}
      onSelectCompany={(comp) => selectCompany(comp.id)}
      onSignOut={signOut}
    />
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <CompanyProvider>
        <AppAuthShell />
      </CompanyProvider>
    </AuthProvider>
  );
};

export default App;
