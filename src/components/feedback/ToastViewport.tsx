import React from 'react';
import { AnimatePresence, m } from 'motion/react';
import { AlertTriangle, CheckCircle2, Info, Loader2, Undo2, X } from 'lucide-react';
import type { Toast } from './toastQueue';

interface ToastViewportProps {
  toasts: Toast[];
  onDismiss: (id: number) => void;
  onUndo: (toast: Toast) => void;
  onPause: (id: number) => void;
  onResume: (toast: Toast) => void;
}

const TONE = {
  success: { icon: CheckCircle2, className: 'text-success' },
  error: { icon: AlertTriangle, className: 'text-danger' },
  info: { icon: Info, className: 'text-accent' },
} as const;

/** Pila de avisos abajo a la derecha (abajo al centro en pantallas chicas). */
export const ToastViewport: React.FC<ToastViewportProps> = ({ toasts, onDismiss, onUndo, onPause, onResume }) => (
  <div aria-live="polite" aria-label="Avisos"
    className="fixed z-[70] bottom-4 left-4 right-4 sm:left-auto sm:w-96 flex flex-col gap-2 pointer-events-none">
    <AnimatePresence initial={false}>
      {toasts.map((toast) => {
        const { icon: Icon, className } = TONE[toast.tone];
        const isUndoing = toast.status === 'undoing';
        return (
          <m.div key={toast.id} role={toast.tone === 'error' ? 'alert' : 'status'}
            initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            onMouseEnter={() => onPause(toast.id)} onMouseLeave={() => !isUndoing && onResume(toast)}
            className="pointer-events-auto flex items-start gap-3 p-3 pr-2 rounded-xl bg-surface border border-border shadow-2xl shadow-black/60">
            <Icon size={17} className={`shrink-0 mt-0.5 ${className}`} aria-hidden />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-text-primary">{toast.message}</p>
              {toast.detail && <p className="text-[11px] text-text-muted mt-0.5">{toast.detail}</p>}
            </div>
            {toast.undo && (
              <button type="button" onClick={() => onUndo(toast)} disabled={isUndoing}
                className="shrink-0 h-7 px-2.5 rounded-lg text-[11px] font-semibold text-primary hover:bg-primary/10 flex items-center gap-1 disabled:opacity-60">
                {isUndoing ? <Loader2 size={13} className="animate-spin" /> : <Undo2 size={13} />}
                <span>{isUndoing ? 'Deshaciendo…' : toast.undo.label ?? 'Deshacer'}</span>
              </button>
            )}
            <button type="button" onClick={() => onDismiss(toast.id)} disabled={isUndoing} aria-label="Cerrar aviso"
              className="shrink-0 p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-2 disabled:opacity-40">
              <X size={14} />
            </button>
          </m.div>
        );
      })}
    </AnimatePresence>
  </div>
);
