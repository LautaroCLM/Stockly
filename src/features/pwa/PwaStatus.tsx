import React, { useEffect, useState } from 'react';
import { RefreshCw, WifiOff } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '@/components/ui/Button';

const useOnline = (): boolean => {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
};

/** Avisos de la app instalable: sin conexión y nueva versión disponible. */
export const PwaStatus: React.FC = () => {
  const online = useOnline();
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();

  if (online && !needRefresh) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-2rem)] max-w-md space-y-2" aria-live="polite">
      {!online && (
        <div role="status" className="p-3 rounded-xl bg-surface border border-warning/40 text-xs text-text-primary flex items-start gap-2 shadow-lg">
          <WifiOff size={14} className="text-warning mt-0.5 shrink-0" />
          <span>Sin conexión. No se puede vender ni cargar nada hasta que vuelva internet; lo que ves puede estar desactualizado.</span>
        </div>
      )}
      {needRefresh && (
        <div role="status" className="p-3 rounded-xl bg-surface border border-primary/40 text-xs text-text-primary flex items-center gap-2 shadow-lg">
          <RefreshCw size={14} className="text-primary shrink-0" />
          <span className="flex-1">Hay una versión nueva de Stockly.</span>
          <Button variant="primary" size="sm" onClick={() => void updateServiceWorker(true)}>Actualizar</Button>
        </div>
      )}
    </div>
  );
};
