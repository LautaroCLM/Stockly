export const COLLECTION_METHODS = ['efectivo', 'transferencia', 'debito', 'credito', 'cheque'] as const;
export type CollectionMethod = (typeof COLLECTION_METHODS)[number];

export const COLLECTION_METHOD_LABELS: Record<CollectionMethod, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  debito: 'Tarjeta de débito',
  credito: 'Tarjeta de crédito',
  cheque: 'Cheque',
};

/**
 * Saldo de una cuenta corriente: de un cliente (lo que nos debe) o de un proveedor (lo que le debemos).
 * Un saldo negativo es saldo a favor de la otra parte.
 */
export interface AccountBalance {
  partyId: string;
  partyName: string;
  /** Total cargado a la cuenta: ventas a crédito (cliente) o compras a crédito (proveedor). */
  chargedTotal: number;
  /** Total cobrado (cliente) o pagado (proveedor). */
  settledTotal: number;
  balance: number;
  lastActivity: string | null;
  oldestOpenSince: string | null;
}

export interface StatementEntry {
  kind: 'charge' | 'payment';
  referenceId: string;
  document: string;
  occurredAt: string;
  /** Positivo: venta o compra a crédito. Negativo: cobro o pago. */
  amount: number;
}

export interface CollectionPart {
  method: CollectionMethod;
  amount: number;
}

export interface NewCollectionInput {
  partyId: string;
  parts: CollectionPart[];
  notes: string;
  /** Cliente: el efectivo ingresa a la caja. Proveedor: el efectivo sale de la caja. */
  withCash: boolean;
  idempotencyKey: string;
}

export type CollectionActionResult = { ok: true } | { ok: false; message: string; uncertain?: boolean };
