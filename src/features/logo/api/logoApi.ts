import { supabase } from '@/lib/supabase';
import { toUserMessage } from '@/lib/errorMessages';

export type LogoActionResult = { ok: true } | { ok: false; message: string };

/** Logo de la empresa como imagen en base64, o null si no tiene. */
export async function fetchCompanyLogo(companyId: string): Promise<string | null> {
  const { data, error } = await supabase.from('company_logos').select('image').eq('company_id', companyId).maybeSingle();
  if (error) throw new Error('No se pudo cargar el logo de la empresa.');
  return data?.image ?? null;
}

export async function saveCompanyLogoRpc(companyId: string, image: string): Promise<LogoActionResult> {
  const { error } = await supabase.rpc('set_company_logo', { p_company_id: companyId, p_image: image });
  return error ? { ok: false, message: toUserMessage(error, 'No se pudo guardar el logo.') } : { ok: true };
}

export async function removeCompanyLogoRpc(companyId: string): Promise<LogoActionResult> {
  const { error } = await supabase.rpc('remove_company_logo', { p_company_id: companyId });
  return error ? { ok: false, message: toUserMessage(error, 'No se pudo quitar el logo.') } : { ok: true };
}
