import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { DataTable } from '../changeBus';

/** Tablas con columna company_id que se escuchan filtradas por empresa. */
export const COMPANY_SCOPED_TABLES: readonly DataTable[] = [
  'company_members',
  'company_invitations',
  'categories',
  'products',
  'product_costs',
  'stock_movements',
  'sales',
  'purchases',
  'suppliers',
  'customers',
  'audit_log',
];

export type ChannelStatus = 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR';

/**
 * Abre un canal de Realtime con los cambios de una empresa.
 * RLS se aplica del lado de Supabase: solo llegan filas que el usuario puede leer.
 * Devuelve la función para cerrar el canal.
 */
export function subscribeToCompanyChanges(
  companyId: string,
  onChange: (table: DataTable) => void,
  onStatus: (status: ChannelStatus) => void
): () => void {
  let channel: RealtimeChannel = supabase.channel(`company-changes:${companyId}`);

  for (const table of COMPANY_SCOPED_TABLES) {
    channel = channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table, filter: `company_id=eq.${companyId}` },
      () => onChange(table)
    );
  }

  channel = channel.on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'companies', filter: `id=eq.${companyId}` },
    () => onChange('companies')
  );

  channel.subscribe((status) => onStatus(status as ChannelStatus));

  return () => {
    void supabase.removeChannel(channel);
  };
}
