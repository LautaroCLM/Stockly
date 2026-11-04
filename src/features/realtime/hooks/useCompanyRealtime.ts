import { useEffect } from 'react';
import { emitDataChange } from '../changeBus';
import { setRealtimeState } from '../connectionStatus';
import { subscribeToCompanyChanges } from '../api/companyChangesApi';

/**
 * Mantiene sincronizada la empresa activa con lo que hacen otros usuarios:
 * - escucha Supabase Realtime y avisa qué tabla cambió;
 * - al volver a la pestaña, recuperar internet o reconectar el canal,
 *   pide recargar todo (pudieron perderse avisos mientras tanto);
 * - informa el estado de la conexión en vivo para el encabezado.
 * Se monta una sola vez, en el nivel de la app.
 */
export function useCompanyRealtime(companyId: string): void {
  useEffect(() => {
    let hasSubscribedOnce = false;
    let isActive = true;
    setRealtimeState('connecting');

    const unsubscribe = subscribeToCompanyChanges(
      companyId,
      (table) => emitDataChange(table),
      (status) => {
        if (!isActive) return;
        if (status === 'SUBSCRIBED') {
          setRealtimeState('connected');
          if (hasSubscribedOnce) emitDataChange('all');
          hasSubscribedOnce = true;
          return;
        }
        setRealtimeState('error');
      }
    );

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') emitDataChange('all');
    };
    const handleOnline = () => emitDataChange('all');

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleOnline);

    return () => {
      isActive = false;
      unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleOnline);
    };
  }, [companyId]);
}
