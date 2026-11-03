import React, { useState, useCallback, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import { RouteId, Company } from '@/types';
import type { CompanyRole } from '@/features/companies/types';
import { Sale, PaymentEntry } from '@/features/inventario/types';
import { NAV_SECTIONS } from '@/components/layout/navSections';
import { productsToRestock } from '@/features/dashboard/dashboardMetrics';
import { useCart } from '@/features/inventario/hooks/useCart';
import { useProducts } from '@/features/inventario/hooks/useProducts';
import { useCategories } from '@/features/inventario/hooks/useCategories';
import { useSuppliers } from '@/features/proveedores/hooks/useSuppliers';
import { useCustomers } from '@/features/clientes/hooks/useCustomers';
import { usePurchases } from '@/features/compras/hooks/usePurchases';
import { useCompanyMembers } from '@/features/companies/hooks/useCompanyMembers';
import { useCompanySettings } from '@/features/companies/hooks/useCompanySettings';
import { buildSaleRequest, executeSaleTransaction } from '@/features/inventario/api/checkoutTransaction';
import { useSaleIntent } from '@/features/inventario/hooks/useSaleIntent';
import { AppShell } from '@/components/layout/AppShell';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { InventarioPage } from '@/features/inventario/InventarioPage';
import { VentasPage } from '@/features/ventas/VentasPage';
import { HistorialStockPage } from '@/features/historial/HistorialStockPage';
import { ProveedoresPage } from '@/features/proveedores/components/ProveedoresPage';
import { ClientesPage } from '@/features/clientes/components/ClientesPage';
import { ComprasPage } from '@/features/compras/components/ComprasPage';
import { MembersPage } from '@/features/companies/components/MembersPage';
import { CompanySettingsPage } from '@/features/companies/components/CompanySettingsPage';
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

  // El Historial consulta sus movimientos (paginados) cada vez que se abre:
  // los ajustes y la carga inicial no necesitan recargarlo desde aquí
  const handleAdjustStock = adjustStock;
  const handleImportInitialStock = importInitialStock;

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

  // Persistent suppliers state per tenant
  const {
    suppliers,
    isLoading: isSuppliersLoading,
    error: suppliersError,
    reloadSuppliers,
    saveSupplier,
    toggleStatus: toggleSupplierStatus,
  } = useSuppliers(activeCompany.id);

  // Persistent customers state per tenant
  const {
    customers,
    isLoading: isCustomersLoading,
    error: customersError,
    reloadCustomers,
    saveCustomer,
    toggleStatus: toggleCustomerStatus,
  } = useCustomers(activeCompany.id);

  // Persistent purchases state per tenant (exclusivo master_admin)
  const {
    purchases,
    isLoading: isPurchasesLoading,
    error: purchasesError,
    syncWarning: purchasesSyncWarning,
    reloadPurchases,
    createPurchase,
  } = usePurchases(activeCompany.id, isMasterAdmin);

  // Miembros e invitaciones de la empresa activa
  const {
    members,
    invitations,
    isLoading: isMembersLoading,
    error: membersError,
    reload: reloadMembers,
    inviteUser,
    revokeInvitation,
    deactivateMember,
    reactivateMember,
  } = useCompanyMembers(activeCompany.id, isMasterAdmin);

  // Configuración de la empresa activa y política de stock negativo
  const {
    settings: companySettings,
    isLoading: isSettingsLoading,
    error: settingsError,
    reload: reloadSettings,
    updateNegativeStockPolicy,
  } = useCompanySettings(activeCompany.id);

  // Lock contra envíos concurrentes
  const isProcessingSaleRef = useRef(false);
  const {
    acquireKey: acquireSaleKey,
    markUncertain: markSaleUncertain,
    reset: resetSaleIntent,
  } = useSaleIntent();

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
    async (
      clientName: string,
      payments: PaymentEntry[],
      customerId?: string | null
    ) => {
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
        let customerDoc: string | null = null;
        if (customerId) {
          const found = customers.find((c) => c.id === customerId);
          if (found && found.taxId) {
            customerDoc = `${found.identificationType} ${found.taxId}`;
          }
        }

        const saleParams = {
          tenantId: activeCompany.id,
          customerId,
          customerDoc,
          clientName,
          payments,
          cartItems,
          cartSubtotal,
          discountPercent,
          discountAmount,
          cartTotal,
        };
        const saleRequest = buildSaleRequest(saleParams);

        // Misma clave en los reintentos del mismo cobro: el servidor no duplica la venta
        const idempotencyKey = acquireSaleKey(activeCompany.id, JSON.stringify(saleRequest));
        const result = await executeSaleTransaction(saleParams, saleRequest, idempotencyKey);

        if (!result.success) {
          if (result.isNetworkError) {
            markSaleUncertain();
          } else if (result.isIdempotencyConflict) {
            resetSaleIntent();
          }
          return { success: false, error: result.error || 'No se pudo completar la venta.' };
        }

        // Éxito atómico comprobado en PostgreSQL
        resetSaleIntent();

        // Recargar el inventario desde Supabase (Ventas e Historial se consultan al abrirlos)
        reloadProducts().catch((err) => console.warn('Error al recargar productos:', err));

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
      customers,
      cartItems,
      products,
      cartSubtotal,
      discountPercent,
      discountAmount,
      cartTotal,
      clearCart,
      syncProductsFromTransaction,
      reloadProducts,
      acquireSaleKey,
      markSaleUncertain,
      resetSaleIntent,
    ]
  );

  // Alerta del header: productos activos en o bajo su stock mínimo
  const restockCount = React.useMemo(() => productsToRestock(products).length, [products]);

  // Filtrar secciones del menú: compras exclusivo para master_admin
  const accessibleNavSections = React.useMemo(() => {
    if (isMasterAdmin) return NAV_SECTIONS;
    return NAV_SECTIONS.map((section) => ({
      ...section,
      items: section.items.filter((item) => item.id !== 'compras'),
    })).filter((section) => section.items.length > 0);
  }, [isMasterAdmin]);

  return (
    <>
      <AppShell
        sections={accessibleNavSections}
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
        restockCount={restockCount}
      >
        {activeRoute === 'dashboard' && (
          <DashboardPage
            company={activeCompany}
            products={products}
            isMasterAdmin={isMasterAdmin}
            onNavigateToInventario={() => setActiveRoute('inventario')}
            onNavigateToHistorial={() => setActiveRoute('historial')}
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
            customers={customers}
            isMasterAdmin={isMasterAdmin}
            onViewReceipt={(sale) => {
              setSelectedReceiptSale(sale);
              setIsReceiptOpen(true);
            }}
            onNavigateToInventario={() => setActiveRoute('inventario')}
            onSaleCancelled={() => {
              reloadProducts().catch((err) => console.warn('Error al recargar productos tras anulación:', err));
            }}
          />
        )}

        {activeRoute === 'historial' && (
          <HistorialStockPage
            company={activeCompany}
            products={products}
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

        {activeRoute === 'compras' && (
          <ComprasPage
            company={activeCompany}
            purchases={purchases}
            suppliers={suppliers}
            products={products}
            isLoading={isPurchasesLoading}
            error={purchasesError}
            syncWarning={purchasesSyncWarning}
            isMasterAdmin={isMasterAdmin}
            onReload={reloadPurchases}
            onSavePurchase={createPurchase}
            onPurchaseSuccess={() => {
              reloadProducts().catch((err) =>
                console.warn('Error al recargar productos tras compra:', err)
              );
            }}
            onNavigateHome={() => setActiveRoute('dashboard')}
          />
        )}

        {activeRoute === 'clientes' && (
          <ClientesPage
            company={activeCompany}
            customers={customers}
            isLoading={isCustomersLoading}
            error={customersError}
            isMasterAdmin={isMasterAdmin}
            onReload={reloadCustomers}
            onSaveCustomer={saveCustomer}
            onToggleStatus={toggleCustomerStatus}
          />
        )}

        {activeRoute === 'config-miembros' && (
          <MembersPage
            company={activeCompany}
            members={members}
            invitations={invitations}
            isLoading={isMembersLoading}
            error={membersError}
            currentUserId={user.id}
            isMasterAdmin={isMasterAdmin}
            isOwner={Boolean(activeCompany.isOwner)}
            onReload={reloadMembers}
            onInviteUser={inviteUser}
            onRevokeInvitation={revokeInvitation}
            onDeactivateMember={deactivateMember}
            onReactivateMember={reactivateMember}
          />
        )}

        {activeRoute === 'config-empresa' && (
          <CompanySettingsPage
            company={activeCompany}
            settings={companySettings}
            isLoading={isSettingsLoading}
            error={settingsError}
            isMasterAdmin={isMasterAdmin}
            onReload={reloadSettings}
            onUpdateNegativeStockPolicy={updateNegativeStockPolicy}
          />
        )}

        {activeRoute !== 'dashboard' &&
          activeRoute !== 'inventario' &&
          activeRoute !== 'ventas' &&
          activeRoute !== 'historial' &&
          activeRoute !== 'proveedores' &&
          activeRoute !== 'compras' &&
          activeRoute !== 'clientes' &&
          activeRoute !== 'config-miembros' &&
          activeRoute !== 'config-empresa' && (
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
        customers={customers}
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
