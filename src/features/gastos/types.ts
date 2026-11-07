export const EXPENSE_CATEGORIES = [
  'combustible', 'mantenimiento', 'repuestos', 'alquiler', 'servicios',
  'impuestos', 'sueldos', 'viaticos', 'seguros', 'otros',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  combustible: 'Combustible',
  mantenimiento: 'Mantenimiento',
  repuestos: 'Repuestos',
  alquiler: 'Alquiler',
  servicios: 'Servicios (luz, agua, internet)',
  impuestos: 'Impuestos y tasas',
  sueldos: 'Sueldos y jornales',
  viaticos: 'Viáticos',
  seguros: 'Seguros',
  otros: 'Otros',
};

export const EXPENSE_PAYMENT_METHODS = ['efectivo', 'transferencia', 'tarjeta', 'cheque', 'otro'] as const;
export type ExpensePaymentMethod = (typeof EXPENSE_PAYMENT_METHODS)[number];

export const EXPENSE_METHOD_LABELS: Record<ExpensePaymentMethod, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  cheque: 'Cheque',
  otro: 'Otro',
};

export interface Expense {
  id: string;
  expenseDate: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  paymentMethod: ExpensePaymentMethod;
  supplierId: string | null;
  supplierName: string | null;
  machineId: string | null;
  machineName: string | null;
  paidFromCash: boolean;
  isVoided: boolean;
  voidReason: string | null;
  createdByName: string;
  createdAt: string;
}

export interface NewExpenseInput {
  expenseDate: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  paymentMethod: ExpensePaymentMethod;
  supplierId: string | null;
  machineId: string | null;
  payFromCash: boolean;
}

export type ExpenseActionResult = { ok: true } | { ok: false; message: string; uncertain?: boolean };

export interface ExpenseFilters {
  category: 'all' | ExpenseCategory;
  showVoided: boolean;
  machineId: 'all' | string;
}
