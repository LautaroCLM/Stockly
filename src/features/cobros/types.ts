export const COLLECTION_METHODS = ['efectivo', 'transferencia', 'debito', 'credito', 'cheque'] as const;
export type CollectionMethod = (typeof COLLECTION_METHODS)[number];

export const COLLECTION_METHOD_LABELS: Record<CollectionMethod, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  debito: 'Tarjeta de débito',
  credito: 'Tarjeta de crédito',
  cheque: 'Cheque',
};

/** Deuda de un cliente en cuenta corriente. Un saldo negativo es saldo a favor del cliente. */
export interface CustomerBalance {
  customerId: string;
  customerName: string;
  chargedTotal: number;
  collectedTotal: number;
  balance: number;
  lastActivity: string | null;
  oldestOpenSince: string | null;
}

export interface StatementEntry {
  kind: 'sale' | 'payment';
  referenceId: string;
  document: string;
  occurredAt: string;
  /** Positivo: venta a crédito. Negativo: cobro. */
  amount: number;
}

export interface CollectionPart {
  method: CollectionMethod;
  amount: number;
}

export interface NewCollectionInput {
  customerId: string;
  parts: CollectionPart[];
  notes: string;
  intoCash: boolean;
  idempotencyKey: string;
}

export type CollectionActionResult = { ok: true } | { ok: false; message: string; uncertain?: boolean };
