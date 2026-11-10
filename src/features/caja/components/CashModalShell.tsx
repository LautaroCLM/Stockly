import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { ModalFrame } from '@/components/motion/ModalFrame';

interface CashModalShellProps {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  isBusy: boolean;
  onClose: () => void;
  /** Clases del panel, por ejemplo un ancho mayor para formularios largos. */
  panelClassName?: string;
  children: React.ReactNode;
}

/** Marco común de los diálogos de caja: fondo, encabezado y cierre con Escape. */
export const CashModalShell: React.FC<CashModalShellProps> = ({ title, subtitle, icon, isBusy, onClose, panelClassName, children }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isBusy) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isBusy, onClose]);

  return (
    <ModalFrame ariaLabel={title} onBackdropClick={() => !isBusy && onClose()} panelClassName={panelClassName}>
      <div className="p-4 px-6 border-b border-border flex items-center justify-between bg-surface-2/50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/25 flex items-center justify-center text-primary">
            {icon}
          </div>
          <div>
            <h2 className="text-base font-bold text-text-primary">{title}</h2>
            {subtitle && <span className="text-xs text-text-muted">{subtitle}</span>}
          </div>
        </div>
        <button
          onClick={onClose}
          disabled={isBusy}
          className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2 disabled:opacity-50"
          aria-label="Cerrar"
        >
          <X size={18} />
        </button>
      </div>
      {children}
    </ModalFrame>
  );
};

/** Mensaje de error dentro de un diálogo; ámbar si el resultado es incierto. */
export const CashFormError: React.FC<{ message: string | null; uncertain?: boolean }> = ({ message, uncertain }) =>
  message ? (
    <div
      role="alert"
      className={`p-3 rounded-xl border text-xs leading-relaxed ${
        uncertain ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-danger/10 border-danger/25 text-danger'
      }`}
    >
      {message}
    </div>
  ) : null;

export const CASH_FIELD_CLASS =
  'w-full p-2.5 text-xs bg-surface-2 border border-border focus:border-primary rounded-lg text-text-primary focus:outline-none disabled:opacity-50';
