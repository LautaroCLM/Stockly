import React, { useEffect, useMemo } from 'react';
import { AnimatePresence } from 'motion/react';
import type { NavSection, RouteId } from '@/types';
import type { Product } from '@/features/inventario/types';
import type { Customer } from '@/features/clientes/types';
import type { SearchableRoute } from '@/routes/useWorkspaceNavigation';
import type { CommandItem, CommandSources } from '../commandResults';
import { CommandPalette } from './CommandPalette';

interface Props {
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  /** Menú que ve la persona (respeta permisos y preferencias). */
  sections: readonly NavSection[];
  products: readonly Product[];
  customers: readonly Customer[];
  onNavigate: (route: RouteId) => void;
  onSearchIn: (route: SearchableRoute, query: string) => void;
  onOpenCart: () => void;
  onAddToCart: (product: Product) => void;
}

/** Ctrl+K (o Cmd+K) en cualquier pantalla abre la paleta; elegir un resultado lleva a donde corresponde. */
export const WorkspaceCommandPalette: React.FC<Props> = (props) => {
  const { isOpen, setOpen, sections, products, customers } = props;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!isOpen);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, setOpen]);

  const routes = useMemo(() => sections.flatMap((s) => s.items), [sections]);
  const sources = useMemo<CommandSources>(() => ({
    routes,
    products,
    customers,
    actions: [{ action: 'open-cart', label: 'Abrir el carrito', hint: 'F4', icon: 'ShoppingCart' }],
    canSeeSales: routes.some((r) => r.id === 'ventas'),
  }), [routes, products, customers]);

  const select = (item: CommandItem, { addToCart }: { addToCart: boolean }) => {
    setOpen(false);
    const t = item.target;
    if (t.kind === 'route') props.onNavigate(t.route);
    else if (t.kind === 'customer') props.onSearchIn('clientes', t.query);
    else if (t.kind === 'sale') props.onSearchIn('ventas', t.query);
    else if (t.kind === 'action') props.onOpenCart();
    else {
      const product = products.find((p) => p.id === t.productId);
      if (addToCart && product) props.onAddToCart(product);
      else props.onSearchIn('inventario', t.query);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && <CommandPalette sources={sources} onSelect={select} onClose={() => setOpen(false)} />}
    </AnimatePresence>
  );
};
