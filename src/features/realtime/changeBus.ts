/**
 * Canal interno de avisos de "datos cambiados".
 * La suscripción a Supabase Realtime emite acá y cada hook de datos escucha
 * las tablas que le importan para recargarse. No guarda datos: solo avisa.
 */
export type DataTable =
  | 'companies'
  | 'company_members'
  | 'company_invitations'
  | 'categories'
  | 'products'
  | 'product_costs'
  | 'stock_movements'
  | 'sales'
  | 'purchases'
  | 'suppliers'
  | 'customers'
  | 'audit_log'
  | 'cash_sessions'
  | 'cash_movements'
  | 'expenses'
  | 'customer_payments'
  | 'supplier_payments'
  | 'credit_purchases'
  | 'company_module_permissions'
  | 'machines'
  | 'documents'
  | 'document_settings'
  | 'employees'
  | 'employee_schedules'
  | 'attendance_records';

/** 'all' = recargar todo (al volver a la pestaña o recuperar la conexión). */
export type DataChange = DataTable | 'all';

type Listener = (change: DataChange) => void;

const listeners = new Set<Listener>();

export function emitDataChange(change: DataChange): void {
  listeners.forEach((listener) => listener(change));
}

export function subscribeToDataChanges(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function affectsTables(tables: readonly DataTable[], change: DataChange): boolean {
  return change === 'all' || tables.includes(change);
}
