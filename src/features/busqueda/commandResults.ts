import type { NavItem, RouteId } from '@/types';

/** Lo que se puede elegir en la paleta Ctrl+K. */
export type CommandTarget =
  | { kind: 'route'; route: RouteId }
  | { kind: 'product'; productId: string; query: string }
  | { kind: 'customer'; query: string }
  | { kind: 'sale'; query: string }
  | { kind: 'action'; action: CommandAction };

export type CommandAction = 'open-cart';

export interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  icon: string;
  target: CommandTarget;
}

export interface CommandGroup {
  title: string;
  items: CommandItem[];
}

export interface CommandSources {
  routes: readonly NavItem[];
  products: readonly { id: string; name: string; sku: string; barcode: string; isActive?: boolean }[];
  customers: readonly { id: string; name: string; taxId?: string | null; isActive?: boolean }[];
  actions: readonly { action: CommandAction; label: string; hint?: string; icon: string }[];
  /** Puede ver el Historial de Ventas (para buscar una venta por número). */
  canSeeSales: boolean;
}

const MAX_PRODUCTS = 6;
const MAX_CUSTOMERS = 5;

/** Minúsculas y sin tildes: "Máquinas" encuentra "maquinas". */
export const normalize = (text: string): string => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** "5" o "vta 5" → "VTA-00000005"; "VTA-00000005" queda igual; otra cosa, null. */
export function saleNumberFromQuery(query: string): string | null {
  const match = normalize(query).match(/^(?:vta[\s-]*)?0*(\d{1,8})$/);
  return match ? `VTA-${match[1].padStart(8, '0')}` : null;
}

/** Resultados agrupados. Sin texto: acciones y pantallas. Con texto: lo que coincide en cada grupo. */
export function buildCommandGroups(rawQuery: string, sources: CommandSources): CommandGroup[] {
  const q = normalize(rawQuery);
  const actionItems: CommandItem[] = sources.actions
    .filter((a) => !q || normalize(a.label).includes(q))
    .map((a) => ({ id: `action:${a.action}`, label: a.label, hint: a.hint, icon: a.icon, target: { kind: 'action', action: a.action } }));
  const routeItems: CommandItem[] = sources.routes
    .filter((r) => !q || normalize(r.label).includes(q))
    .map((r) => ({ id: `route:${r.id}`, label: r.label, hint: 'Pantalla', icon: r.iconName, target: { kind: 'route', route: r.id } }));

  if (!q) {
    return [
      { title: 'Acciones', items: actionItems },
      { title: 'Ir a', items: routeItems },
    ].filter((g) => g.items.length > 0);
  }

  const products: CommandItem[] = sources.products
    .filter((p) => p.isActive !== false && (normalize(p.name).includes(q) || normalize(p.sku).includes(q) || p.barcode.includes(rawQuery.trim())))
    .slice(0, MAX_PRODUCTS)
    .map((p) => ({ id: `product:${p.id}`, label: p.name, hint: p.sku, icon: 'Boxes', target: { kind: 'product', productId: p.id, query: p.sku || p.name } }));

  const customers: CommandItem[] = sources.customers
    .filter((c) => c.isActive !== false && (normalize(c.name).includes(q) || (c.taxId ?? '').replace(/\D/g, '').includes(q.replace(/\D/g, '') || '\u0000')))
    .slice(0, MAX_CUSTOMERS)
    .map((c) => ({ id: `customer:${c.id}`, label: c.name, hint: c.taxId ?? 'Cliente', icon: 'Users', target: { kind: 'customer', query: c.name } }));

  const saleNumber = sources.canSeeSales ? saleNumberFromQuery(rawQuery) : null;
  const sales: CommandItem[] = saleNumber
    ? [{ id: `sale:${saleNumber}`, label: `Buscar la venta ${saleNumber}`, hint: 'Historial de Ventas', icon: 'Receipt', target: { kind: 'sale', query: saleNumber } }]
    : [];

  return [
    { title: 'Ventas', items: sales },
    { title: 'Productos', items: products },
    { title: 'Clientes', items: customers },
    { title: 'Ir a', items: routeItems },
    { title: 'Acciones', items: actionItems },
  ].filter((g) => g.items.length > 0);
}
