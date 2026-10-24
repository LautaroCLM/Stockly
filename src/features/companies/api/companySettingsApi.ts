import { supabase } from '@/lib/supabase';
import type { CompanySettings } from '../types';

/**
 * Normaliza y limpia mensajes de error arrojados por PostgreSQL / Supabase RPC.
 */
export function sanitizeSettingsError(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
    return err.message.replace(/^(P0001|error):\s*/i, '').trim();
  }
  if (err instanceof Error) {
    return err.message.replace(/^(P0001|error):\s*/i, '').trim();
  }
  return fallback;
}

/**
 * Consulta la configuración y políticas autorizadas de la empresa activa desde Supabase.
 * Respeta la política RLS companies_select_member.
 */
export async function fetchCompanySettings(companyId: string): Promise<CompanySettings> {
  const { data, error } = await supabase
    .from('companies')
    .select('id, name, tax_id, currency, timezone, is_active, owner_id, created_at, updated_at, allow_negative_stock')
    .eq('id', companyId)
    .single();

  if (error) {
    throw new Error(sanitizeSettingsError(error, 'Error al consultar la configuración de la empresa.'));
  }

  if (!data) {
    throw new Error('Empresa no encontrada.');
  }

  return {
    id: data.id,
    name: data.name,
    taxId: data.tax_id,
    currency: data.currency,
    timezone: data.timezone,
    isActive: Boolean(data.is_active),
    ownerId: data.owner_id,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    allowNegativeStock: Boolean(data.allow_negative_stock),
  };
}

/**
 * Actualiza la política de existencias negativas de la empresa exclusivamente a través
 * de la RPC autorizada public.set_company_negative_stock_policy.
 * Exclusivo para master_admin activo. Requiere motivo justificatorio obligatorio.
 */
export async function setNegativeStockPolicyRpc(
  companyId: string,
  allowNegativeStock: boolean,
  reason: string
): Promise<void> {
  const cleanReason = reason.trim();
  if (!cleanReason) {
    throw new Error('El motivo justificatorio es obligatorio.');
  }

  const { error } = await supabase.rpc('set_company_negative_stock_policy', {
    p_company_id: companyId,
    p_allow_negative_stock: allowNegativeStock,
    p_reason: cleanReason,
  });

  if (error) {
    throw new Error(sanitizeSettingsError(error, 'No se pudo actualizar la política de stock negativo.'));
  }
}
