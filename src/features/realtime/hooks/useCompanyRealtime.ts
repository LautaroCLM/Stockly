import { useEffect } from 'react';
import { emitDataChange } from '../changeBus';
import { subscribeToCompanyChanges } from '../api/companyChangesApi';

/**
 * Mantiene sincronizada la empresa activa con lo que hacen otros usuarios:
 * - escucha Supabase Realtime y avisa qué tabla cambió;
 * - al volver a la pestaña, recuperar internet o reconectar el canal,
 *   pide recargar todo (pudieron perderse avisos mientras tanto).
 * Se monta una sola vez, en el nivel de la app.
 */
export function useCompanyRealtime(companyId: string): void {
  useEffect(() => {
    let hasSubscribedOnce = false;

    const unsubscribe = subscribeToCompanyChanges(
      companyId,
      (table) => emitDataChange(table),
      (status) => {
        if (status !== 'SUBSCRIBED') return;
        if (hasSubscribedOnce) emitDataChange('all');
        hasSubscribedOnce = true;
      }
    );

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') emitDataChange('all');
    };
    const handleOnline = () => emitDataChange('all');

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleOnline);

    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleOnline);
    };
  }, [companyId]);
}
