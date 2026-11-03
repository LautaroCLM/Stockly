import React, { useState } from 'react';
import { RouteId, Company, NavSection } from '@/types';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

interface AppShellProps {
  sections: NavSection[];
  activeRoute: RouteId;
  onNavigate: (routeId: RouteId) => void;
  companies: Company[];
  activeCompany: Company;
  onSelectCompany: (company: Company) => void;
  cartItemsCount?: number;
  cartTotal?: number;
  onOpenCart?: () => void;
  userName?: string;
  userEmail?: string;
  onSignOut?: () => void;
  /** Productos activos en o bajo su stock mínimo (alerta del header). */
  restockCount?: number;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  sections,
  activeRoute,
  onNavigate,
  companies,
  activeCompany,
  onSelectCompany,
  cartItemsCount = 0,
  cartTotal = 0,
  onOpenCart,
  userName,
  userEmail,
  onSignOut,
  restockCount = 0,
  children,
}) => {
  const [isOpenMobile, setIsOpenMobile] = useState(false);

  return (
    <div className="min-h-screen bg-bg text-text-primary flex">
      {/* Sidebar navigation */}
      <Sidebar
        sections={sections}
        activeRoute={activeRoute}
        onNavigate={onNavigate}
        isOpenMobile={isOpenMobile}
        onCloseMobile={() => setIsOpenMobile(false)}
        userName={userName}
        userEmail={userEmail}
        onSignOut={onSignOut}
      />

      {/* Main content wrapper */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        <Header
          companies={companies}
          activeCompany={activeCompany}
          onSelectCompany={onSelectCompany}
          onOpenMobileSidebar={() => setIsOpenMobile(true)}
          onQuickSaleClick={() => onNavigate('inventario')}
          cartItemsCount={cartItemsCount}
          cartTotal={cartTotal}
          onOpenCart={onOpenCart}
          restockCount={restockCount}
          onRestockAlertClick={() => onNavigate('inventario')}
        />

        <main className="flex-1 p-4 lg:p-6 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
