import React from 'react';
import { Company, RouteId } from '@/types';
import { TenantSwitcher } from '@/components/shared/TenantSwitcher';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/formatters';
import { Menu, ShoppingCart } from 'lucide-react';
import { NoticesBell } from '@/features/avisos/components/NoticesBell';
import type { Notice } from '@/features/avisos/types';
import type { Product } from '@/features/inventario/types';
import { HeaderSearch } from './HeaderSearch';
import { ConnectionBadge } from './ConnectionBadge';

interface HeaderProps {
  companies: Company[];
  activeCompany: Company;
  cartItemsCount?: number;
  cartTotal?: number;
  onSelectCompany: (company: Company) => void;
  onOpenMobileSidebar: () => void;
  onQuickSaleClick: () => void;
  /** Buscar productos desde el encabezado (abre Inventario filtrado). */
  onSearch: (query: string) => void;
  /** Catálogo para las sugerencias del buscador. */
  searchProducts: readonly Product[];
  onOpenCart?: () => void;
  /** Avisos de la campana (stock bajo, deudas viejas, caja abierta, etc.). */
  notices?: Notice[];
  onNoticeSelect?: (route: RouteId) => void;
}

export const Header: React.FC<HeaderProps> = ({
  companies,
  activeCompany,
  cartItemsCount = 0,
  cartTotal = 0,
  onSelectCompany,
  onOpenMobileSidebar,
  onQuickSaleClick,
  onSearch,
  searchProducts,
  onOpenCart,
  notices = [],
  onNoticeSelect,
}) => {
  return (
    <header className="h-16 bg-surface/90 backdrop-blur-md border-b border-border sticky top-0 z-30 px-4 lg:px-6 flex items-center justify-between gap-4">
      {/* Left: Mobile hamburger + Tenant Context */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobileSidebar}
          className="lg:hidden p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-2 focus:outline-none"
        >
          <Menu size={20} />
        </button>

        <div className="flex items-center gap-2 text-xs text-text-muted font-medium">
          <img
            src="/stockly.png"
            alt="Logo de Stockly"
            className="w-6 h-6 rounded-md object-contain shrink-0"
          />
          <span className="text-text-secondary font-semibold hidden sm:inline">Stockly</span>
          <span className="mx-1 text-border-active hidden sm:inline">/</span>
        </div>

        <TenantSwitcher
          companies={companies}
          activeCompany={activeCompany}
          onSelectCompany={onSelectCompany}
        />
      </div>

      {/* Middle: búsqueda de productos */}
      <div className="hidden md:flex items-center flex-1 max-w-md mx-4">
        <HeaderSearch onSearch={onSearch} products={searchProducts} />
      </div>

      {/* Right: Quick actions, cart badge, notifications, status */}
      <div className="flex items-center gap-2.5">
        {/* Cart button in header */}
        {onOpenCart && (
          <button
            onClick={onOpenCart}
            className={`flex items-center gap-2 h-9 px-3 rounded-lg border text-xs font-semibold transition-all ${
              cartItemsCount > 0
                ? 'bg-primary/15 border-primary/40 text-primary-light hover:bg-primary/25 shadow-sm'
                : 'bg-surface-2 border-border/80 text-text-secondary hover:text-text-primary hover:bg-surface-3'
            }`}
            title="Abrir carrito de venta"
          >
            <div className="relative">
              <ShoppingCart size={15} />
              {cartItemsCount > 0 && (
                <span className="absolute -top-1.5 -right-2 w-4 h-4 rounded-full bg-primary text-white text-[9px] font-bold flex items-center justify-center animate-in zoom-in">
                  {cartItemsCount}
                </span>
              )}
            </div>
            {cartItemsCount > 0 && (
              <span className="tabular-nums font-bold text-text-primary hidden sm:inline">
                {formatCurrency(cartTotal)}
              </span>
            )}
          </button>
        )}

        <Button
          variant="primary"
          size="sm"
          onClick={onQuickSaleClick}
          className="hidden sm:inline-flex items-center gap-1.5 shadow-md shadow-primary/20"
        >
          <span>Nueva Venta</span>
        </Button>

        <div className="h-4 w-[1px] bg-border mx-1 hidden sm:block" />

        <NoticesBell notices={notices} onSelect={(route) => onNoticeSelect?.(route)} />

        <ConnectionBadge />
      </div>
    </header>
  );
};
