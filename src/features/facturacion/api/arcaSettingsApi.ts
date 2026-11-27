import { supabase } from '@/lib/supabase';
import { toUserMessage } from '@/lib/errorMessages';
import { EMPTY_ARCA_SETTINGS, type ArcaActionResult, type ArcaSettings } from '../types';

export async function fetchArcaSettings(companyId: string): Promise<ArcaSettings> {
  const { data, error } = await supabase
    .from('arca_settings')
    .select('point_of_sale, activity_start_date, gross_income_number')
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) throw new Error('No se pudieron cargar los datos de factura electrónica.');
  if (!data) return EMPTY_ARCA_SETTINGS;
  return {
    pointOfSale: data.point_of_sale,
    activityStartDate: data.activity_start_date ?? '',
    grossIncomeNumber: data.gross_income_number ?? '',
  };
}

export async function saveArcaSettingsRpc(companyId: string, s: ArcaSettings): Promise<ArcaActionResult> {
  // Los campos vacíos se mandan como null: así se borran en la base
  const { error } = await supabase.rpc('save_arca_settings', {
    p_company_id: companyId,
    p_point_of_sale: s.pointOfSale as number,
    p_activity_start_date: (s.activityStartDate || null) as string,
    p_gross_income_number: (s.grossIncomeNumber || null) as string,
  });
  if (error) return { ok: false, message: toUserMessage(error, 'No se pudieron guardar los datos de factura electrónica.') };
  return { ok: true };
}
