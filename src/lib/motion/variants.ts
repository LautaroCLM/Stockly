import type { Variants } from 'motion/react';
import { DURATION, EASE_OUT, OFFSET } from './tokens';

/** Fondo oscuro de una ventana: solo opacidad. */
export const overlayVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: DURATION.base, ease: EASE_OUT } },
  exit: { opacity: 0, transition: { duration: DURATION.fast, ease: EASE_OUT } },
};

/** Panel de una ventana: baja unos píxeles mientras aparece; al salir se desvanece. */
export const modalPanelVariants: Variants = {
  hidden: { opacity: 0, y: OFFSET.y, scale: 0.985 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: DURATION.base, ease: EASE_OUT } },
  exit: { opacity: 0, y: OFFSET.y / 2, scale: 0.99, transition: { duration: DURATION.fast, ease: EASE_OUT } },
};

/** Menú desplegable o popover. */
export const popoverVariants: Variants = {
  hidden: { opacity: 0, y: OFFSET.y / 2 },
  visible: { opacity: 1, y: 0, transition: { duration: DURATION.fast, ease: EASE_OUT } },
  exit: { opacity: 0, y: OFFSET.y / 2, transition: { duration: DURATION.fast, ease: EASE_OUT } },
};

/** Bloque de contenido que aparece (por ejemplo, un aviso o un panel que se abre). */
export const fadeDownVariants: Variants = {
  hidden: { opacity: 0, y: OFFSET.y },
  visible: { opacity: 1, y: 0, transition: { duration: DURATION.page, ease: EASE_OUT } },
  exit: { opacity: 0, transition: { duration: DURATION.fast, ease: EASE_OUT } },
};

/** Contenedor que escalona la aparición de sus hijos (motion) de arriba hacia abajo. */
export const staggerContainerVariants = (stagger = 0.04, delayChildren = 0): Variants => ({
  hidden: {},
  visible: { transition: { staggerChildren: stagger, delayChildren } },
});

/** Panel lateral que entra desde la derecha y sale hacia el mismo lado. */
export const drawerRightVariants: Variants = {
  hidden: { x: '100%' },
  visible: { x: 0, transition: { duration: DURATION.base, ease: EASE_OUT } },
  exit: { x: '100%', transition: { duration: DURATION.fast, ease: EASE_OUT } },
};
