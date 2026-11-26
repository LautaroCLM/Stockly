import React from 'react';
import { encodeCode128 } from '@/lib/code128';

const QUIET = 10;

/** Código de barras Code 128 en SVG (nítido al imprimir). Si el texto no se puede codificar, no dibuja nada. */
export const BarcodeSvg: React.FC<{ value: string; className?: string }> = ({ value, className }) => {
  const widths = encodeCode128(value);
  if (!widths) return null;
  const total = widths.reduce((a, b) => a + b, 0) + QUIET * 2;
  let x = QUIET;
  const bars = widths.flatMap((w, i) => {
    const rect = i % 2 === 0 ? [<rect key={i} x={x} y={0} width={w} height={40} />] : [];
    x += w;
    return rect;
  });
  return (
    <svg viewBox={`0 0 ${total} 40`} preserveAspectRatio="none" className={className} role="img" aria-label={`Código ${value}`}>
      <g fill="#000">{bars}</g>
    </svg>
  );
};
