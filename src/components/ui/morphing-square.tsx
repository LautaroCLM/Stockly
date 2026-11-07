import React from 'react';
import { cn } from '@/lib/utils';

interface MorphingSquareProps {
  /** Texto debajo (o arriba) de la animación. */
  message?: string;
  messagePlacement?: 'top' | 'bottom';
  /** Lado del cuadrado en píxeles. */
  size?: number;
  /** Clases del cuadrado: color de relleno o de borde. */
  className?: string;
  /** Contenido fijo en el centro (por ejemplo, un logo): no rota ni se deforma. */
  children?: React.ReactNode;
}

/**
 * Cuadrado que se transforma de forma continua: las esquinas pasan de casi rectas
 * a un círculo y vuelven, mientras gira una vuelta completa.
 *
 * Reproduce el componente "Morphing Square" de Molecule UI (21st.dev): bordes 6% → 50% → 6% y
 * rotación 0° → 360° en 4 tramos, 2,5 s en bucle, con suavizado ease-in-out en cada tramo.
 * Las animaciones están definidas en tailwind.config.js (morph-radius y morph-rotate).
 * Con "reducir movimiento" activado el cuadrado queda quieto.
 */
export const MorphingSquare: React.FC<MorphingSquareProps> = ({
  message, messagePlacement = 'bottom', size = 48, className, children,
}) => (
  <div className={cn('flex items-center justify-center gap-4', messagePlacement === 'top' ? 'flex-col-reverse' : 'flex-col')}>
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <div
        aria-hidden="true"
        className={cn('absolute inset-0 rounded-[6%] animate-morph-square motion-reduce:animate-none', className)}
      />
      {children && <div className="relative z-10 flex items-center justify-center">{children}</div>}
    </div>
    {message && <p className="text-sm text-text-muted">{message}</p>}
  </div>
);
