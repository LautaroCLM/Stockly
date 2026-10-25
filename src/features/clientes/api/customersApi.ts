import { supabase } from '@/lib/supabase';
import type { Customer, UpsertCustomerInput } from '../types';

export interface CustomerDbRow {
  id: string;
  company_id: string;
  name: string;
  identification_type: string;
  tax_id: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Normaliza y limpia mensajes de error devueltos por PostgreSQL o PostgREST.
 */
export function sanitizeCustomerError(err: unknown, defaultMessage: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
    return err.message.replace(/^(P0001|error):\s*/i, '').trim();
  }
  if (err instanceof Error) {
    return err.message.replace(/^(P0001|error):\s*/i, '').trim();
  }
  return defaultMessage;
}

/**
 * Consulta los clientes de la empresa activa.
 * El aislamiento multiempresa es garantizado a nivel de fila (RLS) en PostgreSQL.
 */
export async function fetchCustomers(companyId: string): Promise<Customer[]> {
  const { data, error } = await (supabase.from as unknown as (
    table: string
  ) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        order: (col: string, opts: { ascending: boolean }) => Promise<{
          data: CustomerDbRow[] | null;
          error: { message: string } | null;
        }>;
      };
    };
  })('customers')
    .select('id, company_id, name, identification_type, tax_id, email, phone, address, notes, is_active, created_by, created_at, updated_at')
    .eq('company_id', companyId)
    .order('name', { ascending: true });

  if (error) {
    throw new Error(sanitizeCustomerError(error, 'Error al consultar clientes de la empresa.'));
  }

  return (data || []).map((row) => ({
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    identificationType: row.identification_type as Customer['identificationType'],
    taxId: row.tax_id,
    email: row.email,
    phone: row.phone,
    address: row.address,
    notes: row.notes,
    isActive: row.is_active,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * Invoca la RPC public.upsert_customer para crear o actualizar un cliente.
 * Requiere rol master_admin en la empresa.
 */
export async function upsertCustomerRpc(params: UpsertCustomerInput): Promise<string> {
  const cleanName = params.name.trim();
  const cleanIdType = params.identificationType || 'DNI';
  const cleanTaxId = params.taxId && params.taxId.trim() ? params.taxId.trim() : null;
  const cleanEmail = params.email && params.email.trim() ? params.email.trim().toLowerCase() : null;
  const cleanPhone = params.phone && params.phone.trim() ? params.phone.trim() : null;
  const cleanAddress = params.address && params.address.trim() ? params.address.trim() : null;
  const cleanNotes = params.notes && params.notes.trim() ? params.notes.trim() : null;

  const { data, error } = await (supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>
  ) => Promise<{ data: string | null; error: { message: string } | null }>)(
    'upsert_customer',
    {
      p_company_id: params.companyId,
      p_name: cleanName,
      p_identification_type: cleanIdType,
      p_tax_id: cleanTaxId,
      p_email: cleanEmail,
      p_phone: cleanPhone,
      p_address: cleanAddress,
      p_notes: cleanNotes,
      p_customer_id: params.customerId || null,
      p_is_active: params.isActive ?? true,
    }
  );

  if (error) {
    throw new Error(sanitizeCustomerError(error, 'No se pudo guardar el cliente.'));
  }

  if (!data) {
    throw new Error('El servidor no retornó el identificador del cliente.');
  }

  return data;
}

/**
 * Modifica el estado activo/inactivo de un cliente mediante upsert_customer.
 */
export async function toggleCustomerStatusRpc(
  companyId: string,
  customer: Customer,
  isActive: boolean
): Promise<string> {
  return upsertCustomerRpc({
    companyId,
    customerId: customer.id,
    name: customer.name,
    identificationType: customer.identificationType,
    taxId: customer.taxId,
    email: customer.email,
    phone: customer.phone,
    address: customer.address,
    notes: customer.notes,
    isActive,
  });
}
