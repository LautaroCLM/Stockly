import React, { useEffect, useRef } from 'react';
import { Company, RouteId } from '@/types';
import { TenantSwitcher } from '@/components/shared/TenantSwitcher';
import { Button } from '@/components/ui/Button';
import { AnimatePresence, m } from 'motion/react';
import { AnimatedCurrency } from '@/components/motion/AnimatedCurrency';
import { bumpElement } from '@/lib/motion/flash';
import { Menu, ShoppingCart } from 'lucide-react';
import { NoticesBell } from '@/features/avisos/components/NoticesBell';
import type { Notice } from '@/features/avisos/types';
import type { Product } from '@/features/inventario/types';
import { HeaderSearch } from './HeaderSearch';
import { ConnectionBadge } from './ConnectionBadge';
import { ThemeToggle } from './ThemeToggle';

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
  /** Contenido extra junto a la empresa (ej. depósito de esta PC). */
  contextSlot?: React.ReactNode;
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
  contextSlot,
}) => {
  // El botón del carrito rebota cuando le suman un producto (no al cargar la pantalla)
  const cartButtonRef = useRef<HTMLButtonElement>(null);
  const previousCount = useRef(cartItemsCount);
  useEffect(() => {
    if (cartItemsCount > previousCount.current) bumpElement(cartButtonRef.current);
    previousCount.current = cartItemsCount;
  }, [cartItemsCount]);

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
        {contextSlot}
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
            ref={cartButtonRef}
            data-cart-target
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
              <AnimatePresence initial={false}>
                {cartItemsCount > 0 && (
                  <m.span key="badge" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                    transition={{ type: 'spring', stiffness: 520, damping: 22 }}
                    className="absolute -top-1.5 -right-2 min-w-4 h-4 px-1 rounded-full bg-primary text-white text-[9px] font-bold flex items-center justify-center overflow-hidden">
                    {/* El número sube desde abajo cada vez que cambia */}
                    <m.span key={cartItemsCount} initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}>
                      {cartItemsCount}
                    </m.span>
                  </m.span>
                )}
              </AnimatePresence>
            </div>
            {cartItemsCount > 0 && (
              <AnimatedCurrency value={cartTotal} className="tabular-nums font-bold text-text-primary hidden sm:inline" />
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

        <ThemeToggle />

        <NoticesBell notices={notices} onSelect={(route) => onNoticeSelect?.(route)} />

        <ConnectionBadge />
      </div>
    </header>
  );
};
