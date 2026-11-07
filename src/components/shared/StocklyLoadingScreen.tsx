import React, { useEffect, useState } from 'react';
import { MorphingSquare } from '@/components/ui/morphing-square';
import { Button } from '@/components/ui/Button';

/** Segundos tras los cuales se avisa que la carga tarda más de lo normal (no es una espera artificial). */
const SLOW_AFTER_MS = 15_000;

/**
 * Pantalla de inicio de Stockly: el logo en el centro y el Morphing Square transformándose
 * alrededor. Se muestra solo mientras la app restaura la sesión y consulta las empresas del usuario.
 * Si tarda demasiado se ofrece reintentar, para que nunca quede bloqueada sin salida.
 */
export const StocklyLoadingScreen: React.FC<{ leaving?: boolean }> = ({ leaving = false }) => {
  const [isSlow, setIsSlow] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsSlow(true), SLOW_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={`fixed inset-0 z-[100] w-full bg-bg flex flex-col items-center justify-center p-4 gap-9
        bg-[radial-gradient(ellipse_at_center,rgba(47,107,255,0.10),transparent_60%)]
        transition-opacity duration-300 ${leaving ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
    >
      <MorphingSquare
        size={132}
        className="border-2 border-primary bg-primary/10 shadow-[0_0_32px_rgba(47,107,255,0.35)]"
      >
        <img src="/stockly.png" alt="" width={64} height={64} className="w-16 h-16 object-contain select-none" draggable={false} />
      </MorphingSquare>

      <div className="text-center space-y-1.5 -mt-2">
        <p className="font-brand font-bold text-xl tracking-tight text-text-primary">Stockly</p>
        {!isSlow && <p className="text-sm text-text-muted">Preparando tu espacio de trabajo</p>}
      </div>

      {isSlow && (
        <div className="text-center space-y-3 max-w-xs">
          <p className="text-xs text-text-secondary leading-relaxed">
            Está tardando más de lo habitual. Revisá tu conexión a internet; si sigue igual, volvé a intentar.
          </p>
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>Reintentar</Button>
        </div>
      )}
    </div>
  );
};
