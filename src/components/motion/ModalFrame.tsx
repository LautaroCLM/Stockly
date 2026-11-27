import React from 'react';
import { m } from 'motion/react';
import { cn } from '@/lib/utils';
import { modalPanelVariants, overlayVariants } from '@/lib/motion';

interface ModalFrameProps {
  ariaLabel: string;
  /** Se llama al hacer clic en el fondo oscuro. */
  onBackdropClick?: () => void;
  /** Clases del panel (ancho máximo, bordes, etc.). */
  panelClassName?: string;
  children: React.ReactNode;
}

/**
 * Marco común de las ventanas emergentes: fondo con fundido y panel que baja unos píxeles al entrar.
 * El panel nunca supera la altura de la pantalla: un cuerpo con `min-h-0 flex-1 overflow-y-auto` (o un
 * <form> directo) se desplaza por dentro y el encabezado y el pie con los botones siempre se ven.
 * Para que también tengan salida suave, quien lo muestra debe envolverlo en <AnimatePresence>:
 * `<AnimatePresence>{open && <MiVentana />}</AnimatePresence>`. Sin eso, entra igual y se cierra al instante.
 */
export const ModalFrame: React.FC<ModalFrameProps> = ({ ariaLabel, onBackdropClick, panelClassName, children }) => (
  <m.div
    className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
    role="dialog"
    aria-modal="true"
    aria-label={ariaLabel}
    initial="hidden"
    animate="visible"
    exit="exit"
  >
    <m.div variants={overlayVariants} className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={onBackdropClick} />
    <m.div
      variants={modalPanelVariants}
      className={cn(
        'relative w-full max-w-md bg-surface border border-border rounded-2xl shadow-2xl shadow-black/90 z-10 overflow-hidden',
        // Nunca más alta que la pantalla: lo que sobra se desplaza por dentro y el encabezado y el pie quedan a la vista
        'flex flex-col max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)]',
        '[&>form]:min-h-0 [&>form]:flex-1 [&>form]:overflow-y-auto',
        panelClassName
      )}
    >
      {children}
    </m.div>
  </m.div>
);
