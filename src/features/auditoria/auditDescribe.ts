import type { AuditAction, AuditChange, AuditEntry } from './types';

/** Nombre en español de cada tabla auditada. */
export const AUDIT_TABLE_LABELS: Record<string, string> = {
  companies: 'Empresa',
  company_members: 'Miembro',
  company_invitations: 'Invitación',
  categories: 'Categoría',
  products: 'Producto',
  product_costs: 'Costo de producto',
  suppliers: 'Proveedor',
  customers: 'Cliente',
  sales: 'Venta',
  purchases: 'Compra',
  cash_sessions: 'Caja',
  cash_movements: 'Movimiento de caja',
};

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  INSERT: 'Alta',
  UPDATE: 'Modificación',
  DELETE: 'Baja',
};

const FIELD_LABELS: Record<string, string> = {
  name: 'nombre',
  sku: 'SKU',
  barcode: 'código de barras',
  selling_price: 'precio de venta',
  unit_cost: 'costo',
  min_stock: 'stock mínimo',
  unit: 'unidad',
  is_active: 'activo',
  status: 'estado',
  role: 'rol',
  email: 'correo',
  phone: 'teléfono',
  address: 'dirección',
  tax_id: 'CUIT',
  contact_name: 'contacto',
  description: 'descripción',
  category_id: 'categoría',
  cancel_reason: 'motivo de anulación',
  reason: 'motivo',
  opening_amount: 'fondo inicial',
  expected_amount: 'efectivo esperado',
  counted_amount: 'efectivo contado',
  difference_amount: 'diferencia',
  closing_notes: 'observación de cierre',
  amount: 'importe',
  movement_type: 'tipo',
  allow_negative_stock: 'permite stock negativo',
  document_number: 'documento',
};

/** Campos técnicos que cambian solos y no aportan al usuario. */
const IGNORED_FIELDS = new Set(['id', 'company_id', 'created_at', 'updated_at', 'created_by', 'updated_by']);

/** Campos que identifican el registro, en orden de preferencia. */
const IDENTITY_FIELDS = ['name', 'sale_number', 'purchase_number', 'email', 'sku'];

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'sí' : 'no';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Texto que identifica el registro afectado (nombre, número de documento, etc.). */
export function describeRecord(entry: Pick<AuditEntry, 'newData' | 'oldData'>): string | null {
  const data = entry.newData ?? entry.oldData;
  if (!data) return null;
  for (const field of IDENTITY_FIELDS) {
    const value = data[field];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
}

/** Campos que cambiaron en una modificación, con su valor anterior y nuevo. */
export function diffAuditData(
  oldData: Record<string, unknown> | null,
  newData: Record<string, unknown> | null
): AuditChange[] {
  if (!oldData || !newData) return [];
  const fields = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
  const changes: AuditChange[] = [];

  for (const field of fields) {
    if (IGNORED_FIELDS.has(field)) continue;
    const before = formatValue(oldData[field]);
    const after = formatValue(newData[field]);
    if (before !== after) {
      changes.push({ field: FIELD_LABELS[field] ?? field, before, after });
    }
  }
  return changes;
}

export function tableLabel(tableName: string): string {
  return AUDIT_TABLE_LABELS[tableName] ?? tableName;
}
