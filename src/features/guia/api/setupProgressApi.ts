import { supabase } from '@/lib/supabase';
import type { SetupProgress } from '../setupSteps';

type CountTable = 'employees' | 'company_members' | 'sales';

/** Cuántas filas tiene una tabla para la empresa, sin traer los datos. */
async function countRows(table: CountTable, companyId: string): Promise<number> {
  const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true }).eq('company_id', companyId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * Avance de la configuración inicial de la empresa (todo menos los productos,
 * que ya están cargados en la app). Solo lo consulta el administrador.
 */
export async function fetchSetupProgress(companyId: string): Promise<Omit<SetupProgress, 'productCount'>> {
  const [settings, logo, employeeCount, memberCount, saleCount] = await Promise.all([
    supabase.from('document_settings').select('address, phone').eq('company_id', companyId).maybeSingle(),
    supabase.from('company_logos').select('company_id').eq('company_id', companyId).maybeSingle(),
    countRows('employees', companyId),
    countRows('company_members', companyId),
    countRows('sales', companyId),
  ]);
  if (settings.error || logo.error) throw new Error('No se pudo leer el avance de la configuración.');
  return {
    hasIssuerData: Boolean(settings.data?.address?.trim() || settings.data?.phone?.trim()),
    hasLogo: logo.data !== null,
    employeeCount,
    memberCount,
    saleCount,
  };
}
