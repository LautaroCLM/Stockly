import { supabase } from '@/lib/supabase';
import { fetchAllRows } from '@/lib/fetchAllRows';
import type { Supplier, UpsertSupplierInput } from '../types';

/**
 * Normaliza y limpia mensajes de error arrojados por PostgreSQL / PostgREST.
 */
export function sanitizeSupplierError(err: unknown, defaultMessage: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
    return err.message.replace(/^(P0001|error):\s*/i, '').trim();
  }
  if (err instanceof Error) {
    return err.message.replace(/^(P0001|error):\s*/i, '').trim();
  }
  return defaultMessage;
}

/**
 * Consulta los proveedores registrados para la empresa activa.
 * El aislamiento multiempresa es garantizado a nivel de fila (RLS) en la base de datos.
 */
export async function fetchSuppliers(companyId: string): Promise<Supplier[]> {
  const { data, error } = await fetchAllRows((from, to) =>
    supabase
      .from('suppliers')
      .select('id, company_id, name, contact_name, email, phone, address, tax_id, is_active, created_at, updated_at')
      .eq('company_id', companyId)
      .order('name', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to)
  );

  if (error) {
    throw new Error(sanitizeSupplierError(error, 'Error al consultar proveedores de la empresa.'));
  }

  return data.map((row) => ({
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    contactName: row.contact_name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    taxId: row.tax_id,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * Crea o actualiza un proveedor utilizando la RPC transaccional autoritativa public.upsert_supplier.
 * Exclusivo para usuarios con rol master_admin en la empresa.
 */
export async function upsertSupplierRpc(params: UpsertSupplierInput): Promise<string> {
  const cleanName = params.name.trim();
  const cleanContact = params.contactName && params.contactName.trim() ? params.contactName.trim() : undefined;
  const cleanEmail = params.email && params.email.trim() ? params.email.trim() : undefined;
  const cleanPhone = params.phone && params.phone.trim() ? params.phone.trim() : undefined;
  const cleanAddress = params.address && params.address.trim() ? params.address.trim() : undefined;
  const cleanTaxId = params.taxId && params.taxId.trim() ? params.taxId.replace(/-/g, '').trim() : undefined;

  const { data, error } = await supabase.rpc('upsert_supplier', {
    p_company_id: params.companyId,
    p_name: cleanName,
    p_contact_name: cleanContact,
    p_email: cleanEmail,
    p_phone: cleanPhone,
    p_address: cleanAddress,
    p_tax_id: cleanTaxId,
    p_supplier_id: params.supplierId || undefined,
    p_is_active: params.isActive ?? true,
  });

  if (error) {
    throw new Error(sanitizeSupplierError(error, 'No se pudo guardar el proveedor.'));
  }

  if (!data) {
    throw new Error('El servidor no retornó el identificador del proveedor.');
  }

  return data;
}

/**
 * Modifica el estado activo/inactivo de un proveedor existente mediante upsert_supplier.
 */
export async function toggleSupplierStatusRpc(
  companyId: string,
  supplier: Supplier,
  isActive: boolean
): Promise<string> {
  return upsertSupplierRpc({
    companyId,
    supplierId: supplier.id,
    name: supplier.name,
    contactName: supplier.contactName,
    email: supplier.email,
    phone: supplier.phone,
    address: supplier.address,
    taxId: supplier.taxId,
    isActive,
  });
}
