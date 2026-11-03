import type { NavSection } from '@/types';

/** Secciones y entradas del menú lateral. */
export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Operaciones Diarias',
    items: [
      {
        id: 'dashboard',
        label: 'Dashboard',
        path: '/',
        iconName: 'LayoutDashboard',
      },
      {
        id: 'inventario',
        label: 'Inventario y Venta',
        path: '/inventario',
        iconName: 'Boxes',
        badge: 'Carrito activo',
        badgeVariant: 'primary',
      },
      {
        id: 'ventas',
        label: 'Historial de Ventas',
        path: '/ventas',
        iconName: 'Receipt',
      },
      {
        id: 'caja',
        label: 'Caja Diaria',
        path: '/caja',
        iconName: 'Wallet',
      },
    ],
  },
  {
    title: 'Gestión Comercial',
    items: [
      {
        id: 'compras',
        label: 'Compras a Proveedores',
        path: '/compras',
        iconName: 'ShoppingCart',
      },
      {
        id: 'proveedores',
        label: 'Proveedores',
        path: '/proveedores',
        iconName: 'Truck',
      },
      {
        id: 'clientes',
        label: 'Clientes',
        path: '/clientes',
        iconName: 'Users',
      },
    ],
  },
  {
    title: 'Administración y Control',
    items: [
      {
        id: 'finanzas',
        label: 'Finanzas y Balances',
        path: '/finanzas',
        iconName: 'BarChart3',
      },
      {
        id: 'personal',
        label: 'Personal y Haberes',
        path: '/personal',
        iconName: 'UserCheck',
      },
      {
        id: 'historial',
        label: 'Auditoría y Eventos',
        path: '/historial',
        iconName: 'History',
      },
    ],
  },
  {
    title: 'Configuración',
    items: [
      {
        id: 'config-empresa',
        label: 'Datos de Empresa',
        path: '/configuracion/empresa',
        iconName: 'Building2',
      },
      {
        id: 'config-miembros',
        label: 'Miembros y Roles',
        path: '/configuracion/miembros',
        iconName: 'ShieldCheck',
      },
    ],
  },
];
