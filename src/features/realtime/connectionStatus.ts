/**
 * Estado de la conexión en vivo con Supabase, combinando:
 * - si el navegador tiene internet;
 * - si la suscripción de Realtime de la empresa activa está conectada.
 */
export type RealtimeState = 'connecting' | 'connected' | 'error';
export type ConnectionStatus = 'online' | 'connecting' | 'offline' | 'degraded';

let realtimeState: RealtimeState = 'connecting';
const listeners = new Set<() => void>();

export function setRealtimeState(next: RealtimeState): void {
  if (next === realtimeState) return;
  realtimeState = next;
  listeners.forEach((listener) => listener());
}

export function getRealtimeState(): RealtimeState {
  return realtimeState;
}

export function subscribeToRealtimeState(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Sin internet manda; con internet, el estado de Realtime define el resto. */
export function resolveConnectionStatus(isBrowserOnline: boolean, realtime: RealtimeState): ConnectionStatus {
  if (!isBrowserOnline) return 'offline';
  if (realtime === 'connected') return 'online';
  if (realtime === 'connecting') return 'connecting';
  return 'degraded';
}
