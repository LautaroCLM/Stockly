import { supabase } from '@/lib/supabase';
import { EMPTY_ARCA_STATUS, type ArcaActionResult, type ArcaFunctionAction, type ArcaStatus } from '../types';

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);

/** Lee el estado con get_arca_status y lo valida campo por campo. */
export function toArcaStatus(raw: unknown): ArcaStatus {
  if (typeof raw !== 'object' || raw === null) return EMPTY_ARCA_STATUS;
  const r = raw as Record<string, unknown>;
  return {
    environment: r.environment === 'produccion' ? 'produccion' : 'homologacion',
    hasCsr: r.hasCsr === true,
    csrPem: str(r.csrPem),
    hasCertificate: r.hasCertificate === true,
    certificateExpiresAt: str(r.certificateExpiresAt),
    certificateSubject: str(r.certificateSubject),
    lastTestAt: str(r.lastTestAt),
    lastTestOk: bool(r.lastTestOk),
    lastTestMessage: str(r.lastTestMessage),
  };
}

export async function fetchArcaStatus(companyId: string): Promise<ArcaStatus> {
  const { data, error } = await supabase.rpc('get_arca_status', { p_company_id: companyId });
  if (error) throw new Error('No se pudo cargar el estado de la conexión con ARCA.');
  return toArcaStatus(data);
}

export type ArcaFunctionResult = ArcaActionResult & { data?: Record<string, unknown> };

/** Llama a la Edge Function `arca`. Siempre responde ok/mensaje, salvo que falle la red. */
export async function invokeArca(
  action: ArcaFunctionAction, companyId: string, extra: Record<string, string> = {}
): Promise<ArcaFunctionResult> {
  const { data, error } = await supabase.functions.invoke('arca', { body: { action, companyId, ...extra } });
  if (error || typeof data !== 'object' || data === null) {
    return { ok: false, message: 'No se pudo conectar con el servicio de factura electrónica. Revisá tu conexión y probá de nuevo.' };
  }
  const r = data as Record<string, unknown>;
  const message = typeof r.message === 'string' ? r.message : 'Respuesta inesperada del servicio.';
  if (r.ok !== true) return { ok: false, message };
  const payload = typeof r.data === 'object' && r.data !== null ? (r.data as Record<string, unknown>) : undefined;
  return { ok: true, data: payload };
}
