export const MODULE_KEYS = [
  'compras', 'cobros_pagos', 'gastos', 'finanzas', 'informes', 'maquinas', 'personal', 'fichaje',
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

export const MODULE_INFO: Record<ModuleKey, { label: string; description: string }> = {
  compras: { label: 'Compras a Proveedores', description: 'Cargar y anular compras de mercadería.' },
  cobros_pagos: { label: 'Cobros y Pagos', description: 'Cuenta corriente de clientes y deudas con proveedores.' },
  gastos: { label: 'Gastos', description: 'Registrar y anular gastos de la empresa.' },
  finanzas: { label: 'Resumen Financiero', description: 'Ventas, costos, ganancia y deudas. Solo se puede ver.' },
  informes: { label: 'Informes', description: 'Ventas por día, productos más vendidos, inventario valuado. Solo se puede ver.' },
  maquinas: { label: 'Máquinas', description: 'Máquinas y vehículos, con lo gastado en cada una.' },
  personal: { label: 'Empleados', description: 'Datos del personal, horarios y asistencia (incluye datos personales).' },
  fichaje: { label: 'Fichaje', description: 'Marcar la entrada y la salida del personal.' },
};

/** Lo que puede hacer un empleado cuando nadie configuró nada: solo fichar. */
export const DEFAULT_LEVELS: ModuleLevels = {
  compras: 'none', cobros_pagos: 'none', gastos: 'none', finanzas: 'none',
  informes: 'none', maquinas: 'none', personal: 'none', fichaje: 'operate',
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
    description: 'El empleado vende y ficha. No ve compras, gastos ni finanzas.',
    levels: DEFAULT_LEVELS,
  },
  {
    id: 'administrativo',
    label: 'Administrativo de confianza',
    description: 'Además carga compras, cobros y pagos, y gastos. No ve finanzas ni personal.',
    levels: { ...DEFAULT_LEVELS, compras: 'operate', cobros_pagos: 'operate', gastos: 'operate' },
  },
  {
    id: 'consulta',
    label: 'Consulta',
    description: 'Puede ver todo, pero solo fichar y vender: no modifica compras, gastos ni cuentas.',
    levels: {
      compras: 'view', cobros_pagos: 'view', gastos: 'view', finanzas: 'view',
      informes: 'view', maquinas: 'view', personal: 'view', fichaje: 'operate',
    },
  },
];

export type PermissionsActionResult = { ok: true } | { ok: false; message: string };
