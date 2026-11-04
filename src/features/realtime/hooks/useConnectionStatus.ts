import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  getRealtimeState,
  resolveConnectionStatus,
  subscribeToRealtimeState,
  type ConnectionStatus,
} from '../connectionStatus';

function readBrowserOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

/** Estado real de la conexión para mostrar en el encabezado. */
export function useConnectionStatus(): ConnectionStatus {
  const [isBrowserOnline, setIsBrowserOnline] = useState(readBrowserOnline);
  const realtime = useSyncExternalStore(subscribeToRealtimeState, getRealtimeState);

  useEffect(() => {
    const update = () => setIsBrowserOnline(readBrowserOnline());
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return resolveConnectionStatus(isBrowserOnline, realtime);
}
