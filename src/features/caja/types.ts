export type CashMovementType = 'in' | 'out';

/** Turno de caja (abierto o cerrado). Los importes del arqueo existen solo al cerrar. */
export interface CashSession {
  id: string;
  companyId: string;
  status: 'open' | 'closed';
  openedBy: string;
  openedByName: string;
  openedAt: string;
  openingAmount: number;
  openingNotes: string | null;
  closedBy: string | null;
  closedByName: string | null;
  closedAt: string | null;
  expectedAmount: number | null;
  countedAmount: number | null;
  differenceAmount: number | null;
  closingNotes: string | null;
}

export interface CashMovement {
  id: string;
  movementType: CashMovementType;
  amount: number;
  reason: string;
  createdByName: string;
  createdAt: string;
}

/** Totales del turno: en vivo si está abierto, foto del cierre si está cerrado. */
export interface CashSummary {
  openingAmount: number;
  cashSalesAmount: number;
  cashRefundsAmount: number;
  cashInAmount: number;
  cashOutAmount: number;
  expectedAmount: number;
  /** Solo en turnos abiertos. */
  completedSalesCount: number | null;
  /** Cobros con otros medios (no pasan por el cajón), por medio de pago. */
  otherPayments: Record<string, number>;
  countedAmount: number | null;
  differenceAmount: number | null;
}

export type CashActionResult = { ok: true } | { ok: false; message: string; uncertain?: boolean };
