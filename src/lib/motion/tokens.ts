/**
 * Tiempos y curvas del sistema de animaciones.
 * Deben coincidir con las variables CSS de tailwind/motionPlugin.js (--ease-out, --motion-*).
 */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export const DURATION = {
  /** Cambios de estado: hover, foco, salida de ventanas. */
  fast: 0.15,
  /** Entrada de ventanas, menús y avisos. */
  base: 0.22,
  /** Entrada de páginas y bloques. */
  page: 0.3,
} as const;

/** Desplazamiento de las entradas: siempre de arriba hacia abajo y corto. */
export const OFFSET = { y: -8 } as const;
