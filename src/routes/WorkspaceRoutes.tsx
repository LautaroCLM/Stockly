import React from 'react';
import type { RouteId, Company } from '@/types';
import type { Product, Sale } from '@/features/inventario/types';
import type { useProducts } from '@/features/inventario/hooks/useProducts';
import type { useCategories } from '@/features/inventario/hooks/useCategories';
import type { useSuppliers } from '@/features/proveedores/hooks/useSuppliers';
import type { useCustomers } from '@/features/clientes/hooks/useCustomers';
import type { useCompanyMembers } from '@/features/companies/hooks/useCompanyMembers';
import type { useCompanySettings } from '@/features/companies/hooks/useCompanySettings';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { InventarioPage } from '@/features/inventario/InventarioPage';
import { VentasPage } from '@/features/ventas/VentasPage';
import { HistorialStockPage } from '@/features/historial/HistorialStockPage';
import { AuditLogPage } from '@/features/auditoria/AuditLogPage';
import { CajaPage } from '@/features/caja/CajaPage';
import { FinanzasPage } from '@/features/finanzas/FinanzasPage';
import { ProveedoresPage } from '@/features/proveedores/components/ProveedoresPage';
import { ClientesPage } from '@/features/clientes/components/ClientesPage';
import { ComprasPage } from '@/features/compras/components/ComprasPage';
import { MembersPage } from '@/features/companies/components/MembersPage';
import { CompanySettingsPage } from '@/features/companies/components/CompanySettingsPage';
import { EmptyState } from '@/components/shared/EmptyState';

interface WorkspaceRoutesProps {
  route: RouteId;
  onNavigate: (route: RouteId) => void;
  company: Company;
  currentUserId: string;
  isMasterAdmin: boolean;
  inventorySearch: { query: string; id: number } | null;
  catalog: ReturnType<typeof useProducts>;
  categories: ReturnType<typeof useCategories>;
  suppliers: ReturnType<typeof useSuppliers>;
  customers: ReturnType<typeof useCustomers>;
  members: ReturnType<typeof useCompanyMembers>;
  settings: ReturnType<typeof useCompanySettings>;
  cart: {
    totalItemsCount: number;
    total: number;
    getQuantity: (productId: string) => number;
    addProduct: (product: Product) => void;
    open: () => void;
  };
  onViewReceipt: (sale: Sale) => void;
}

const reloadCatalog = (catalog: WorkspaceRoutesProps['catalog'], context: string) => () => {
  catalog.reloadProducts().catch((err) => console.warn(`Error al recargar productos ${context}:`, err));
};

/** Pantalla de la ruta activa. Solo ensambla las páginas de cada módulo. */
export const WorkspaceRoutes: React.FC<WorkspaceRoutesProps> = (props) => {
  const { route, onNavigate, company, isMasterAdmin, catalog, categories, suppliers, customers, members, settings, cart } =
    props;
  const goTo = (target: RouteId) => () => onNavigate(target);

  switch (route) {
    case 'dashboard':
      return (
        <DashboardPage company={company} products={catalog.products} isMasterAdmin={isMasterAdmin}
          onNavigateToInventario={goTo('inventario')} onNavigateToHistorial={goTo('historial')} />
      );
    case 'inventario':
      return (
        <InventarioPage
          company={company}
          searchRequest={props.inventorySearch}
          products={catalog.products}
          categories={categories.categories}
          isProductsLoading={catalog.isLoading}
          productsError={catalog.error}
          productsSyncWarning={catalog.syncWarning}
          onReloadProducts={catalog.reloadProducts}
          isCategoriesLoading={categories.isLoading}
          categoriesError={categories.error}
          isMasterAdmin={isMasterAdmin}
          cartItemsCount={cart.totalItemsCount}
          cartTotal={cart.total}
          getItemQuantityInCart={cart.getQuantity}
          onAddToCart={cart.addProduct}
          onOpenCart={cart.open}
          onCreateProduct={catalog.createProduct}
          onUpdateProduct={catalog.updateProduct}
          onDeactivateProduct={catalog.deactivateProduct}
          onReactivateProduct={catalog.reactivateProduct}
          onAdjustStock={catalog.adjustStock}
          onImportInitialStock={catalog.importInitialStock}
          onCreateCategory={categories.createCategory}
          onRenameCategory={categories.renameCategory}
          onDeleteCategory={categories.deleteCategory}
        />
      );
    case 'ventas':
      return (
        <VentasPage company={company} customers={customers.customers} isMasterAdmin={isMasterAdmin}
          onViewReceipt={props.onViewReceipt} onNavigateToInventario={goTo('inventario')}
          onSaleCancelled={reloadCatalog(catalog, 'tras anulación')} />
      );
    case 'historial':
      return <HistorialStockPage company={company} products={catalog.products} onNavigateToInventario={goTo('inventario')} />;
    case 'caja':
      return <CajaPage company={company} />;
    case 'finanzas':
      return <FinanzasPage company={company} isMasterAdmin={isMasterAdmin} />;
    case 'auditoria':
      return <AuditLogPage company={company} isMasterAdmin={isMasterAdmin} />;
    case 'proveedores':
      return (
        <ProveedoresPage company={company} suppliers={suppliers.suppliers} isLoading={suppliers.isLoading}
          error={suppliers.error} isMasterAdmin={isMasterAdmin} onReload={suppliers.reloadSuppliers}
          onSaveSupplier={suppliers.saveSupplier} onToggleStatus={suppliers.toggleStatus} />
      );
    case 'compras':
      return (
        <ComprasPage company={company} suppliers={suppliers.suppliers} products={catalog.products}
          isMasterAdmin={isMasterAdmin} onStockChanged={reloadCatalog(catalog, 'tras compra')}
          onNavigateHome={goTo('dashboard')} />
      );
    case 'clientes':
      return (
        <ClientesPage company={company} customers={customers.customers} isLoading={customers.isLoading}
          error={customers.error} isMasterAdmin={isMasterAdmin} onReload={customers.reloadCustomers}
          onSaveCustomer={customers.saveCustomer} onToggleStatus={customers.toggleStatus} />
      );
    case 'config-miembros':
      return (
        <MembersPage company={company} members={members.members} invitations={members.invitations}
          isLoading={members.isLoading} error={members.error} currentUserId={props.currentUserId}
          isMasterAdmin={isMasterAdmin} isOwner={Boolean(company.isOwner)} onReload={members.reload}
          onInviteUser={members.inviteUser} onRevokeInvitation={members.revokeInvitation}
          onDeactivateMember={members.deactivateMember} onReactivateMember={members.reactivateMember} />
      );
    case 'config-empresa':
      return (
        <CompanySettingsPage company={company} settings={settings.settings} isLoading={settings.isLoading}
          error={settings.error} isMasterAdmin={isMasterAdmin} onReload={settings.reload}
          onUpdateNegativeStockPolicy={settings.updateNegativeStockPolicy} />
      );
    default:
      return <EmptyState routeId={route} onNavigateHome={goTo('dashboard')} />;
  }
};
