import type { RouteId } from '@/types';
import { DEFAULT_LEVELS } from './types';
import type { ModuleKey, ModuleLevel, ModuleLevels } from './types';

/** Pantalla que depende de un módulo configurable. Las demás pantallas tienen reglas fijas. */
export const ROUTE_MODULE: Partial<Record<RouteId, ModuleKey>> = {
  caja: 'caja',
  documentos: 'documentos',
  precios: 'precios',
  proveedores: 'proveedores',
  compras: 'compras',
  'cobros-pagos': 'cobros_pagos',
  gastos: 'gastos',
  finanzas: 'finanzas',
  informes: 'informes',
  maquinas: 'maquinas',
  personal: 'personal',
  fichaje: 'fichaje',
};

/** Pantallas que solo ve el administrador. */
const ADMIN_ONLY_ROUTES = new Set<RouteId>(['config-permisos']);

/** Pantalla simplificada para cuentas de empleado: el administrador ficha desde Empleados. */
const EMPLOYEE_ONLY_ROUTES = new Set<RouteId>(['fichaje']);

const RANK: Record<ModuleLevel, number> = { none: 0, view: 1, operate: 2 };

/** Nivel efectivo de quien usa la app: el administrador siempre opera; el empleado, lo configurado. */
export function effectiveLevel(isAdmin: boolean, levels: ModuleLevels | null, module: ModuleKey): ModuleLevel {
  if (isAdmin) return 'operate';
  return levels?.[module] ?? DEFAULT_LEVELS[module];
}

export const atLeast = (level: ModuleLevel, needed: 'view' | 'operate'): boolean => RANK[level] >= RANK[needed];

/** ¿Se muestra esta pantalla a quien usa la app? */
export function isRouteVisible(route: RouteId, isAdmin: boolean, levels: ModuleLevels | null): boolean {
  if (ADMIN_ONLY_ROUTES.has(route)) return isAdmin;
  if (EMPLOYEE_ONLY_ROUTES.has(route) && isAdmin) return false;
  const module = ROUTE_MODULE[route];
  if (!module) return true;
  return atLeast(effectiveLevel(isAdmin, levels, module), 'view');
}
