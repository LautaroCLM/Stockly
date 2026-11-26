/** Resultado de una acción "Deshacer": si falla, el aviso muestra el motivo. */
export type UndoResult = { ok: true } | { ok: false; message: string };

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastInput {
  message: string;
  tone?: ToastTone;
  /** Texto secundario debajo del mensaje (por ejemplo, el total de la venta). */
  detail?: string;
  /** Acción para revertir lo que se acaba de hacer. */
  undo?: { label?: string; run: () => Promise<UndoResult> };
}

export type ToastStatus = 'idle' | 'undoing';

export interface Toast extends Required<Pick<ToastInput, 'message' | 'tone'>> {
  id: number;
  detail?: string;
  undo?: ToastInput['undo'];
  status: ToastStatus;
}

/** Como mucho se ven tres avisos; los más viejos se descartan. */
export const MAX_TOASTS = 3;

/** Tiempo en pantalla: más largo si se puede deshacer, para dar tiempo a reaccionar. */
export function toastDuration(toast: Pick<Toast, 'tone' | 'undo'>): number {
  if (toast.undo) return 8000;
  return toast.tone === 'error' ? 7000 : 4500;
}

export function pushToast(list: readonly Toast[], input: ToastInput, id: number): Toast[] {
  const toast: Toast = {
    id,
    message: input.message,
    tone: input.tone ?? 'success',
    detail: input.detail,
    undo: input.undo,
    status: 'idle',
  };
  return [...list, toast].slice(-MAX_TOASTS);
}

export function removeToast(list: readonly Toast[], id: number): Toast[] {
  return list.filter((t) => t.id !== id);
}

export function setToastStatus(list: readonly Toast[], id: number, status: ToastStatus): Toast[] {
  return list.map((t) => (t.id === id ? { ...t, status } : t));
}
