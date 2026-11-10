import type { DataTable } from '@/features/realtime/changeBus';

/** Cuenta corriente de clientes (lo que nos deben) o de proveedores (lo que debemos). */
export type AccountKind = 'customer' | 'supplier';

export interface AccountLabels {
  tabLabel: string;
  partyColumn: string;
  chargedColumn: string;
  settledColumn: string;
  favorNote: string;
  actionButton: string;
  totalCard: string;
  debtorsCard: string;
  intro: string;
  emptyList: string;
  /** Detalle de un cargo en el estado de cuenta: "Venta V-001" / "Compra COM-001". */
  chargeEntry: string;
  paymentEntry: string;
  emptyStatement: string;
  settleTitle: string;
  settleTotal: string;
  owes: string;
  overBalance: string;
  afterSettle: string;
  cashHelp: string;
  submitButton: string;
  voidTitle: string;
  voidHelp: string;
  voidButton: string;
  noteHint: string;
}

export const ACCOUNT_LABELS: Record<AccountKind, AccountLabels> = {
  customer: {
    tabLabel: 'A cobrar a clientes',
    partyColumn: 'Cliente',
    chargedColumn: 'Vendido a crédito',
    settledColumn: 'Cobrado',
    favorNote: 'a favor del cliente',
    actionButton: 'Cobrar',
    totalCard: 'Total a cobrar',
    debtorsCard: 'Clientes con deuda',
    intro: 'Cuenta corriente de clientes',
    emptyList: 'Todavía no hay ventas en cuenta corriente. Al vender, elegí un cliente y usá el medio de pago "Cuenta corriente": la deuda aparece acá.',
    chargeEntry: 'Venta',
    paymentEntry: 'Cobro',
    emptyStatement: 'Este cliente no tiene movimientos de cuenta corriente.',
    settleTitle: 'Registrar cobro',
    settleTotal: 'Total del cobro',
    owes: 'debe',
    overBalance: 'El cobro supera el saldo del cliente',
    afterSettle: 'Saldo después del cobro',
    cashHelp: 'El efectivo ingresa a la caja abierta: suma al arqueo.',
    submitButton: 'Registrar cobro',
    voidTitle: 'cobro',
    voidHelp: 'Anular el cobro: la deuda vuelve a subir. Si el efectivo había ingresado a la caja, tiene que haber una caja abierta para sacarlo.',
    voidButton: 'Anular cobro',
    noteHint: 'Nota (opcional): recibo, referencia, etc.',
  },
  supplier: {
    tabLabel: 'A pagar a proveedores',
    partyColumn: 'Proveedor',
    chargedColumn: 'Comprado a crédito',
    settledColumn: 'Pagado',
    favorNote: 'a favor de la empresa',
    actionButton: 'Pagar',
    totalCard: 'Total a pagar',
    debtorsCard: 'Proveedores con deuda',
    intro: 'Cuenta corriente con proveedores',
    emptyList: 'Todavía no hay compras a crédito. Al cargar una compra, marcá "Queda a pagar": la deuda con el proveedor aparece acá.',
    chargeEntry: 'Compra',
    paymentEntry: 'Pago',
    emptyStatement: 'Este proveedor no tiene movimientos de cuenta corriente.',
    settleTitle: 'Registrar pago',
    settleTotal: 'Total del pago',
    owes: 'se le debe',
    overBalance: 'El pago supera lo que se le debe al proveedor',
    afterSettle: 'Deuda después del pago',
    cashHelp: 'El efectivo sale de la caja abierta: resta del arqueo.',
    submitButton: 'Registrar pago',
    voidTitle: 'pago',
    voidHelp: 'Anular el pago: la deuda vuelve a subir. Si el efectivo había salido de la caja, tiene que haber una caja abierta para que vuelva a entrar.',
    voidButton: 'Anular pago',
    noteHint: 'Nota (opcional): comprobante, referencia, etc.',
  },
};

/** Tablas cuyos cambios obligan a recargar los saldos de cada tipo de cuenta. */
export const ACCOUNT_TABLES: Record<AccountKind, readonly DataTable[]> = {
  customer: ['sales', 'customer_payments', 'customers'],
  supplier: ['purchases', 'credit_purchases', 'supplier_payments', 'suppliers'],
};
