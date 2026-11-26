import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { pushToast, removeToast, setToastStatus, toastDuration, type Toast, type ToastInput } from './toastQueue';
import { ToastViewport } from './ToastViewport';

interface ToastApi {
  notify: (input: ToastInput) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Avisos breves de toda la app (abajo a la derecha), con opción de deshacer. */
export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((list) => removeToast(list, id));
  }, []);

  const schedule = useCallback((toast: Pick<Toast, 'id' | 'tone' | 'undo'>) => {
    const old = timers.current.get(toast.id);
    if (old) clearTimeout(old);
    timers.current.set(toast.id, setTimeout(() => dismiss(toast.id), toastDuration(toast)));
  }, [dismiss]);

  const notify = useCallback((input: ToastInput) => {
    const id = nextId.current++;
    setToasts((list) => pushToast(list, input, id));
    schedule({ id, tone: input.tone ?? 'success', undo: input.undo });
  }, [schedule]);

  // Mientras el mouse está encima, el aviso no se va
  const pause = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const undo = useCallback(async (toast: Toast) => {
    if (!toast.undo || toast.status === 'undoing') return;
    pause(toast.id);
    setToasts((list) => setToastStatus(list, toast.id, 'undoing'));
    const result = await toast.undo.run().catch(() => ({ ok: false as const, message: 'No se pudo deshacer. Intentá de nuevo.' }));
    dismiss(toast.id);
    notify(result.ok ? { message: 'Listo, se deshizo.', tone: 'info' } : { message: result.message, tone: 'error' });
  }, [dismiss, notify, pause]);

  useEffect(() => {
    const active = timers.current;
    return () => active.forEach(clearTimeout);
  }, []);

  const api = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} onUndo={(t) => void undo(t)} onPause={pause} onResume={schedule} />
    </ToastContext.Provider>
  );
};

/** Muestra un aviso. Fuera del proveedor (por ejemplo, en pruebas) no hace nada. */
export function useToast(): ToastApi {
  return useContext(ToastContext) ?? NOOP;
}

const NOOP: ToastApi = { notify: () => undefined };
