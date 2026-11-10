import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface ErrorFallbackProps {
  scope: 'page' | 'app';
  onRetry: () => void;
}

/** Mensaje que reemplaza a una pantalla que falló. No expone detalles técnicos. */
export const ErrorFallback: React.FC<ErrorFallbackProps> = ({ scope, onRetry }) => (
  <div role="alert" className={`flex flex-col items-center justify-center text-center gap-3 p-6 ${scope === 'app' ? 'min-h-screen bg-background' : 'min-h-[50vh]'}`}>
    <AlertTriangle size={32} className="text-warning" />
    <h2 className="text-base font-bold text-text-primary">Algo salió mal</h2>
    <p className="text-xs text-text-secondary max-w-sm leading-relaxed">
      {scope === 'app'
        ? 'La aplicación tuvo un error inesperado. Tus datos están a salvo. Recargá la página para seguir trabajando.'
        : 'Esta pantalla tuvo un error inesperado. Tus datos están a salvo. Podés reintentar o ir a otra sección del menú.'}
    </p>
    <div className="flex gap-2">
      {scope === 'page' && <Button variant="secondary" size="sm" onClick={onRetry}>Reintentar</Button>}
      <Button variant="primary" size="sm" className="gap-1.5" onClick={() => window.location.reload()}>
        <RotateCcw size={14} /><span>Recargar la página</span>
      </Button>
    </div>
  </div>
);
