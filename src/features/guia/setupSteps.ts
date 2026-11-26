import type { RouteId } from '@/types';

/** Lo que ya cargó la empresa, leído de la base. */
export interface SetupProgress {
  hasIssuerData: boolean;
  hasLogo: boolean;
  productCount: number;
  employeeCount: number;
  memberCount: number;
  saleCount: number;
}

export type SetupStepId = 'empresa' | 'productos' | 'equipo' | 'venta';

export interface SetupStep {
  id: SetupStepId;
  title: string;
  description: string;
  actionLabel: string;
  route: RouteId;
  done: boolean;
}

/** Los cuatro pasos para dejar lista una empresa nueva, en el orden en que conviene hacerlos. */
export function buildSetupSteps(p: SetupProgress): SetupStep[] {
  return [
    {
      id: 'empresa',
      title: 'Completá los datos de tu empresa',
      description: 'Dirección, teléfono, condición frente al IVA y logo. Salen en tickets y documentos.',
      actionLabel: 'Ir a Datos de Empresa',
      route: 'config-empresa',
      done: p.hasIssuerData || p.hasLogo,
    },
    {
      id: 'productos',
      title: 'Cargá tus productos',
      description: 'Importalos desde Excel de una sola vez o crealos uno por uno.',
      actionLabel: 'Ir a Inventario',
      route: 'inventario',
      done: p.productCount > 0,
    },
    {
      id: 'equipo',
      title: 'Sumá a tus empleados',
      description: 'Cargá a las personas que trabajan con vos para el fichaje y los permisos.',
      actionLabel: 'Ir a Empleados',
      route: 'personal',
      done: p.employeeCount > 0 || p.memberCount > 1,
    },
    {
      id: 'venta',
      title: 'Hacé una venta de prueba',
      description: 'Agregá un producto al carrito y cobrá. Si fue solo una prueba, después la anulás.',
      actionLabel: 'Ir a vender',
      route: 'inventario',
      done: p.saleCount > 0,
    },
  ];
}

export function countDone(steps: readonly SetupStep[]): number {
  return steps.filter((s) => s.done).length;
}

/** La guía se ve mientras falte algún paso y nadie la haya ocultado en este equipo. */
export function shouldShowGuide(steps: readonly SetupStep[], dismissed: boolean): boolean {
  return !dismissed && countDone(steps) < steps.length;
}
