export const MODULE_KEYS = [
  'productos', 'caja', 'clientes', 'proveedores', 'anular_ventas',
  'compras', 'cobros_pagos', 'gastos', 'finanzas', 'informes', 'maquinas', 'personal', 'fichaje', 'documentos',
] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

/** Alcance del rol empleado en un módulo: sin acceso, solo ver, o ver y operar. */
export type ModuleLevel = 'none' | 'view' | 'operate';
export type ModuleLevels = Record<ModuleKey, ModuleLevel>;

export const LEVEL_LABELS: Record<ModuleLevel, string> = {
  none: 'Sin acceso',
  view: 'Solo ver',
  operate: 'Ver y operar',
};

export interface ModuleInfo {
  label: string;
  description: string;
  /** Niveles que tienen sentido para el módulo (no todos admiten "solo ver" o "sin acceso"). */
  options: ModuleLevel[];
  /** Nombres propios de los niveles cuando "Sin acceso / Solo ver / Ver y operar" no explica bien. */
  levelLabels?: Partial<Record<ModuleLevel, string>>;
}

const ALL: ModuleLevel[] = ['none', 'view', 'operate'];

export const MODULE_INFO: Record<ModuleKey, ModuleInfo> = {
  productos: {
    label: 'Productos, costos y stock',
    description: 'Crear y editar productos, precios y costos, ajustar stock y cargar inventario. El catálogo para vender lo ven todos.',
    options: ['none', 'operate'],
    levelLabels: { none: 'Solo vender', operate: 'Gestionar productos y stock' },
  },
  caja: { label: 'Caja Diaria', description: 'Abrir y cerrar la caja y registrar ingresos y retiros de efectivo.', options: ALL },
  clientes: {
    label: 'Clientes',
    description: 'Crear y editar clientes. Todos los empleados ven la lista, porque hace falta para vender a un cliente.',
    options: ['view', 'operate'],
  },
  proveedores: {
    label: 'Proveedores',
    description: 'Crear y editar proveedores. Sus nombres se siguen viendo desde Compras, Gastos y Cobros y Pagos.',
    options: ALL,
  },
  anular_ventas: {
    label: 'Anular ventas',
    description: 'Anular una venta ya registrada: devuelve el stock y descuenta lo vendido.',
    options: ['none', 'operate'],
    levelLabels: { none: 'No puede anular', operate: 'Puede anular ventas' },
  },
  compras: { label: 'Compras a Proveedores', description: 'Cargar y anular compras de mercadería.', options: ALL },
  cobros_pagos: { label: 'Cobros y Pagos', description: 'Cuenta corriente de clientes y deudas con proveedores.', options: ALL },
  gastos: { label: 'Gastos', description: 'Registrar y anular gastos de la empresa.', options: ALL },
  finanzas: { label: 'Resumen Financiero', description: 'Ventas, costos, ganancia y deudas. Solo se puede ver.', options: ['none', 'view'] },
  informes: {
    label: 'Informes',
    description: 'Ventas por día, productos más vendidos, inventario valuado. Solo se puede ver.',
    options: ['none', 'view'],
  },
  maquinas: { label: 'Máquinas', description: 'Máquinas y vehículos, con lo gastado en cada una.', options: ALL },
  personal: { label: 'Empleados', description: 'Datos del personal, horarios y asistencia (incluye datos personales).', options: ALL },
  fichaje: { label: 'Fichaje', description: 'Marcar la entrada y la salida del personal.', options: ALL },
  documentos: { label: 'Documentos', description: 'Tickets, presupuestos, remitos y garantías. No cuentan como venta ni mueven el stock.', options: ALL },
};

/** Lo que puede hacer un empleado cuando nadie configuró nada: lo de siempre. */
export const DEFAULT_LEVELS: ModuleLevels = {
  productos: 'none', caja: 'operate', clientes: 'view', proveedores: 'view', anular_ventas: 'none',
  compras: 'none', cobros_pagos: 'none', gastos: 'none', finanzas: 'none',
  informes: 'none', maquinas: 'none', personal: 'none', fichaje: 'operate', documentos: 'none',
};

export interface PermissionTemplate {
  id: string;
  label: string;
  description: string;
  levels: ModuleLevels;
}

export const PERMISSION_TEMPLATES: PermissionTemplate[] = [
  {
    id: 'basico',
    label: 'Básico',
    description: 'El empleado vende, usa la caja y ficha. No gestiona productos ni ve compras, gastos o finanzas.',
    levels: DEFAULT_LEVELS,
  },
  {
    id: 'administrativo',
    label: 'Administrativo de confianza',
    description: 'Además gestiona productos, clientes y proveedores, y carga compras, cobros y pagos, y gastos. No ve finanzas ni personal ni anula ventas.',
    levels: {
      ...DEFAULT_LEVELS,
      productos: 'operate', clientes: 'operate', proveedores: 'operate',
      compras: 'operate', cobros_pagos: 'operate', gastos: 'operate', documentos: 'operate',
    },
  },
  {
    id: 'consulta',
    label: 'Consulta',
    description: 'Puede ver todo, pero solo vender, fichar y mirar: no modifica productos, compras, gastos ni cuentas, y la caja es solo de lectura.',
    levels: {
      productos: 'none', caja: 'view', clientes: 'view', proveedores: 'view', anular_ventas: 'none',
      compras: 'view', cobros_pagos: 'view', gastos: 'view', finanzas: 'view',
      informes: 'view', maquinas: 'view', personal: 'view', fichaje: 'operate', documentos: 'view',
    },
  },
];

export type PermissionsActionResult = { ok: true } | { ok: false; message: string };
