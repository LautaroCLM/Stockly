import React from 'react';
import { LazyMotion, MotionConfig, domAnimation } from 'motion/react';

/**
 * Configuración global de Motion para toda la app:
 *  - LazyMotion con domAnimation: carga solo lo necesario (animaciones y salida), sin gestos ni arrastre.
 *  - reducedMotion="user": con "reducir movimiento" activado, Motion omite los desplazamientos y escalas.
 */
export const MotionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <LazyMotion features={domAnimation} strict>
    <MotionConfig reducedMotion="user">{children}</MotionConfig>
  </LazyMotion>
);
