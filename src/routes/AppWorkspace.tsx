import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import type { RouteId, Company } from '@/types';
import type { CompanyRole } from '@/features/companies/types';
import type { ProfileRow } from '@/features/auth/types';
import type { Sale } from '@/features/inventario/types';
import { NAV_SECTIONS } from '@/components/layout/navSections';
import { AppShell } from '@/components/layout/AppShell';
import { productsToRestock } from '@/features/dashboard/dashboardMetrics';
import { useCart } from '@/features/inventario/hooks/useCart';
import { useProducts } from '@/features/inventario/hooks/useProducts';
import { useCategories } from '@/features/inventario/hooks/useCategories';
import { useCheckout } from '@/features/inventario/hooks/useCheckout';
import { useSuppliers } from '@/features/proveedores/hooks/useSuppliers';
import { useCustomers } from '@/features/clientes/hooks/useCustomers';
import { useCompanyMembers } from '@/features/companies/hooks/useCompanyMembers';
import { useCompanySettings } from '@/features/companies/hooks/useCompanySettings';
import { useCompanyRealtime } from '@/features/realtime/hooks/useCompanyRealtime';
import { CartDrawer } from '@/features/inventario/components/CartDrawer';
import { CheckoutModal } from '@/features/inventario/components/CheckoutModal';
import { ReceiptModal } from '@/features/inventario/components/ReceiptModal';
import { WorkspaceRoutes } from './WorkspaceRoutes';
import { PageEnter } from '@/components/motion/PageEnter';
import { useModulePermissions } from '@/features/permisos/hooks/useModulePermissions';
import { atLeast, effectiveLevel, isRouteVisible } from '@/features/permisos/access';


interface AppWorkspaceProps {
  user: User;
  profile: ProfileRow | null;
  companies: Company[];
  activeCompany: Company;
  userRole: CompanyRole | null;
  onSelectCompany: (company: Company) => void;
  onSignOut: () => void;
}

/** Espacio de trabajo de la empresa activa: datos compartidos, menú, pantallas y venta. */
export const AppWorkspace: React.FC<AppWorkspaceProps> = ({
  user,
  profile,
  companies,
  activeCompany,
  userRole,
  onSelectCompany,
  onSignOut,
}) => {
  const companyId = activeCompany.id;
  const isMasterAdmin = userRole === 'master_admin';
  const [activeRoute, setActiveRoute] = useState<RouteId>('dashboard');
  // Qué módulos puede usar el rol empleado (los configura el administrador, en vivo)
  const permissions = useModulePermissions(companyId);

  // Búsqueda del encabezado: abre Inventario filtrado. Se descarta al salir de Inventario.
  const [inventorySearch, setInventorySearch] = useState<{ query: string; id: number } | null>(null);
  const handleHeaderSearch = useCallback((query: string) => {
    setInventorySearch({ query, id: Date.now() });
    setActiveRoute('inventario');
  }, []);
  useEffect(() => {
    if (activeRoute !== 'inventario') setInventorySearch(null);
  }, [activeRoute]);

  // Cambios hechos por otros usuarios de la empresa: recarga los datos afectados
  useCompanyRealtime(companyId);

  // Los costos de los productos se cargan solo para quien puede verlos o gestionarlos
  const canSeeCosts = atLeast(effectiveLevel(isMasterAdmin, permissions.levels, 'productos'), 'view');
  const catalog = useProducts(companyId, canSeeCosts);
  const categories = useCategories(companyId, catalog.renameCategoryInProducts);
  const cart = useCart(companyId);
  const suppliers = useSuppliers(companyId);
  const customers = useCustomers(companyId);
  const members = useCompanyMembers(companyId, isMasterAdmin);
  const settings = useCompanySettings(companyId);

  const [isCartOpen, setIsCartOpen] = useState(false);
  const [receiptSale, setReceiptSale] = useState<Sale | null>(null);
  const showReceipt = useCallback((sale: Sale | null) => {
    setIsCartOpen(false);
    setReceiptSale(sale);
  }, []);

  const checkout = useCheckout({
    companyId,
    cart,
    products: catalog.products,
    customers: customers.customers,
    reloadProducts: catalog.reloadProducts,
    onSaleCompleted: showReceipt,
  });

  const getItemQuantityInCart = useCallback(
    (productId: string) => cart.items.find((i) => i.productId === productId)?.quantity ?? 0,
    [cart.items]
  );

  // Alerta del header: productos activos en o bajo su stock mínimo
  const restockCount = useMemo(() => productsToRestock(catalog.products).length, [catalog.products]);

  // Compras, Finanzas y Empleados muestran costos o datos sensibles: solo administradores
  const navSections = useMemo(
    () =>
      NAV_SECTIONS.map((section) => ({
        ...section,
        items: section.items.filter((item) => isRouteVisible(item.id, isMasterAdmin, permissions.levels)),
      })).filter((section) => section.items.length > 0),
    [isMasterAdmin, permissions.levels]
  );

  // Si le quitan el acceso a la pantalla en la que está, vuelve al inicio
  useEffect(() => {
    if (!isRouteVisible(activeRoute, isMasterAdmin, permissions.levels)) setActiveRoute('dashboard');
  }, [activeRoute, isMasterAdmin, permissions.levels]);

  return (
    <>
      <AppShell
        sections={navSections}
        activeRoute={activeRoute}
        onNavigate={setActiveRoute}
        companies={companies}
        activeCompany={activeCompany}
        onSelectCompany={(comp) => {
          onSelectCompany(comp);
          setIsCartOpen(false);
        }}
        cartItemsCount={cart.totalItemsCount}
        cartTotal={cart.total}
        onOpenCart={() => setIsCartOpen(true)}
        onSearch={handleHeaderSearch}
        userName={profile?.full_name || undefined}
        userEmail={user.email || undefined}
        onSignOut={onSignOut}
        restockCount={restockCount}
      >
        <PageEnter routeKey={activeRoute}>
        <WorkspaceRoutes
          route={activeRoute}
          onNavigate={setActiveRoute}
          company={activeCompany}
          currentUserId={user.id}
          isMasterAdmin={isMasterAdmin}
          permissionLevels={permissions.levels}
          inventorySearch={inventorySearch}
          catalog={catalog}
          categories={categories}
          suppliers={suppliers}
          customers={customers}
          members={members}
          settings={settings}
          cart={{
            totalItemsCount: cart.totalItemsCount,
            total: cart.total,
            getQuantity: getItemQuantityInCart,
            addProduct: (product) => cart.addItem(product, 1),
            open: () => setIsCartOpen(true),
          }}
          onViewReceipt={setReceiptSale}
        />
        </PageEnter>
      </AppShell>

      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={cart.items}
        products={catalog.products}
        subtotal={cart.subtotal}
        discountPercent={cart.discountPercent}
        discountAmount={cart.discountAmount}
        total={cart.total}
        onUpdateQuantity={cart.updateQuantity}
        onRemoveItem={cart.removeItem}
        onSetDiscount={cart.setDiscount}
        onClearCart={cart.clearCart}
        onProceedToCheckout={() => {
          setIsCartOpen(false);
          checkout.setIsCheckoutOpen(true);
        }}
      />

      <CheckoutModal
        isOpen={checkout.isCheckoutOpen}
        total={cart.total}
        customers={customers.customers}
        onClose={() => checkout.setIsCheckoutOpen(false)}
        onConfirmSale={checkout.confirmSale}
      />

      <ReceiptModal
        isOpen={receiptSale !== null}
        sale={receiptSale}
        company={activeCompany}
        onClose={() => setReceiptSale(null)}
      />
    </>
  );
};
