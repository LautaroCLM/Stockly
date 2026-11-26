import React, { useCallback, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import type { RouteId, Company } from '@/types';
import type { CompanyRole } from '@/features/companies/types';
import type { ProfileRow } from '@/features/auth/types';
import { AppShell } from '@/components/layout/AppShell';
import { useNotices } from '@/features/avisos/hooks/useNotices';
import { useCart } from '@/features/inventario/hooks/useCart';
import { useProducts } from '@/features/inventario/hooks/useProducts';
import { useCategories } from '@/features/inventario/hooks/useCategories';
import { useSuppliers } from '@/features/proveedores/hooks/useSuppliers';
import { useCustomers } from '@/features/clientes/hooks/useCustomers';
import { useCompanyMembers } from '@/features/companies/hooks/useCompanyMembers';
import { useCompanySettings } from '@/features/companies/hooks/useCompanySettings';
import { useCompanyRealtime } from '@/features/realtime/hooks/useCompanyRealtime';
import { CartDrawer } from '@/features/inventario/components/CartDrawer';
import { CheckoutModal } from '@/features/inventario/components/CheckoutModal';
import { ReceiptModal } from '@/features/inventario/components/ReceiptModal';
import { WorkspaceRoutes } from './WorkspaceRoutes';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { PageEnter } from '@/components/motion/PageEnter';
import { useModulePermissions } from '@/features/permisos/hooks/useModulePermissions';
import { atLeast, effectiveLevel, isRouteVisible } from '@/features/permisos/access';
import { useHiddenRoutes } from '@/features/preferencias/hooks/useHiddenRoutes';
import { useWorkspaceNav } from './useWorkspaceNav';
import { useSaleFlow } from './useSaleFlow';


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

  const sale = useSaleFlow({
    companyId,
    cart,
    products: catalog.products,
    customers: customers.customers,
    reloadProducts: catalog.reloadProducts,
    canCancelSales: atLeast(effectiveLevel(isMasterAdmin, permissions.levels, 'anular_ventas'), 'operate'),
  });
  const { checkout, receiptSale, setReceiptSale, getItemQuantityInCart } = sale;

  // Campana del encabezado: stock bajo, deudas viejas, entradas sin salida y caja abierta de un día anterior.
  // Cada fuente se consulta solo si la persona tiene acceso a ese módulo.
  const levelOf = (module: Parameters<typeof effectiveLevel>[2]) => effectiveLevel(isMasterAdmin, permissions.levels, module);
  const { notices } = useNotices({
    companyId,
    products: catalog.products,
    canSeeDebts: atLeast(levelOf('cobros_pagos'), 'view'),
    canSeeAttendance: atLeast(levelOf('fichaje'), 'view') || atLeast(levelOf('personal'), 'view'),
    canSeeCash: atLeast(levelOf('caja'), 'view'),
    attendanceRoute: atLeast(levelOf('personal'), 'view') ? 'personal' : 'fichaje',
  });

  // Menú: lo que permiten los permisos, menos lo que la persona ocultó en Mis preferencias
  const preferences = useHiddenRoutes(user.id);
  const nav = useWorkspaceNav(isMasterAdmin, permissions.levels, preferences);

  // Si le quitan el acceso a la pantalla en la que está, vuelve al inicio
  useEffect(() => {
    if (!isRouteVisible(activeRoute, isMasterAdmin, permissions.levels)) setActiveRoute('dashboard');
  }, [activeRoute, isMasterAdmin, permissions.levels]);

  return (
    <>
      <AppShell
        sections={nav.visible}
        activeRoute={activeRoute}
        onNavigate={setActiveRoute}
        companies={companies}
        activeCompany={activeCompany}
        onSelectCompany={(comp) => {
          onSelectCompany(comp);
          sale.closeCart();
        }}
        cartItemsCount={cart.totalItemsCount}
        cartTotal={cart.total}
        onOpenCart={sale.openCart}
        onSearch={handleHeaderSearch}
        searchProducts={catalog.products}
        userName={profile?.full_name || undefined}
        userEmail={user.email || undefined}
        onSignOut={onSignOut}
        notices={notices}
      >
        <PageEnter routeKey={activeRoute}>
        <ErrorBoundary scope="page" resetKey={activeRoute}>
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
            removeOne: (product) => cart.updateQuantity(product.id, getItemQuantityInCart(product.id) - 1),
            open: sale.openCart,
          }}
          onViewReceipt={setReceiptSale}
          permittedSections={nav.permitted}
          preferences={preferences}
        />
        </ErrorBoundary>
        </PageEnter>
      </AppShell>

      <CartDrawer
        isOpen={sale.isCartOpen}
        onClose={sale.closeCart}
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
          sale.closeCart();
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
