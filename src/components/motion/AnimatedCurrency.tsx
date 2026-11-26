import React, { useEffect, useRef, useState } from 'react';
import { formatCurrency } from '@/lib/formatters';
import { useAnimatedNumber } from '@/lib/motion/useAnimatedNumber';

interface AnimatedCurrencyProps {
  value: number;
  className?: string;
  /** Cuenta desde $ 0 al montarse (por ejemplo, el total al abrir el cobro). */
  fromZero?: boolean;
  /** Destello suave de color cada vez que el valor cambia. */
  pulse?: boolean;
}

/** Importe en pesos que cuenta hacia su nuevo valor y, si se pide, destella al cambiar. */
export const AnimatedCurrency: React.FC<AnimatedCurrencyProps> = ({ value, className = '', fromZero = false, pulse = false }) => {
  const shown = useAnimatedNumber(value, 260, fromZero);
  const [pulses, setPulses] = useState(0);
  const previous = useRef(value);

  useEffect(() => {
    if (pulse && previous.current !== value) setPulses((n) => n + 1);
    previous.current = value;
  }, [value, pulse]);

  return (
    <span key={pulses} className={`${className} ${pulses > 0 ? 'cart-value-pulse' : ''}`} aria-label={formatCurrency(value)}>
      {formatCurrency(shown)}
    </span>
  );
};
