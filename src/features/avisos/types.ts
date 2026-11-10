import type { RouteId } from '@/types';

export type NoticeSeverity = 'danger' | 'warning' | 'info';

/** Un aviso de la campana: qué pasa y adónde ir a resolverlo. */
export interface Notice {
  id: string;
  severity: NoticeSeverity;
  title: string;
  detail: string;
  /** Pantalla a la que lleva el aviso al hacer clic. */
  route: RouteId;
}

/** Entrada de personal que sigue abierta (todavía no se marcó la salida). */
export interface OpenAttendance {
  employeeName: string;
  checkIn: string;
}

/**
 * Lo que se sabe en este momento. `null` = esa fuente no está disponible (sin permiso o sin cargar):
 * no se genera ningún aviso de ese tipo.
 */
export interface NoticeSources {
  restock: { name: string; stock: number; minStock: number; unit: string }[];
  customerDebts: { name: string; balance: number; oldestOpenSince: string | null }[] | null;
  supplierDebts: { name: string; balance: number; oldestOpenSince: string | null }[] | null;
  openAttendance: OpenAttendance[] | null;
  /** Fecha de apertura de la caja abierta, si hay una. */
  openCashSince: string | null | undefined;
  attendanceRoute: RouteId;
}
