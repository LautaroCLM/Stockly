import { describe, expect, it } from 'vitest';
import { MAX_TOASTS, pushToast, removeToast, setToastStatus, toastDuration } from './toastQueue';

const undo = { run: async () => ({ ok: true as const }) };

describe('pushToast', () => {
  it('agrega con tono "success" por defecto y estado inicial', () => {
    const list = pushToast([], { message: 'Venta registrada' }, 1);
    expect(list).toEqual([{ id: 1, message: 'Venta registrada', tone: 'success', detail: undefined, undo: undefined, status: 'idle' }]);
  });

  it('descarta los más viejos al superar el máximo', () => {
    let list = pushToast([], { message: 'a' }, 1);
    for (let id = 2; id <= MAX_TOASTS + 2; id++) list = pushToast(list, { message: String(id) }, id);
    expect(list).toHaveLength(MAX_TOASTS);
    expect(list[0].id).toBe(3);
    expect(list[list.length - 1].id).toBe(MAX_TOASTS + 2);
  });
});

describe('removeToast y setToastStatus', () => {
  it('quita solo el aviso indicado y marca el que se está deshaciendo', () => {
    const list = pushToast(pushToast([], { message: 'a' }, 1), { message: 'b', undo }, 2);
    expect(removeToast(list, 1).map((t) => t.id)).toEqual([2]);
    expect(setToastStatus(list, 2, 'undoing')[1].status).toBe('undoing');
    expect(setToastStatus(list, 2, 'undoing')[0].status).toBe('idle');
  });
});

describe('toastDuration', () => {
  it('da más tiempo a los avisos con Deshacer y a los errores', () => {
    expect(toastDuration({ tone: 'success', undo })).toBe(8000);
    expect(toastDuration({ tone: 'error' })).toBe(7000);
    expect(toastDuration({ tone: 'success' })).toBe(4500);
  });
});
