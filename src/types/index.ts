export type TenantId = string;

export interface Company {
  id: TenantId;
  name: string;
  cuit: string;
  industry?: string;
  initials: string;
  plan?: 'Empresarial' | 'Profesional' | 'Básico' | string;
  currency?: string;
  timezone?: string;
  role?: 'master_admin' | 'employee';
  isOwner?: boolean;
}


export type RouteId =
  | 'dashboard'
  | 'inventario'
  | 'ventas'
  | 'caja'
  | 'compras'
  | 'proveedores'
  | 'clientes'
  | 'finanzas'
  | 'gastos'
  | 'cobros-pagos'
  | 'informes'
  | 'maquinas'
  | 'personal'
  | 'fichaje'
  | 'historial'
  | 'auditoria'
  | 'config-empresa'
  | 'config-miembros';

export interface NavItem {
  id: RouteId;
  label: string;
  path: string;
  iconName: string;
  badge?: string;
  badgeVariant?: 'primary' | 'warning' | 'accent' | 'neutral';
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export interface KpiCardData {
  title: string;
  value: string;
  change: string;
  isPositive: boolean;
  subtext: string;
  trendLabel: string;
  badgeColor?: 'primary' | 'success' | 'warning' | 'danger';
}

export interface RevenuePoint {
  date: string;
  ventas: number;
  costo: number;
}

export interface CriticalProduct {
  id: string;
  sku: string;
  name: string;
  category: string;
  currentStock: number;
  minStock: number;
  unitPrice: number;
  status: 'critical' | 'negative' | 'warning';
}

export interface ActivityEvent {
  id: string;
  type: 'sale' | 'purchase' | 'stock_in' | 'stock_out' | 'cash';
  description: string;
  entity: string;
  amount?: number;
  timeAgo: string;
  timestamp: string;
}

export * from '@/features/inventario/types';
