import React from 'react';
import { Loader2, WifiOff, Zap, AlertTriangle } from 'lucide-react';
import { useConnectionStatus } from '@/features/realtime/hooks/useConnectionStatus';
import type { ConnectionStatus } from '@/features/realtime/connectionStatus';

const STATUS_META: Record<
  ConnectionStatus,
  { label: string; title: string; className: string; icon: React.ReactNode }
> = {
  online: {
    label: 'En línea',
    title: 'Conectado: los cambios de otros usuarios aparecen al instante.',
    className: 'text-text-muted',
    icon: <Zap size={12} className="text-emerald-400" />,
  },
  connecting: {
    label: 'Conectando…',
    title: 'Estableciendo la conexión en vivo con el servidor.',
    className: 'text-text-muted',
    icon: <Loader2 size={12} className="animate-spin text-primary" />,
  },
  degraded: {
    label: 'Sin actualización en vivo',
    title: 'Hay internet, pero la conexión en vivo falló. Los datos se actualizan al volver a la pestaña o con "Actualizar".',
    className: 'text-warning',
    icon: <AlertTriangle size={12} className="text-warning" />,
  },
  offline: {
    label: 'Sin conexión',
    title: 'No hay internet. Las operaciones no se pueden guardar hasta recuperar la conexión.',
    className: 'text-danger',
    icon: <WifiOff size={12} className="text-danger" />,
  },
};

/** Indicador del encabezado con el estado real de la conexión. */
export const ConnectionBadge: React.FC = () => {
  const status = useConnectionStatus();
  const meta = STATUS_META[status];

  return (
    <div
      role="status"
      title={meta.title}
      className={`flex items-center gap-2 px-2.5 py-1 rounded-full bg-surface-2/60 border border-border/60 text-[11px] ${meta.className}`}
    >
      {meta.icon}
      <span className={status === 'online' || status === 'connecting' ? 'hidden xl:inline' : ''}>{meta.label}</span>
    </div>
  );
};
